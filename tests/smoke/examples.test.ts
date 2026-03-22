/**
 * Smoke tests — verify that SDK examples compile and import correctly.
 *
 * These tests don't execute the examples (they need real API keys),
 * but they verify that:
 *   1. The SDK can be imported
 *   2. All public classes and types are accessible
 *   3. The SDK can be instantiated in both modes
 *   4. No import/export errors exist
 *
 * Run with: pnpm --filter @hybriq/sdk test:smoke
 */

import { describe, it, expect } from "vitest";

describe("Smoke tests — SDK importability", () => {
  it("should import HybrIQSDK class", async () => {
    const { HybrIQSDK } = await import("../../src/index.js");
    expect(HybrIQSDK).toBeDefined();
    expect(typeof HybrIQSDK).toBe("function");
  });

  it("should import all error classes", async () => {
    const {
      HybrIQError,
      AuthError,
      InsufficientCreditsError,
      RateLimitError,
      HybrIQUnavailableError,
      InvalidLicenseError,
      ProviderError,
    } = await import("../../src/index.js");

    expect(HybrIQError).toBeDefined();
    expect(AuthError).toBeDefined();
    expect(InsufficientCreditsError).toBeDefined();
    expect(RateLimitError).toBeDefined();
    expect(HybrIQUnavailableError).toBeDefined();
    expect(InvalidLicenseError).toBeDefined();
    expect(ProviderError).toBeDefined();
  });

  it("should import AgentsModule", async () => {
    const { AgentsModule } = await import("../../src/index.js");
    expect(AgentsModule).toBeDefined();
  });

  it("should instantiate in cloud mode", async () => {
    const { HybrIQSDK } = await import("../../src/index.js");
    const sdk = new HybrIQSDK({
      mode: "cloud",
      apiKey: "hiq_test_smoke",
      baseUrl: "http://localhost:3000",
    });
    expect(sdk.mode).toBe("cloud");
    expect(sdk.library).toBeDefined();
    expect(sdk.agents).toBeDefined();
  });

  it("should instantiate in local mode", async () => {
    const { HybrIQSDK } = await import("../../src/index.js");
    const sdk = new HybrIQSDK({
      mode: "local",
      licenseKey: "hiq_oss_smoketest",
      providers: { anthropic: { apiKey: "sk-ant-test" } },
    });
    expect(sdk.mode).toBe("local");

    // Consume the async init promise to avoid unhandled rejection (fake key will fail)
    await expect(sdk.execute({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
    })).rejects.toThrow();
  });
});

describe("Smoke tests — Module structure", () => {
  it("should import local cache module", async () => {
    const { LocalCache } = await import("../../src/local/cache.js");
    expect(LocalCache).toBeDefined();
    expect(typeof LocalCache.computeHash).toBe("function");
  });

  it("should import embeddings module", async () => {
    const { generateEmbedding, cosineSimilarity } = await import(
      "../../src/local/embeddings.js"
    );
    expect(typeof generateEmbedding).toBe("function");
    expect(typeof cosineSimilarity).toBe("function");
  });

  it("should import license validator", async () => {
    const { validateLicense, checkFeatureAccess } = await import(
      "../../src/license/validator.js"
    );
    expect(typeof validateLicense).toBe("function");
    expect(typeof checkFeatureAccess).toBe("function");
  });

  it("should import config loader", async () => {
    const { loadLocalConfig, scaffoldConfig } = await import(
      "../../src/local/config.js"
    );
    expect(typeof loadLocalConfig).toBe("function");
    expect(typeof scaffoldConfig).toBe("function");
  });
});
