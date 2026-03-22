#!/usr/bin/env node
/**
 * HybrIQ Stats CLI — `npx hybriq stats`
 *
 * Displays local mode statistics: cache performance, cost savings,
 * execution history, and agent/skill configuration overview.
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { LocalCache } from "../local/cache.js";
import { LocalMetering } from "../local/metering.js";

/** ANSI color codes. */
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
};

/**
 * Format a USD amount with 2 decimal places.
 */
function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format a percentage.
 */
function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Render a simple bar chart.
 */
function bar(value: number, max: number, width: number = 20): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  const empty = width - filled;
  return `${c.green}${"█".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset}`;
}

/**
 * Main stats display.
 */
async function main(): Promise<void> {
  const baseDir = process.cwd();
  const configDir = join(baseDir, ".hybriq");

  console.log("");
  console.log(`${c.bold}${c.bgBlue}${c.white} HybrIQ Local Stats ${c.reset}`);
  console.log(`${c.dim}─────────────────────────────────────────${c.reset}`);

  // Check if .hybriq exists
  if (!existsSync(configDir)) {
    console.log(`${c.yellow}No .hybriq/ directory found in ${baseDir}${c.reset}`);
    console.log(`${c.dim}Run your first execution to initialize local mode.${c.reset}`);
    console.log("");
    process.exit(0);
  }

  // === Cache Stats ===
  const cacheDbPath = join(configDir, "cache.db");
  if (existsSync(cacheDbPath)) {
    const cache = new LocalCache(cacheDbPath);
    await cache.init();
    const stats = cache.getStats();
    cache.close();

    console.log("");
    console.log(`${c.bold}${c.cyan}Cache Performance${c.reset}`);
    console.log(`${c.dim}──────────────────${c.reset}`);

    const total = stats.totalHits + stats.totalMisses;
    console.log(`  Entries:         ${c.bold}${stats.totalEntries}${c.reset}`);
    console.log(`  Total lookups:   ${c.bold}${total}${c.reset}`);
    console.log(`  Hit rate:        ${bar(stats.totalHits, total)} ${c.bold}${pct(stats.hitRate)}${c.reset}`);
    console.log(`    Exact hits:    ${c.green}${stats.exactHits}${c.reset}`);
    console.log(`    Semantic hits: ${c.magenta}${stats.semanticHits}${c.reset}`);
    console.log(`    Misses:        ${c.yellow}${stats.totalMisses}${c.reset}`);
    console.log(`  Est. savings:    ${c.bold}${c.green}${usd(stats.estimatedSavingsUsd)}${c.reset}`);
  } else {
    console.log("");
    console.log(`${c.dim}No cache data yet.${c.reset}`);
  }

  // === Metering Stats ===
  const meteringDbPath = join(configDir, "metering.db");
  if (existsSync(meteringDbPath)) {
    const metering = new LocalMetering(meteringDbPath);
    await metering.init();
    const current = metering.getUsage("current");
    const all = metering.getUsage("all");
    metering.close();

    console.log("");
    console.log(`${c.bold}${c.cyan}Execution Stats (Last 30 Days)${c.reset}`);
    console.log(`${c.dim}───────────────────────────────${c.reset}`);
    console.log(`  Executions:      ${c.bold}${current.totalExecutions}${c.reset}`);
    console.log(`  Tokens in:       ${c.bold}${current.totalTokensIn.toLocaleString()}${c.reset}`);
    console.log(`  Tokens out:      ${c.bold}${current.totalTokensOut.toLocaleString()}${c.reset}`);
    console.log(`  Total cost:      ${c.bold}${usd(current.totalCostUsd)}${c.reset}`);
    console.log(`  Cache hit rate:  ${bar(current.cacheHits, current.totalExecutions)} ${c.bold}${pct(current.cacheHitRate)}${c.reset}`);

    if (all.totalExecutions !== current.totalExecutions) {
      console.log("");
      console.log(`${c.bold}${c.cyan}All Time${c.reset}`);
      console.log(`${c.dim}────────${c.reset}`);
      console.log(`  Executions:      ${c.bold}${all.totalExecutions}${c.reset}`);
      console.log(`  Tokens in:       ${c.bold}${all.totalTokensIn.toLocaleString()}${c.reset}`);
      console.log(`  Tokens out:      ${c.bold}${all.totalTokensOut.toLocaleString()}${c.reset}`);
      console.log(`  Total cost:      ${c.bold}${usd(all.totalCostUsd)}${c.reset}`);
    }
  }

  // === Agent/Skill Config ===
  const agentsDir = join(configDir, "agents");
  const skillsDir = join(configDir, "skills");

  const agentFiles = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    : [];
  const skillFiles = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    : [];

  if (agentFiles.length > 0 || skillFiles.length > 0) {
    console.log("");
    console.log(`${c.bold}${c.cyan}Local Config${c.reset}`);
    console.log(`${c.dim}────────────${c.reset}`);
    console.log(`  Agents:          ${c.bold}${agentFiles.length}${c.reset}${c.dim} (${agentsDir})${c.reset}`);
    for (const f of agentFiles) {
      console.log(`    ${c.blue}•${c.reset} ${f.replace(/\.ya?ml$/, "")}`);
    }
    console.log(`  Skills:          ${c.bold}${skillFiles.length}${c.reset}${c.dim} (${skillsDir})${c.reset}`);
    for (const f of skillFiles) {
      console.log(`    ${c.blue}•${c.reset} ${f.replace(/\.ya?ml$/, "")}`);
    }
  }

  // === Storage ===
  console.log("");
  console.log(`${c.bold}${c.cyan}Storage${c.reset}`);
  console.log(`${c.dim}───────${c.reset}`);

  const files = [
    { name: "cache.db", path: cacheDbPath },
    { name: "metering.db", path: meteringDbPath },
  ];

  for (const { name, path } of files) {
    if (existsSync(path)) {
      const { statSync } = await import("fs");
      const stat = statSync(path);
      const sizeKb = (stat.size / 1024).toFixed(1);
      console.log(`  ${name}:${" ".repeat(12 - name.length)}${c.bold}${sizeKb} KB${c.reset}`);
    }
  }

  console.log("");
  console.log(`${c.dim}Upgrade to cloud mode for production features: https://hybriq.dev${c.reset}`);
  console.log("");
}

main().catch((err) => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
