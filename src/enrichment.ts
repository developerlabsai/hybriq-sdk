/**
 * SDK Enrichment module -- Enrich contacts/accounts with cross-tenant caching.
 */
import type { HybrIQApiClient } from "./client.js";
import type { EnrichRequest, EnrichResult } from "./types.js";

interface EnrichResponse {
  cacheHit: boolean;
  data?: Record<string, unknown>;
  provider: string;
  confidence?: number;
  creditsCharged?: number;
  executionId?: string;
  creditsReserved?: number;
}

export async function enrich(
  apiClient: HybrIQApiClient,
  request: EnrichRequest,
  providerCallback?: (req: EnrichRequest) => Promise<Record<string, unknown>>
): Promise<EnrichResult> {
  // First call: check cache
  const response = await apiClient.post<EnrichResponse>("/api/v1/enrich", {
    entityType: request.entityType,
    lookupKey: request.lookupKey,
    provider: request.provider,
    enrichedData: request.enrichedData,
    isolateTenant: request.isolateTenant,
  });

  if (response.cacheHit || response.data) {
    return {
      cacheHit: response.cacheHit,
      data: response.data,
      provider: response.provider ?? request.provider,
      confidence: response.confidence,
      creditsCharged: response.creditsCharged ?? 0,
      executionId: response.executionId,
    };
  }

  // Cache miss without data -- call provider if callback provided
  if (providerCallback && !request.enrichedData) {
    const enrichedData = await providerCallback(request);

    // Second call: store enriched data
    const storeResponse = await apiClient.post<EnrichResponse>("/api/v1/enrich", {
      entityType: request.entityType,
      lookupKey: request.lookupKey,
      provider: request.provider,
      enrichedData,
      isolateTenant: request.isolateTenant,
    });

    return {
      cacheHit: false,
      data: enrichedData,
      provider: request.provider,
      creditsCharged: storeResponse.creditsCharged ?? 0,
      executionId: storeResponse.executionId,
    };
  }

  return {
    cacheHit: false,
    provider: request.provider,
    creditsCharged: 0,
    executionId: response.executionId,
  };
}
