/**
 * MSW request handlers — mock the HybrIQ API for unit/contract tests.
 *
 * These handlers simulate the real API responses so unit tests
 * never hit a live server. Update these when API contracts change.
 */

import { http, HttpResponse } from "msw";

const BASE_URL = "http://localhost:3000";

/** Valid test API key. */
export const TEST_API_KEY = "hiq_test_abc123";

/** Simulated tenant balance state. */
let mockBalance = 1000;

export const handlers = [
  // ── Execute ──────────────────────────────────────────────────

  /** POST /api/v1/execute/start — reserve credits, check cache. */
  http.post(`${BASE_URL}/api/v1/execute/start`, async ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${TEST_API_KEY}`) {
      return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const cacheHit = body.model === "cached-model";

    if (cacheHit) {
      return HttpResponse.json({
        executionId: "exec-cached-001",
        cacheHit: true,
        cacheType: "exact",
        response: "Cached response",
        tokensIn: 10,
        tokensOut: 20,
        creditsCharged: 0,
        remainingCredits: mockBalance,
        modelProvider: "anthropic",
        modelName: "cached-model",
      });
    }

    return HttpResponse.json({
      executionId: "exec-new-001",
      cacheHit: false,
      creditsReserved: 5,
      remainingCredits: mockBalance - 5,
    });
  }),

  /** POST /api/v1/execute/complete — finalize credits after LLM call. */
  http.post(`${BASE_URL}/api/v1/execute/complete`, async () => {
    mockBalance -= 5;
    return HttpResponse.json({
      executionId: "exec-new-001",
      creditsCharged: 5,
      remainingCredits: mockBalance,
    });
  }),

  // ── Billing ──────────────────────────────────────────────────

  /** GET /api/v1/billing/balance */
  http.get(`${BASE_URL}/api/v1/billing/balance`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${TEST_API_KEY}`) {
      return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return HttpResponse.json({
      creditBalance: mockBalance,
      creditsPurchased: 5000,
      plan: "pro",
      billingCycleStart: "2026-03-01",
      billingCycleEnd: "2026-03-31",
    });
  }),

  /** GET /api/v1/billing/plans */
  http.get(`${BASE_URL}/api/v1/billing/plans`, () => {
    return HttpResponse.json([
      {
        id: "free",
        name: "free",
        displayName: "Free",
        monthlyCredits: 100,
        priceUsd: 0,
        apiRateLimit: 10,
        semanticCacheEnabled: false,
        crossTenantCache: false,
      },
      {
        id: "pro",
        name: "pro",
        displayName: "Pro",
        monthlyCredits: 10000,
        priceUsd: 49,
        apiRateLimit: 100,
        semanticCacheEnabled: true,
        crossTenantCache: true,
      },
    ]);
  }),

  /** GET /api/v1/billing/usage */
  http.get(`${BASE_URL}/api/v1/billing/usage`, () => {
    return HttpResponse.json({
      period: { start: "2026-03-01", end: "2026-03-31" },
      totalExecutions: 150,
      cacheHits: 90,
      cacheMisses: 60,
      cacheHitRate: 0.6,
      creditsUsed: 300,
      creditsByType: { execute: 250, enrich: 50 },
      costUsd: 15.0,
    });
  }),

  // ── Library ──────────────────────────────────────────────────

  /** GET /api/v1/library/agents */
  http.get(`${BASE_URL}/api/v1/library/agents`, () => {
    return HttpResponse.json([
      {
        id: "agent-1",
        name: "Research Agent",
        description: "Researches topics",
        type: "agent",
        version: "1.0.0",
        category: "research",
        tags: ["research", "ai"],
        visibility: "public",
      },
    ]);
  }),

  /** GET /api/v1/library/skills */
  http.get(`${BASE_URL}/api/v1/library/skills`, () => {
    return HttpResponse.json([
      {
        id: "skill-1",
        name: "Summarizer",
        description: "Summarizes text",
        type: "skill",
        version: "1.0.0",
        visibility: "public",
      },
    ]);
  }),

  // ── Agents ───────────────────────────────────────────────────

  /** POST /api/v1/agents/:id/run — synchronous agent execution. */
  http.post(`${BASE_URL}/api/v1/agents/:id/run`, async ({ params }) => {
    const agentId = params.id;
    return HttpResponse.json({
      executionId: `exec-agent-${agentId}`,
      status: "completed",
      response: {
        content: `Agent ${agentId} response`,
        cacheHit: false,
        tokensIn: 50,
        tokensOut: 100,
      },
      cost: { usd: 0.002, durationMs: 450 },
    });
  }),

  // ── Enrichment ───────────────────────────────────────────────

  /** POST /api/v1/enrich */
  http.post(`${BASE_URL}/api/v1/enrich`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const hasData = !!body.enrichedData;

    return HttpResponse.json({
      cacheHit: !hasData,
      data: hasData ? body.enrichedData : { name: "Cached Contact" },
      provider: body.provider ?? "clearbit",
      confidence: 0.95,
      creditsCharged: hasData ? 1 : 0,
      executionId: "exec-enrich-001",
    });
  }),
];

/**
 * Reset mock state between tests.
 */
export function resetMockState(): void {
  mockBalance = 1000;
}
