/**
 * Unit tests for billing module — balance, plans, usage queries.
 *
 * Uses MSW to mock API responses.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { server } from "../mocks/server.js";
import { TEST_API_KEY, resetMockState } from "../mocks/handlers.js";
import { HybrIQSDK } from "../../src/index.js";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockState();
});
afterAll(() => server.close());

describe("Billing module (cloud mode)", () => {
  const sdk = new HybrIQSDK({
    mode: "cloud",
    apiKey: TEST_API_KEY,
    baseUrl: "http://localhost:3000",
  });

  describe("getBalance", () => {
    it("should return current balance and plan info", async () => {
      const balance = await sdk.getBalance();
      expect(balance.creditBalance).toBe(1000);
      expect(balance.plan).toBe("pro");
      expect(balance.creditsPurchased).toBe(5000);
      expect(balance.billingCycleStart).toBeDefined();
      expect(balance.billingCycleEnd).toBeDefined();
    });
  });

  describe("getPlans", () => {
    it("should return available plans", async () => {
      const plans = await sdk.getPlans();
      expect(plans).toHaveLength(2);
      expect(plans[0].name).toBe("free");
      expect(plans[1].name).toBe("pro");
      expect(plans[1].priceUsd).toBe(49);
      expect(plans[1].semanticCacheEnabled).toBe(true);
    });
  });

  describe("getUsage", () => {
    it("should return usage report", async () => {
      const usage = await sdk.getUsage();
      expect(usage.totalExecutions).toBe(150);
      expect(usage.cacheHits).toBe(90);
      expect(usage.cacheMisses).toBe(60);
      expect(usage.cacheHitRate).toBeCloseTo(0.6, 2);
      expect(usage.creditsUsed).toBe(300);
      expect(usage.costUsd).toBe(15.0);
    });
  });
});
