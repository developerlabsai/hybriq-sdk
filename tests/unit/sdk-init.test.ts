/**
 * Unit tests for HybrIQSDK initialization and mode selection.
 */

import { describe, it, expect } from "vitest";
import { HybrIQSDK } from "../../src/index.js";

describe("HybrIQSDK — Initialization", () => {
  describe("Cloud mode", () => {
    it("should create SDK in cloud mode with valid config", () => {
      const sdk = new HybrIQSDK({
        mode: "cloud",
        apiKey: "hiq_live_test123",
        baseUrl: "http://localhost:3000",
      });
      expect(sdk.mode).toBe("cloud");
    });

    it("should default to cloud mode when mode is not specified", () => {
      const sdk = new HybrIQSDK({
        apiKey: "hiq_live_test123",
        baseUrl: "http://localhost:3000",
      });
      expect(sdk.mode).toBe("cloud");
    });

    it("should throw when apiKey is missing in cloud mode", () => {
      expect(
        () => new HybrIQSDK({ mode: "cloud", baseUrl: "http://localhost:3000" })
      ).toThrow("Cloud mode requires an API key");
    });

    it("should throw when baseUrl is missing in cloud mode", () => {
      expect(
        () => new HybrIQSDK({ mode: "cloud", apiKey: "hiq_live_test123" })
      ).toThrow("Cloud mode requires a base URL");
    });

    it("should reject OSS license keys in cloud mode", () => {
      expect(
        () =>
          new HybrIQSDK({
            mode: "cloud",
            apiKey: "hiq_oss_fakeLicenseKey",
            baseUrl: "http://localhost:3000",
          })
      ).toThrow("OSS license keys are for local mode only");
    });

    it("should expose library module in cloud mode", () => {
      const sdk = new HybrIQSDK({
        mode: "cloud",
        apiKey: "hiq_live_test123",
        baseUrl: "http://localhost:3000",
      });
      expect(sdk.library).toBeDefined();
    });

    it("should expose agents module in cloud mode", () => {
      const sdk = new HybrIQSDK({
        mode: "cloud",
        apiKey: "hiq_live_test123",
        baseUrl: "http://localhost:3000",
      });
      expect(sdk.agents).toBeDefined();
    });
  });

  describe("Local mode", () => {
    it("should throw when licenseKey is missing in local mode", () => {
      expect(() => new HybrIQSDK({ mode: "local" })).toThrow(
        "Local mode requires a license key"
      );
    });

    it("should set mode to local with license key (validation is async)", () => {
      // Construction succeeds synchronously; license validation happens async.
      // We must catch the init promise to avoid unhandled rejection.
      const sdk = new HybrIQSDK({
        mode: "local",
        licenseKey: "hiq_oss_fakeLicenseKey",
        providers: { anthropic: { apiKey: "sk-ant-test" } },
      });
      expect(sdk.mode).toBe("local");

      // Catch the async license validation error (expected with fake key)
      return expect(sdk.execute({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      })).rejects.toThrow();
    });
  });

  describe("Mode gating", () => {
    it("should throw when calling cloud methods in local mode", async () => {
      const sdk = new HybrIQSDK({
        mode: "local",
        licenseKey: "hiq_oss_fakeLicenseKey",
        providers: { anthropic: { apiKey: "sk-ant-test" } },
      });

      // These throw synchronously via requireCloud() before hitting async init
      await expect(sdk.getBalance()).rejects.toThrow("only available in cloud mode");
      await expect(sdk.getPlans()).rejects.toThrow("only available in cloud mode");
      await expect(sdk.getUsage()).rejects.toThrow("only available in cloud mode");

      // Consume the floating initLocalMode promise to avoid unhandled rejection
      await expect(sdk.execute({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      })).rejects.toThrow();
    });

    it("should throw when accessing cache.stats() in cloud mode", () => {
      const sdk = new HybrIQSDK({
        mode: "cloud",
        apiKey: "hiq_live_test123",
        baseUrl: "http://localhost:3000",
      });
      expect(() => sdk.cache).toThrow("only available in local mode");
    });
  });
});
