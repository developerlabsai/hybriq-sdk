/**
 * Contract tests — verify SDK types match API response shapes.
 *
 * These tests use MSW recorded responses to ensure the SDK's type
 * definitions match what the API actually returns. If you change an
 * API endpoint's response format, update the corresponding fixture
 * in mocks/handlers.ts and these contract tests will catch mismatches.
 *
 * Run with the unit test suite: pnpm --filter @hybriq/sdk test
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { server } from "../mocks/server.js";
import { TEST_API_KEY } from "../mocks/handlers.js";
import { HybrIQSDK } from "../../src/index.js";
import type {
  BalanceInfo,
  PlanInfo,
  UsageReport,
  LibraryItem,
} from "../../src/types.js";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const sdk = new HybrIQSDK({
  mode: "cloud",
  apiKey: TEST_API_KEY,
  baseUrl: "http://localhost:3000",
});

describe("API Contract Tests", () => {
  describe("BalanceInfo contract", () => {
    it("should match BalanceInfo shape", async () => {
      const balance: BalanceInfo = await sdk.getBalance();

      // Required fields
      expect(typeof balance.creditBalance).toBe("number");
      expect(typeof balance.creditsPurchased).toBe("number");
      expect(typeof balance.plan).toBe("string");

      // Optional fields (present in our mock)
      expect(typeof balance.billingCycleStart).toBe("string");
      expect(typeof balance.billingCycleEnd).toBe("string");
    });
  });

  describe("PlanInfo contract", () => {
    it("should match PlanInfo[] shape", async () => {
      const plans: PlanInfo[] = await sdk.getPlans();
      expect(plans.length).toBeGreaterThan(0);

      for (const plan of plans) {
        expect(typeof plan.id).toBe("string");
        expect(typeof plan.name).toBe("string");
        expect(typeof plan.displayName).toBe("string");
        expect(typeof plan.monthlyCredits).toBe("number");
        expect(typeof plan.priceUsd).toBe("number");
        expect(typeof plan.apiRateLimit).toBe("number");
        expect(typeof plan.semanticCacheEnabled).toBe("boolean");
        expect(typeof plan.crossTenantCache).toBe("boolean");
      }
    });
  });

  describe("UsageReport contract", () => {
    it("should match UsageReport shape", async () => {
      const usage: UsageReport = await sdk.getUsage();

      expect(typeof usage.totalExecutions).toBe("number");
      expect(typeof usage.cacheHits).toBe("number");
      expect(typeof usage.cacheMisses).toBe("number");
      expect(typeof usage.cacheHitRate).toBe("number");
      expect(typeof usage.creditsUsed).toBe("number");
      expect(typeof usage.costUsd).toBe("number");
      expect(usage.period).toHaveProperty("start");
      expect(usage.period).toHaveProperty("end");
      expect(typeof usage.creditsByType).toBe("object");
    });
  });

  describe("LibraryItem contract", () => {
    it("should match LibraryItem[] shape for agents", async () => {
      const agents: LibraryItem[] = await sdk.library.browseAgents();
      expect(agents.length).toBeGreaterThan(0);

      for (const agent of agents) {
        expect(typeof agent.id).toBe("string");
        expect(typeof agent.name).toBe("string");
        expect(typeof agent.type).toBe("string");
        expect(typeof agent.version).toBe("string");
        expect(typeof agent.visibility).toBe("string");
        expect(["agent", "skill", "specialty", "team_cluster"]).toContain(
          agent.type
        );
        expect(["public", "private"]).toContain(agent.visibility);
      }
    });
  });
});
