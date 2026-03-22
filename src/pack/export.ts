/**
 * T058: Pack export module.
 *
 * Exports local mode data (agents, skills, cache entries) as a .tar.gz
 * archive for migration to V2 cloud platform.
 *
 * Archive structure:
 * - manifest.json       (PackManifest)
 * - data/agents.json    (PackAgent[])
 * - data/skills.json    (PackSkill[])
 * - data/cache.json     (PackCacheEntry[])
 */

import * as tar from "tar";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { ValidatedLicense } from "../license/validator.js";
import { LocalCache } from "../local/cache.js";
import type {
  PackManifest,
  PackAgent,
  PackSkill,
  PackCacheEntry,
} from "./types.js";

/** Export options. */
export interface ExportOptions {
  /** Custom agents to include (if not reading from a local DB). */
  agents?: PackAgent[];
  /** Custom skills to include. */
  skills?: PackSkill[];
  /** Whether to include cache entries. Defaults to true. */
  includeCache?: boolean;
}

/**
 * Export local mode data as a .tar.gz pack.
 *
 * @param outputPath - Path for the output .tar.gz file.
 * @param license - The validated license.
 * @param cache - The local cache instance.
 * @param options - Optional export configuration.
 */
export async function exportPack(
  outputPath: string,
  license: ValidatedLicense,
  cache: LocalCache,
  options?: ExportOptions
): Promise<void> {
  const agents: PackAgent[] = options?.agents ?? [];
  const skills: PackSkill[] = options?.skills ?? [];
  const includeCache = options?.includeCache ?? true;

  // Get cache entries if requested
  const cacheEntries: PackCacheEntry[] = [];
  if (includeCache) {
    const stats = cache.getStats();
    // Note: In a full implementation, we'd iterate over all cache entries.
    // For now, the cache DB file itself would be the most complete source.
    void stats; // Cache entries read from SQLite would go here
  }

  // Build manifest
  const manifest: PackManifest = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    licenseTier: license.payload.tier,
    licenseeEmail: license.payload.email,
    counts: {
      agents: agents.length,
      skills: skills.length,
      cacheEntries: cacheEntries.length,
    },
  };

  // Create temporary staging directory
  const stagingDir = join(dirname(outputPath), ".hybriq-export-staging");
  const dataDir = join(stagingDir, "data");

  try {
    // Create staging directories
    mkdirSync(dataDir, { recursive: true });

    // Write manifest and data files
    writeFileSync(
      join(stagingDir, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );
    writeFileSync(
      join(dataDir, "agents.json"),
      JSON.stringify(agents, null, 2)
    );
    writeFileSync(
      join(dataDir, "skills.json"),
      JSON.stringify(skills, null, 2)
    );
    writeFileSync(
      join(dataDir, "cache.json"),
      JSON.stringify(cacheEntries, null, 2)
    );

    // Create .tar.gz archive
    await tar.create(
      {
        gzip: true,
        file: outputPath,
        cwd: stagingDir,
      },
      ["manifest.json", "data"]
    );
  } finally {
    // Clean up staging directory
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}
