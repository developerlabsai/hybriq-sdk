/**
 * T053: Local metering module.
 *
 * SQLite-backed execution log for local mode. Tracks tokens, cost,
 * duration, and cache hits per execution for usage reporting.
 */

import initSqlJs, { type Database } from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

/** Execution log entry. */
export interface MeteringEntry {
  id: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  cacheHit: boolean;
  createdAt: string;
}

/** Usage report for a period. */
export interface LocalUsageReport {
  totalExecutions: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
}

export class LocalMetering {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = ".hybriq/metering.db") {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the SQLite database.
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

    this.db.run(`
      CREATE TABLE IF NOT EXISTS executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT NOT NULL,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        duration_ms INTEGER NOT NULL,
        cache_hit INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.save();
  }

  /**
   * Log an execution.
   */
  logExecution(entry: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    durationMs: number;
    cacheHit: boolean;
    cacheType?: "exact" | "semantic";
  }): void {
    if (!this.db)
      throw new Error("Metering not initialized. Call init() first.");

    this.db.run(
      "INSERT INTO executions (model, tokens_in, tokens_out, cost_usd, duration_ms, cache_hit) VALUES (?, ?, ?, ?, ?, ?)",
      [
        entry.model,
        entry.tokensIn,
        entry.tokensOut,
        entry.costUsd,
        entry.durationMs,
        entry.cacheHit ? 1 : 0,
      ]
    );

    this.save();
  }

  /**
   * Get usage report for a period.
   *
   * @param period - "current" (last 30 days) or "all" (all time).
   */
  getUsage(period: "current" | "all" = "current"): LocalUsageReport {
    if (!this.db)
      throw new Error("Metering not initialized. Call init() first.");

    const whereClause =
      period === "current"
        ? "WHERE created_at >= datetime('now', '-30 days')"
        : "";

    const result = this.db.exec(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as hits,
        SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) as misses,
        COALESCE(SUM(tokens_in), 0) as total_tokens_in,
        COALESCE(SUM(tokens_out), 0) as total_tokens_out,
        COALESCE(SUM(cost_usd), 0) as total_cost
      FROM executions ${whereClause}
    `);

    if (result.length === 0 || result[0].values.length === 0) {
      return {
        totalExecutions: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheHitRate: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalCostUsd: 0,
      };
    }

    const row = result[0].values[0];
    const total = (row[0] as number) || 0;
    const hits = (row[1] as number) || 0;
    const misses = (row[2] as number) || 0;

    return {
      totalExecutions: total,
      cacheHits: hits,
      cacheMisses: misses,
      cacheHitRate: total > 0 ? hits / total : 0,
      totalTokensIn: (row[3] as number) || 0,
      totalTokensOut: (row[4] as number) || 0,
      totalCostUsd: (row[5] as number) || 0,
    };
  }

  /**
   * Get the cache hit rate.
   */
  getCacheHitRate(): number {
    return this.getUsage("all").cacheHitRate;
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
