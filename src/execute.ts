/**
 * Execute flow — Cache-wrapped LLM execution.
 *
 * Flow:
 *   1. POST /execute/start (reserve credits + cache check)
 *   2. If cache hit: return immediately
 *   3. If cache miss: call LLM locally via provider
 *   4. POST /execute/complete (finalize credits + store cache)
 *
 * Degraded mode: if HybrIQ API is unreachable, falls back to direct LLM call.
 */

import type { HybrIQApiClient } from "./client.js";
import type {
  ExecuteRequest,
  ExecuteResult,
  ProviderConfig,
  LLMRequest,
  LLMResponse,
  HybrIQError,
} from "./types.js";
import { callAnthropic } from "./providers/anthropic.js";
import { callOpenAI } from "./providers/openai.js";

interface StartResponse {
  executionId: string;
  cacheHit: boolean;
  cacheType?: "exact" | "semantic";
  response?: string;
  tokensIn?: number;
  tokensOut?: number;
  creditsCharged?: number;
  creditsReserved?: number;
  remainingCredits: number;
}

interface CompleteResponse {
  executionId: string;
  status: string;
  creditsCharged: number;
  remainingCredits: number;
}

/**
 * Determines the provider from a model name.
 */
function resolveProvider(model: string): "anthropic" | "openai" {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt")) return "openai";
  // Default to anthropic
  return "anthropic";
}

/**
 * Executes an LLM call with cache wrapping and credit metering.
 */
export async function execute(
  apiClient: HybrIQApiClient,
  providers: { anthropic?: ProviderConfig; openai?: ProviderConfig },
  request: ExecuteRequest
): Promise<ExecuteResult> {
  const providerName = resolveProvider(request.model);
  const providerConfig = providers[providerName];

  // Step 1: Try to start execution via HybrIQ API
  let startResponse: StartResponse;
  try {
    startResponse = await apiClient.post<StartResponse>(
      "/api/v1/execute/start",
      {
        executionType: "llm_call",
        modelProvider: providerName,
        modelName: request.model,
        systemPrompt: request.systemPrompt,
        messages: request.messages,
        agentId: request.agentId,
        skillId: request.skillId,
        shareable: request.shareable ?? false,
        metadata: request.metadata,
      }
    );
  } catch (err) {
    // Check if this is a network error (API unreachable)
    const hybriqErr = err as HybrIQError;
    if (hybriqErr.statusCode === 0 && hybriqErr.code === "NETWORK_ERROR") {
      return executeDegraded(providerName, providerConfig, request);
    }
    throw err;
  }

  // Step 2: Cache hit — return immediately
  if (startResponse.cacheHit && startResponse.response) {
    return {
      executionId: startResponse.executionId,
      response: startResponse.response,
      cacheHit: true,
      cacheType: startResponse.cacheType,
      tokensIn: startResponse.tokensIn ?? 0,
      tokensOut: startResponse.tokensOut ?? 0,
      creditsCharged: startResponse.creditsCharged ?? 0,
      remainingCredits: startResponse.remainingCredits,
      modelProvider: providerName,
      modelName: request.model,
    };
  }

  // Step 3: Cache miss — call LLM locally
  if (!providerConfig) {
    throw new Error(
      `No ${providerName} provider configured. Add it to HybrIQSDK providers config.`
    );
  }

  const llmRequest: LLMRequest = {
    model: request.model,
    systemPrompt: request.systemPrompt,
    messages: request.messages,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  };

  let llmResponse: LLMResponse;
  try {
    llmResponse =
      providerName === "anthropic"
        ? await callAnthropic(providerConfig, llmRequest)
        : await callOpenAI(providerConfig, llmRequest);
  } catch (llmErr) {
    // Report failure to HybrIQ (credits refunded)
    try {
      await apiClient.post<CompleteResponse>("/api/v1/execute/complete", {
        executionId: startResponse.executionId,
        status: "failed",
        error: llmErr instanceof Error ? llmErr.message : "LLM call failed",
      });
    } catch {
      // Best-effort reporting
    }
    throw llmErr;
  }

  // Step 4: Report completion to HybrIQ
  let completeResponse: CompleteResponse;
  try {
    completeResponse = await apiClient.post<CompleteResponse>(
      "/api/v1/execute/complete",
      {
        executionId: startResponse.executionId,
        status: "completed",
        response: llmResponse.content,
        tokensIn: llmResponse.tokensIn,
        tokensOut: llmResponse.tokensOut,
        costUsd: llmResponse.costUsd,
        durationMs: llmResponse.durationMs,
        systemPrompt: request.systemPrompt,
        messages: request.messages,
        modelProvider: llmResponse.modelProvider,
        modelName: llmResponse.modelName,
        shareable: request.shareable ?? false,
      }
    );
  } catch {
    // Best-effort — execution succeeded even if reporting fails
    completeResponse = {
      executionId: startResponse.executionId,
      status: "completed",
      creditsCharged: startResponse.creditsReserved ?? 1,
      remainingCredits: startResponse.remainingCredits,
    };
  }

  return {
    executionId: startResponse.executionId,
    response: llmResponse.content,
    cacheHit: false,
    tokensIn: llmResponse.tokensIn,
    tokensOut: llmResponse.tokensOut,
    creditsCharged: completeResponse.creditsCharged,
    remainingCredits: completeResponse.remainingCredits,
    modelProvider: llmResponse.modelProvider,
    modelName: llmResponse.modelName,
  };
}

/**
 * Degraded mode: falls back to direct LLM call when HybrIQ API is unreachable.
 */
async function executeDegraded(
  providerName: "anthropic" | "openai",
  providerConfig: ProviderConfig | undefined,
  request: ExecuteRequest
): Promise<ExecuteResult> {
  console.warn("HybrIQ unreachable — running in degraded mode");

  if (!providerConfig) {
    throw new Error(
      `No ${providerName} provider configured and HybrIQ API is unreachable.`
    );
  }

  const llmRequest: LLMRequest = {
    model: request.model,
    systemPrompt: request.systemPrompt,
    messages: request.messages,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  };

  const llmResponse =
    providerName === "anthropic"
      ? await callAnthropic(providerConfig, llmRequest)
      : await callOpenAI(providerConfig, llmRequest);

  return {
    executionId: "degraded",
    response: llmResponse.content,
    cacheHit: false,
    tokensIn: llmResponse.tokensIn,
    tokensOut: llmResponse.tokensOut,
    creditsCharged: 0,
    remainingCredits: -1,
    modelProvider: llmResponse.modelProvider,
    modelName: llmResponse.modelName,
    degraded: true,
  };
}
