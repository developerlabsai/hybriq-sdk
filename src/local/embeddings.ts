/**
 * Local embedding engine for semantic cache.
 *
 * Supports two strategies:
 * - "local": TF-IDF + cosine similarity (zero dependencies, works offline)
 * - "openai": OpenAI text-embedding-3-small API (higher quality, requires API key)
 * - "anthropic": Reserved for future Anthropic embedding API
 *
 * The local strategy uses a lightweight TF-IDF approach that's fast and
 * works entirely offline. For production semantic matching, use a provider.
 */

/** Embedding vector (array of floats). */
export type EmbeddingVector = number[];

/** Embedding provider configuration. */
export interface EmbeddingConfig {
  /** Provider to use for embeddings. */
  provider: "local" | "openai";
  /** API key for cloud embedding providers. */
  apiKey?: string;
  /** Similarity threshold (0-1). Default: 0.92. */
  threshold?: number;
}

/**
 * Generate an embedding vector for a text string.
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<EmbeddingVector> {
  if (config.provider === "openai") {
    return generateOpenAIEmbedding(text, config.apiKey!);
  }
  return generateLocalEmbedding(text);
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical).
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ═══════════════════════════════════════════════════════════════
// Local TF-IDF Embedding (offline, zero dependencies)
// ═══════════════════════════════════════════════════════════════

/** Fixed vocabulary size for local embeddings. */
const LOCAL_VECTOR_SIZE = 256;

/**
 * Generate a local embedding using character/word n-gram hashing.
 * Uses a bag-of-ngrams approach with feature hashing for fixed-size vectors.
 * This is lightweight but effective for detecting similar prompts.
 */
function generateLocalEmbedding(text: string): EmbeddingVector {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const vector = new Float64Array(LOCAL_VECTOR_SIZE);

  // Word unigrams
  for (const word of words) {
    const idx = hashToIndex(word, LOCAL_VECTOR_SIZE);
    vector[idx] += 1;
  }

  // Word bigrams (captures phrase structure)
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]}_${words[i + 1]}`;
    const idx = hashToIndex(bigram, LOCAL_VECTOR_SIZE);
    vector[idx] += 0.5;
  }

  // Character trigrams (captures typo tolerance)
  for (const word of words) {
    for (let i = 0; i < word.length - 2; i++) {
      const trigram = word.substring(i, i + 3);
      const idx = hashToIndex(`c_${trigram}`, LOCAL_VECTOR_SIZE);
      vector[idx] += 0.3;
    }
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }

  return Array.from(vector);
}

/**
 * Hash a string to a bucket index using FNV-1a.
 */
function hashToIndex(str: string, buckets: number): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash % buckets;
}

// ═══════════════════════════════════════════════════════════════
// OpenAI Embedding API
// ═══════════════════════════════════════════════════════════════

/**
 * Generate an embedding via OpenAI text-embedding-3-small.
 */
async function generateOpenAIEmbedding(
  text: string,
  apiKey: string
): Promise<EmbeddingVector> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embedding API returned ${response.status}`);
  }

  const data = (await response.json()) as {
    data: { embedding: number[] }[];
  };

  return data.data[0].embedding;
}
