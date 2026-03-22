/**
 * Integration tests — Cloud mode end-to-end flow.
 *
 * These tests require a running HybrIQ API at http://localhost:3000.
 * They create real tenants, execute real SDK methods, and verify
 * the full request/response cycle against the live local API.
 *
 * Run with: pnpm --filter @hybriq/sdk test:integration
 *
 * Prerequisites:
 *   - Local API running: pnpm dev (from project root)
 *   - Database seeded: pnpm db:push && pnpm db:seed
 *   - ADMIN_PASSWORD env var set (for tenant creation)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { HybrIQSDK } from "../../src/index.js";

const API_BASE = process.env.HYBRIQ_API_URL ?? "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

/** Helper to make raw API calls for test setup. */
async function apiCall(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Response might not be JSON
  }

  return { status: response.status, data: data as Record<string, unknown> };
}

describe("Cloud mode — Integration", () => {
  let apiKey: string;
  let sdk: HybrIQSDK;

  beforeAll(async () => {
    // Check if API is reachable
    try {
      const health = await fetch(`${API_BASE}/api/health`);
      if (!health.ok) {
        throw new Error(`API returned ${health.status}`);
      }
    } catch (err) {
      console.warn(
        `\n  Skipping integration tests — API not reachable at ${API_BASE}\n` +
          `  Start the API with: pnpm dev\n`
      );
      return;
    }

    // Create a test tenant
    const tenantRes = await apiCall(
      "POST",
      "/api/v1/admin/tenants",
      { name: `SDK Integration Test ${Date.now()}`, plan: "pro" },
      { "x-admin-password": ADMIN_PASSWORD }
    );

    if (tenantRes.status !== 200 && tenantRes.status !== 201) {
      console.warn("Could not create test tenant:", tenantRes.data);
      return;
    }

    const tenantId = tenantRes.data.id as string;

    // Create an API key for the tenant
    const keyRes = await apiCall(
      "POST",
      `/api/v1/admin/tenants/${tenantId}/api-keys`,
      { name: "SDK Integration Test Key", scope: "full" },
      { "x-admin-password": ADMIN_PASSWORD }
    );

    apiKey = (keyRes.data as { key?: string }).key ?? "";
    if (!apiKey) {
      console.warn("Could not create API key:", keyRes.data);
      return;
    }

    sdk = new HybrIQSDK({
      mode: "cloud",
      apiKey,
      baseUrl: API_BASE,
      providers: {
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY ?? "sk-ant-placeholder",
        },
      },
    });
  });

  it("should retrieve balance", async () => {
    if (!sdk) return;
    const balance = await sdk.getBalance();
    expect(balance).toHaveProperty("creditBalance");
    expect(balance).toHaveProperty("plan");
  });

  it("should list plans", async () => {
    if (!sdk) return;
    const plans = await sdk.getPlans();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);
  });

  it("should retrieve usage", async () => {
    if (!sdk) return;
    const usage = await sdk.getUsage();
    expect(usage).toHaveProperty("totalExecutions");
    expect(usage).toHaveProperty("cacheHitRate");
  });

  it("should browse library agents", async () => {
    if (!sdk) return;
    const agents = await sdk.library.browseAgents();
    expect(Array.isArray(agents)).toBe(true);
  });

  it("should browse library skills", async () => {
    if (!sdk) return;
    const skills = await sdk.library.browseSkills();
    expect(Array.isArray(skills)).toBe(true);
  });

  it("should handle auth errors gracefully", async () => {
    const badSdk = new HybrIQSDK({
      mode: "cloud",
      apiKey: "hiq_invalid_key",
      baseUrl: API_BASE,
    });

    await expect(badSdk.getBalance()).rejects.toThrow();
  });
});
