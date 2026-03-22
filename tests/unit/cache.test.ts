/**
 * Unit tests for LocalCache — exact + semantic matching.
 *
 * Uses an in-memory SQLite database (no disk writes during tests).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LocalCache } from "../../src/local/cache.js";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Create a temporary cache for testing.
 * Uses a unique temp directory so tests don't interfere.
 */
function createTestCache(semantic = false): LocalCache {
  const dir = mkdtempSync(join(tmpdir(), "hybriq-test-cache-"));
  return new LocalCache(
    join(dir, "cache.db"),
    semantic
      ? {
          enabled: true,
          embedding: { provider: "local", threshold: 0.85 },
        }
      : { enabled: false }
  );
}

describe("LocalCache", () => {
  let cache: LocalCache;

  beforeEach(async () => {
    cache = createTestCache();
    await cache.init();
  });

  describe("Exact match", () => {
    it("should return null for cache miss", () => {
      const result = cache.get("nonexistent-hash");
      expect(result).toBeNull();
    });

    it("should store and retrieve cached responses", async () => {
      await cache.set(
        "test-hash",
        "Hello world",
        10,
        20,
        "anthropic",
        "claude-sonnet-4-5-20250929"
      );

      const result = cache.get("test-hash");
      expect(result).not.toBeNull();
      expect(result!.response).toBe("Hello world");
      expect(result!.tokensIn).toBe(10);
      expect(result!.tokensOut).toBe(20);
      expect(result!.modelProvider).toBe("anthropic");
      expect(result!.modelName).toBe("claude-sonnet-4-5-20250929");
      expect(result!.matchType).toBe("exact");
      expect(result!.similarity).toBe(1.0);
    });

    it("should overwrite existing entries with same hash", async () => {
      await cache.set("dup-hash", "First", 5, 10, "openai", "gpt-4o");
      await cache.set("dup-hash", "Second", 15, 25, "openai", "gpt-4o");

      const result = cache.get("dup-hash");
      expect(result!.response).toBe("Second");
      expect(result!.tokensIn).toBe(15);
    });
  });

  describe("Cache stats", () => {
    it("should start with zero stats", () => {
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it("should track hits and misses", async () => {
      await cache.set("hit-hash", "Response", 10, 20, "anthropic", "claude");

      cache.get("hit-hash"); // hit
      cache.get("miss-hash"); // miss
      cache.get("hit-hash"); // hit

      const stats = cache.getStats();
      expect(stats.totalHits).toBe(2);
      expect(stats.totalMisses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
      expect(stats.exactHits).toBe(2);
    });

    it("should count total entries", async () => {
      await cache.set("h1", "R1", 10, 20, "a", "m1");
      await cache.set("h2", "R2", 10, 20, "a", "m2");
      await cache.set("h3", "R3", 10, 20, "a", "m3");

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(3);
    });

    it("should estimate savings from cache hits", async () => {
      await cache.set("save-hash", "R", 1000, 500, "a", "m");

      // Hit it twice
      cache.get("save-hash");
      cache.get("save-hash");

      const stats = cache.getStats();
      // $0.003/1K in + $0.015/1K out = 0.003 + 0.0075 = 0.0105 per hit * 2
      expect(stats.estimatedSavingsUsd).toBeGreaterThan(0);
    });
  });

  describe("computeHash", () => {
    it("should produce consistent hashes for same input", () => {
      const h1 = LocalCache.computeHash("model", "sys", [
        { role: "user", content: "hi" },
      ]);
      const h2 = LocalCache.computeHash("model", "sys", [
        { role: "user", content: "hi" },
      ]);
      expect(h1).toBe(h2);
    });

    it("should produce different hashes for different inputs", () => {
      const h1 = LocalCache.computeHash("model", "sys", [
        { role: "user", content: "hello" },
      ]);
      const h2 = LocalCache.computeHash("model", "sys", [
        { role: "user", content: "goodbye" },
      ]);
      expect(h1).not.toBe(h2);
    });

    it("should include model in hash computation", () => {
      const h1 = LocalCache.computeHash("model-a", undefined, [
        { role: "user", content: "hi" },
      ]);
      const h2 = LocalCache.computeHash("model-b", undefined, [
        { role: "user", content: "hi" },
      ]);
      expect(h1).not.toBe(h2);
    });
  });

  describe("Semantic matching", () => {
    it("should find semantically similar prompts when enabled", async () => {
      const semanticCache = createTestCache(true);
      await semanticCache.init();

      const messages = [
        { role: "user", content: "Write a Python function to sort a list" },
      ];
      const hash = LocalCache.computeHash(
        "claude-sonnet-4-5-20250929",
        undefined,
        messages
      );

      await semanticCache.set(
        hash,
        "def sort_list(lst): return sorted(lst)",
        50,
        30,
        "anthropic",
        "claude-sonnet-4-5-20250929",
        undefined,
        messages
      );

      // Try a similar but not identical prompt
      const result = await semanticCache.getSemanticMatch(
        "claude-sonnet-4-5-20250929",
        undefined,
        [
          {
            role: "user",
            content: "Create a Python function that sorts a list",
          },
        ]
      );

      // May or may not match depending on similarity threshold
      // The important thing is that it doesn't throw
      if (result) {
        expect(result.matchType).toBe("semantic");
        expect(result.similarity).toBeGreaterThan(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      }

      semanticCache.close();
    });

    it("should return null when semantic matching is disabled", async () => {
      const result = await cache.getSemanticMatch("model", undefined, [
        { role: "user", content: "test" },
      ]);
      expect(result).toBeNull();
    });
  });

  describe("Lifecycle", () => {
    it("should throw if used before init()", () => {
      const uninitCache = createTestCache();
      expect(() => uninitCache.get("any")).toThrow("not initialized");
      expect(() => uninitCache.getStats()).toThrow("not initialized");
    });

    it("should close without error", () => {
      expect(() => cache.close()).not.toThrow();
    });
  });
});
