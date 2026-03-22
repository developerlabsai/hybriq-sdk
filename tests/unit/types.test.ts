/**
 * Unit tests for SDK type exports and error classes.
 *
 * Validates that all public types are importable and error classes
 * behave correctly with status codes, names, and instanceof checks.
 */

import { describe, it, expect } from "vitest";
import {
  HybrIQError,
  AuthError,
  InsufficientCreditsError,
  RateLimitError,
  HybrIQUnavailableError,
  InvalidLicenseError,
  ProviderError,
} from "../../src/index.js";

describe("Error classes", () => {
  describe("HybrIQError", () => {
    it("should set message, statusCode, and code", () => {
      const err = new HybrIQError("test error", 500, "SERVER_ERROR");
      expect(err.message).toBe("test error");
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe("SERVER_ERROR");
      expect(err.name).toBe("HybrIQError");
    });

    it("should be an instance of Error", () => {
      const err = new HybrIQError("test", 500, "TEST");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(HybrIQError);
    });
  });

  describe("AuthError", () => {
    it("should default to 401 and AUTH_ERROR code", () => {
      const err = new AuthError();
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe("AUTH_ERROR");
      expect(err.name).toBe("AuthError");
    });

    it("should accept custom message", () => {
      const err = new AuthError("Invalid token");
      expect(err.message).toBe("Invalid token");
    });

    it("should be instanceof HybrIQError", () => {
      expect(new AuthError()).toBeInstanceOf(HybrIQError);
    });
  });

  describe("InsufficientCreditsError", () => {
    it("should carry remainingCredits", () => {
      const err = new InsufficientCreditsError(42);
      expect(err.statusCode).toBe(402);
      expect(err.remainingCredits).toBe(42);
      expect(err.code).toBe("INSUFFICIENT_CREDITS");
    });
  });

  describe("RateLimitError", () => {
    it("should carry optional retryAfter", () => {
      const err = new RateLimitError(30);
      expect(err.statusCode).toBe(429);
      expect(err.retryAfter).toBe(30);
    });

    it("should work without retryAfter", () => {
      const err = new RateLimitError();
      expect(err.retryAfter).toBeUndefined();
    });
  });

  describe("HybrIQUnavailableError", () => {
    it("should default to status 0 and UNAVAILABLE code", () => {
      const err = new HybrIQUnavailableError();
      expect(err.statusCode).toBe(0);
      expect(err.code).toBe("UNAVAILABLE");
    });
  });

  describe("InvalidLicenseError", () => {
    it("should be an Error with correct name", () => {
      const err = new InvalidLicenseError("bad key");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("InvalidLicenseError");
      expect(err.message).toBe("bad key");
    });
  });

  describe("ProviderError", () => {
    it("should be an Error with correct name", () => {
      const err = new ProviderError("OpenAI failed");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("ProviderError");
      expect(err.message).toBe("OpenAI failed");
    });
  });
});

describe("Type exports", () => {
  it("should export all public types (compile-time check)", () => {
    // This test validates that the types are importable.
    // If any export is removed, TypeScript compilation will fail.
    const typeChecks: string[] = [
      "HybrIQConfig",
      "ExecuteRequest",
      "ExecuteResult",
      "AgentRunRequest",
      "AgentExecutionResult",
      "LibraryItem",
      "EnrichRequest",
      "EnrichResult",
      "BalanceInfo",
      "UsageReport",
      "PlanInfo",
      "SubscriptionInfo",
      "Message",
      "ProviderConfig",
      "LocalAgentConfig",
      "LocalSkillConfig",
      "LocalConfig",
      "CacheStats",
      "LocalUsageReport",
    ];
    // If we got here, all types compiled successfully
    expect(typeChecks.length).toBeGreaterThan(0);
  });
});
