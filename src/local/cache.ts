/**
 * Local cache module — exact + semantic matching.
 *
 * SQLite-backed (via sql.js WASM) cache for local mode execution.
 * Two-tier lookup:
 *   1. Exact match: SHA-256 hash of model + systemPrompt + messages
 *   2. Semantic match: cosine similarity on embedding vectors (if enabled)
 *
 * The database file is stored on disk for persistence across sessions.
 */

import initSqlJs, { type Database } from "sql.js";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  generateEmbedding,
  cosineSimilarity,
  type EmbeddingConfig,
  type EmbeddingVector,
} from "./embeddings.js";

/** Cache entry stored in SQLite. */
export interface CacheEntry {
  hash: string;
  response: string;
  tokensIn: number;
  tokensOut: number;
  modelProvider: string;
  modelName: string;
  createdAt: string;
  /** "exact" or "semantic" — how the entry was matched. */
  matchType?: "exact" | "semantic";
  /** Similarity score (1.0 for exact, 0-1 for semantic). */
  similarity?: number;
}

/** Cache statistics. */
export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  semanticHits: number;
  exactHits: number;
  /** Estimated cost savings from cache hits (USD). */
  estimatedSavingsUsd: number;
}

/** Semantic cache configuration. */
export interface SemanticCacheConfig {
  /** Enable semantic matching. Default: false. */
  enabled: boolean;
  /** Embedding provider configuration. */
  embedding?: EmbeddingConfig;
}

export class LocalCache {
  private db: Database | null = null;
  private dbPath: string;
  private hits = 0;
  private misses = 0;
  private semanticHits = 0;
  private exactHits = 0;
  private estimatedSavingsUsd = 0;
  private semanticConfig: SemanticCacheConfig;

  constructor(
    dbPath: string = ".hybriq/cache.db",
    semanticConfig?: SemanticCacheConfig
  ) {
    this.dbPath = dbPath;
    this.semanticConfig = semanticConfig ?? { enabled: false };
  }

  /**
   * Initialize the SQLite database.
   * Creates cache tables (exact + semantic) if they don't exist.
   */
  async init(): Promise<void> {
    const SQL = await initSqlJs();

    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Exact match table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache (
        hash TEXT PRIMARY KEY,
        response TEXT NOT NULL,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        model_provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Semantic embedding table (stores vectors as JSON text)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache_embeddings (
        hash TEXT PRIMARY KEY,
        prompt_text TEXT NOT NULL,
        embedding TEXT NOT NULL,
        model_name TEXT NOT NULL,
        FOREIGN KEY (hash) REFERENCES cache(hash)
      )
    `);

    // Stats tracking table (persists across sessions)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache_stats (
        key TEXT PRIMARY KEY,
        value REAL NOT NULL DEFAULT 0
      )
    `);
    // Initialize stats if not present
    this.db.run(`INSERT OR IGNORE INTO cache_stats (key, value) VALUES ('total_hits', 0)`);
    this.db.run(`INSERT OR IGNORE INTO cache_stats (key, value) VALUES ('total_misses', 0)`);
    this.db.run(`INSERT OR IGNORE INTO cache_stats (key, value) VALUES ('semantic_hits', 0)`);
    this.db.run(`INSERT OR IGNORE INTO cache_stats (key, value) VALUES ('exact_hits', 0)`);
    this.db.run(`INSERT OR IGNORE INTO cache_stats (key, value) VALUES ('estimated_savings_usd', 0)`);

    // Load persisted stats
    this.loadStats();

    this.save();
  }

  /**
   * Get a cached response. Tries exact match first, then semantic.
   */
  get(hash: string): CacheEntry | null {
    if (!this.db) throw new Error("Cache not initialized. Call init() first.");

    // Exact match
    const result = this.db.exec(
      "SELECT hash, response, tokens_in, tokens_out, model_provider, model_name, created_at FROM cache WHERE hash = ?",
      [hash]
    );

    if (result.length > 0 && result[0].values.length > 0) {
      this.hits++;
      this.exactHits++;
      this.persistStat("total_hits", this.hits);
      this.persistStat("exact_hits", this.exactHits);
      const row = result[0].values[0];
      const entry = this.rowToEntry(row);
      this.trackSavings(entry.tokensIn, entry.tokensOut);
      return { ...entry, matchType: "exact", similarity: 1.0 };
    }

    this.misses++;
    this.persistStat("total_misses", this.misses);
    return null;
  }

  /**
   * Semantic cache lookup — finds the most similar cached prompt.
   * Returns null if no match above the similarity threshold.
   */
  async getSemanticMatch(
    model: string,
    systemPrompt: string | undefined,
    messages: { role: string; content: string }[]
  ): Promise<CacheEntry | null> {
    if (!this.db || !this.semanticConfig.enabled) return null;

    const embeddingConfig = this.semanticConfig.embedding ?? {
      provider: "local" as const,
      threshold: 0.92,
    };
    const threshold = embeddingConfig.threshold ?? 0.92;

    // Build prompt text for embedding
    const promptText = this.buildPromptText(systemPrompt, messages);

    // Generate embedding for the query
    let queryEmbedding: EmbeddingVector;
    try {
      queryEmbedding = await generateEmbedding(promptText, embeddingConfig);
    } catch {
      // If embedding fails, fall back to exact match only
      return null;
    }

    // Load all embeddings for the same model and compare
    const rows = this.db.exec(
      `SELECT ce.hash, ce.embedding, c.response, c.tokens_in, c.tokens_out, c.model_provider, c.model_name, c.created_at
       FROM cache_embeddings ce
       JOIN cache c ON ce.hash = c.hash
       WHERE ce.model_name = ?`,
      [model]
    );

    if (rows.length === 0 || rows[0].values.length === 0) return null;

    let bestMatch: CacheEntry | null = null;
    let bestSimilarity = 0;

    for (const row of rows[0].values) {
      const storedEmbedding = JSON.parse(row[1] as string) as EmbeddingVector;
      const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);

      if (similarity >= threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = {
          hash: row[0] as string,
          response: row[2] as string,
          tokensIn: row[3] as number,
          tokensOut: row[4] as number,
          modelProvider: row[5] as string,
          modelName: row[6] as string,
          createdAt: row[7] as string,
          matchType: "semantic",
          similarity,
        };
      }
    }

    if (bestMatch) {
      this.hits++;
      this.semanticHits++;
      this.persistStat("total_hits", this.hits);
      this.persistStat("semantic_hits", this.semanticHits);
      // Decrement the miss that was counted in get()
      this.misses = Math.max(0, this.misses - 1);
      this.persistStat("total_misses", this.misses);
      this.trackSavings(bestMatch.tokensIn, bestMatch.tokensOut);
    }

    return bestMatch;
  }

  /**
   * Store a response in the cache (exact + semantic embedding).
   */
  async set(
    hash: string,
    response: string,
    tokensIn: number,
    tokensOut: number,
    modelProvider: string,
    modelName: string,
    systemPrompt?: string,
    messages?: { role: string; content: string }[]
  ): Promise<void> {
    if (!this.db) throw new Error("Cache not initialized. Call init() first.");

    // Store exact match
    this.db.run(
      "INSERT OR REPLACE INTO cache (hash, response, tokens_in, tokens_out, model_provider, model_name) VALUES (?, ?, ?, ?, ?, ?)",
      [hash, response, tokensIn, tokensOut, modelProvider, modelName]
    );

    // Store semantic embedding if enabled and prompt text available
    if (this.semanticConfig.enabled && messages) {
      const embeddingConfig = this.semanticConfig.embedding ?? {
        provider: "local" as const,
      };

      try {
        const promptText = this.buildPromptText(systemPrompt, messages);
        const embedding = await generateEmbedding(promptText, embeddingConfig);

        this.db.run(
          "INSERT OR REPLACE INTO cache_embeddings (hash, prompt_text, embedding, model_name) VALUES (?, ?, ?, ?)",
          [hash, promptText, JSON.stringify(embedding), modelName]
        );
      } catch {
        // Embedding generation failed — exact match still stored
      }
    }

    this.save();
  }

  /**
   * Get cache statistics (persisted across sessions).
   */
  getStats(): CacheStats {
    if (!this.db) throw new Error("Cache not initialized. Call init() first.");

    const result = this.db.exec("SELECT COUNT(*) FROM cache");
    const totalEntries =
      result.length > 0 ? (result[0].values[0][0] as number) : 0;

    const total = this.hits + this.misses;
    return {
      totalEntries,
      totalHits: this.hits,
      totalMisses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      semanticHits: this.semanticHits,
      exactHits: this.exactHits,
      estimatedSavingsUsd: Math.round(this.estimatedSavingsUsd * 100) / 100,
    };
  }

  /**
   * Compute a content hash for exact match cache lookup.
   */
  static computeHash(
    model: string,
    systemPrompt: string | undefined,
    messages: { role: string; content: string }[]
  ): string {
    const content = JSON.stringify({ model, systemPrompt, messages });
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Build a text representation for embedding generation.
   */
  private buildPromptText(
    systemPrompt: string | undefined,
    messages: { role: string; content: string }[]
  ): string {
    const parts: string[] = [];
    if (systemPrompt) parts.push(`[system] ${systemPrompt}`);
    for (const msg of messages) {
      parts.push(`[${msg.role}] ${msg.content}`);
    }
    return parts.join("\n");
  }

  /**
   * Track estimated cost savings from a cache hit.
   * Uses a rough average of $0.003 per 1K input tokens + $0.015 per 1K output tokens.
   */
  private trackSavings(tokensIn: number, tokensOut: number): void {
    const savings = (tokensIn / 1000) * 0.003 + (tokensOut / 1000) * 0.015;
    this.estimatedSavingsUsd += savings;
    this.persistStat("estimated_savings_usd", this.estimatedSavingsUsd);
  }

  /**
   * Convert a SQL row to a CacheEntry.
   */
  private rowToEntry(row: unknown[]): CacheEntry {
    return {
      hash: row[0] as string,
      response: row[1] as string,
      tokensIn: row[2] as number,
      tokensOut: row[3] as number,
      modelProvider: row[4] as string,
      modelName: row[5] as string,
      createdAt: row[6] as string,
    };
  }

  /**
   * Persist a stat to SQLite.
   */
  private persistStat(key: string, value: number): void {
    if (!this.db) return;
    this.db.run(
      "INSERT OR REPLACE INTO cache_stats (key, value) VALUES (?, ?)",
      [key, value]
    );
  }

  /**
   * Load persisted stats from SQLite.
   */
  private loadStats(): void {
    if (!this.db) return;
    const result = this.db.exec("SELECT key, value FROM cache_stats");
    if (result.length === 0) return;

    for (const row of result[0].values) {
      const key = row[0] as string;
      const value = row[1] as number;
      switch (key) {
        case "total_hits": this.hits = value; break;
        case "total_misses": this.misses = value; break;
        case "semantic_hits": this.semanticHits = value; break;
        case "exact_hits": this.exactHits = value; break;
        case "estimated_savings_usd": this.estimatedSavingsUsd = value; break;
      }
    }
  }

  /**
   * Save the database to disk.
   */
  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    writeFileSync(this.dbPath, Buffer.from(data));
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}
