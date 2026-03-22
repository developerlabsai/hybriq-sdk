/**
 * T057: Pack format types for OSS-to-V2 migration.
 *
 * Defines the structure of the .tar.gz export pack that contains
 * agents, skills, and cache entries from a local mode installation.
 */

/** Pack manifest — included as manifest.json in the archive root. */
export interface PackManifest {
  /** Pack format version. */
  version: string;
  /** ISO 8601 timestamp of when the pack was exported. */
  exportedAt: string;
  /** License tier of the exporting installation. */
  licenseTier: "community" | "pro";
  /** Licensee email address. */
  licenseeEmail: string;
  /** Counts of exported items. */
  counts: {
    agents: number;
    skills: number;
    cacheEntries: number;
  };
}

/** Agent definition exported in the pack. */
export interface PackAgent {
  /** Original agent ID. */
  id: string;
  /** Agent name. */
  name: string;
  /** Agent description. */
  description?: string;
  /** System prompt. */
  systemPrompt?: string;
  /** Model provider. */
  modelProvider: string;
  /** Model name. */
  modelName: string;
  /** Max tokens configuration. */
  maxTokens?: number;
  /** Temperature configuration. */
  temperature?: number;
  /** Agent version. */
  version?: string;
  /** Associated skill IDs. */
  skillIds?: string[];
}

/** Skill definition exported in the pack. */
export interface PackSkill {
  /** Original skill ID. */
  id: string;
  /** Skill name. */
  name: string;
  /** Skill description. */
  description?: string;
  /** Skill type. */
  type: string;
  /** Skill configuration. */
  config?: Record<string, unknown>;
}

/** Cache entry exported in the pack. */
export interface PackCacheEntry {
  /** Content hash. */
  hash: string;
  /** Cached response content. */
  response: string;
  /** Input tokens. */
  tokensIn: number;
  /** Output tokens. */
  tokensOut: number;
  /** Model provider. */
  modelProvider: string;
  /** Model name. */
  modelName: string;
  /** When the entry was cached. */
  createdAt: string;
}
