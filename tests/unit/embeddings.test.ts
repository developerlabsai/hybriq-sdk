/**
 * Unit tests for the local embedding engine.
 *
 * Tests TF-IDF embedding generation, cosine similarity,
 * and semantic matching behavior.
 */

import { describe, it, expect } from "vitest";
import {
  generateEmbedding,
  cosineSimilarity,
} from "../../src/local/embeddings.js";

describe("Local embeddings", () => {
  describe("generateEmbedding", () => {
    it("should generate a 256-dimensional vector", async () => {
      const vec = await generateEmbedding("Hello world", {
        provider: "local",
      });
      expect(vec).toHaveLength(256);
    });

    it("should return normalized vectors (L2 norm ~1.0)", async () => {
      const vec = await generateEmbedding("Test embedding normalization", {
        provider: "local",
      });
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it("should produce identical vectors for identical input", async () => {
      const v1 = await generateEmbedding("Same text", { provider: "local" });
      const v2 = await generateEmbedding("Same text", { provider: "local" });
      expect(v1).toEqual(v2);
    });

    it("should produce different vectors for different input", async () => {
      const v1 = await generateEmbedding("Cats are great", {
        provider: "local",
      });
      const v2 = await generateEmbedding("Quantum physics equations", {
        provider: "local",
      });
      expect(v1).not.toEqual(v2);
    });
  });

  describe("cosineSimilarity", () => {
    it("should return 1.0 for identical vectors", () => {
      const vec = [0.1, 0.2, 0.3, 0.4];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    it("should return 0 for orthogonal vectors", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    });

    it("should return -1 for opposite vectors", () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
    });

    it("should return 0 for mismatched dimensions", () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it("should return 0 for zero vectors", () => {
      expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
    });
  });

  describe("Semantic similarity behavior", () => {
    it("should score similar prompts higher than dissimilar ones", async () => {
      const config = { provider: "local" as const };

      const base = await generateEmbedding(
        "Write a Python function to sort a list",
        config
      );
      const similar = await generateEmbedding(
        "Create a Python function that sorts a list",
        config
      );
      const different = await generateEmbedding(
        "What is the weather in Tokyo today",
        config
      );

      const simScore = cosineSimilarity(base, similar);
      const diffScore = cosineSimilarity(base, different);

      expect(simScore).toBeGreaterThan(diffScore);
    });

    it("should handle empty strings without error", async () => {
      const vec = await generateEmbedding("", { provider: "local" });
      expect(vec).toHaveLength(256);
    });

    it("should handle very long text", async () => {
      const longText = "word ".repeat(10000);
      const vec = await generateEmbedding(longText, { provider: "local" });
      expect(vec).toHaveLength(256);
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });
  });
});
