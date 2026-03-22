/**
 * @hybriq/sdk — Federated intelligence layer for AI agent teams.
 *
 * Supports two modes:
 * - `cloud`: V2 SaaS client — requires API key, routes through HybrIQ API.
 * - `local`: OSS self-hosted — requires license key, runs execution locally.
 */

import { HybrIQApiClient } from "./client.js";
import { AgentsModule } from "./agents.js";
import { execute } from "./execute.js";
import { enrich } from "./enrichment.js";
import { LibraryModule } from "./library.js";
import { getBalance, getPlans, getUsage } from "./billing.js";
import { validateLicense } from "./license/validator.js";
import { LocalCache, type CacheStats } from "./local/cache.js";
import { LocalMetering, type LocalUsageReport } from "./local/metering.js";
import { executeLocal } from "./local/engine.js";
import { exportPack, type ExportOptions } from "./pack/export.js";
import {
  loadLocalConfig,
  getAgent,
  getSkill,
  scaffoldConfig,
  type LocalAgentConfig,
  type LocalSkillConfig,
  type LocalConfig,
} from "./local/config.js";
import type { ValidatedLicense } from "./license/validator.js";
import type {
  HybrIQConfig,
  ExecuteRequest,
  ExecuteResult,
  EnrichRequest,
  EnrichResult,
  BalanceInfo,
  PlanInfo,
  UsageReport,
  ProviderConfig,
} from "./types.js";

export class HybrIQSDK {
  private apiClient!: HybrIQApiClient;
  private providers: {
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
  };
  private readonly _mode: "cloud" | "local";
  private _license: ValidatedLicense | null = null;
  private _localCache: LocalCache | null = null;
  private _localMetering: LocalMetering | null = null;
  private _localConfig: LocalConfig | null = null;
  private _localInitPromise: Promise<void> | null = null;

  /** Browse and subscribe to the federated library (cloud mode only). */
  readonly library!: LibraryModule;

  /** Execute agents via the agent endpoint (cloud mode only). */
  readonly agents!: AgentsModule;

  constructor(config: HybrIQConfig) {
    this._mode = config.mode ?? "cloud";
    this.providers = config.providers ?? {};

    if (this._mode === "cloud") {
      if (!config.apiKey) {
        throw new Error("Cloud mode requires an API key. Provide `apiKey` in config.");
      }
      if (config.apiKey.startsWith("hiq_oss_")) {
        throw new Error(
          "OSS license keys are for local mode only. Use a tenant API key for cloud mode."
        );
      }
      if (!config.baseUrl) {
        throw new Error("Cloud mode requires a base URL. Provide `baseUrl` in config.");
      }
      this.apiClient = new HybrIQApiClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
      this.library = new LibraryModule(this.apiClient);
      this.agents = new AgentsModule(this.apiClient);
    } else if (this._mode === "local") {
      if (!config.licenseKey) {
        throw new Error("Local mode requires a license key. Provide `licenseKey` in config.");
      }
      // Initialize local mode asynchronously
      this._localInitPromise = this.initLocalMode(config.licenseKey, config);
    }
  }

  /**
   * Initialize local mode: validate license, set up cache and metering.
   * Configures semantic cache if enabled in config.
   */
  private async initLocalMode(licenseKey: string, config: HybrIQConfig): Promise<void> {
    this._license = await validateLicense(licenseKey);

    // Configure semantic cache
    const semanticConfig = config.cache?.semanticMatch
      ? {
          enabled: true,
          embedding: {
            provider: (config.cache.embeddingProvider ?? "local") as "local" | "openai",
            apiKey: config.providers?.openai?.apiKey,
            threshold: config.cache.semanticThreshold ?? 0.92,
          },
        }
      : { enabled: false };

    this._localCache = new LocalCache(".hybriq/cache.db", semanticConfig);
    this._localMetering = new LocalMetering();
    this._localConfig = loadLocalConfig(this._license);
    await this._localCache.init();
    await this._localMetering.init();
  }

  /**
   * Ensure local mode is initialized before use.
   */
  private async ensureLocalInit(): Promise<void> {
    if (this._localInitPromise) {
      await this._localInitPromise;
      this._localInitPromise = null;
    }
  }

  /** Current SDK operating mode. */
  get mode(): "cloud" | "local" {
    return this._mode;
  }

  /**
   * Execute an LLM call with cache wrapping and credit metering.
   *
   * @example
   * ```ts
   * const result = await sdk.execute({
   *   model: "claude-sonnet-4-5-20250929",
   *   messages: [{ role: "user", content: "Hello" }],
   * });
   * ```
   */
  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    if (this._mode === "local") {
      await this.ensureLocalInit();
      return executeLocal(
        request,
        this.providers,
        this._license!,
        this._localCache!,
        this._localMetering!
      );
    }
    return execute(this.apiClient, this.providers, request);
  }

  /**
   * Get local cache statistics (local mode only).
   */
  get cache(): { stats: () => CacheStats } {
    if (this._mode !== "local") {
      throw new Error("cache.stats() is only available in local mode.");
    }
    return {
      stats: () => {
        if (!this._localCache) {
          throw new Error("Local mode not yet initialized.");
        }
        return this._localCache.getStats();
      },
    };
  }

  /**
   * Get local usage report (local mode only).
   */
  async usage(period?: "current" | "all"): Promise<LocalUsageReport> {
    if (this._mode !== "local") {
      throw new Error("usage() is only available in local mode.");
    }
    await this.ensureLocalInit();
    return this._localMetering!.getUsage(period ?? "current");
  }

  /**
   * Export local mode data as a .tar.gz pack for V2 migration (local mode only).
   *
   * @param outputPath - Path for the output .tar.gz file.
   * @param options - Optional export configuration.
   */
  async export(outputPath: string, options?: ExportOptions): Promise<void> {
    if (this._mode !== "local") {
      throw new Error("export() is only available in local mode.");
    }
    await this.ensureLocalInit();
    return exportPack(outputPath, this._license!, this._localCache!, options);
  }

  /**
   * Get current credit balance (cloud mode only).
   */
  async getBalance(): Promise<BalanceInfo> {
    this.requireCloud("getBalance");
    return getBalance(this.apiClient);
  }

  /**
   * List available plans (cloud mode only).
   */
  async getPlans(): Promise<PlanInfo[]> {
    this.requireCloud("getPlans");
    return getPlans(this.apiClient);
  }

  /**
   * Get usage report for a billing period (cloud mode only).
   */
  async getUsage(period?: "current" | "previous"): Promise<UsageReport> {
    this.requireCloud("getUsage");
    return getUsage(this.apiClient, period);
  }

  /**
   * Enrich a contact, account, or domain with cross-tenant caching.
   *
   * @example
   * ```ts
   * const result = await sdk.enrich({
   *   entityType: "contact",
   *   lookupKey: "jane@example.com",
   *   provider: "clearbit",
   * }, async (req) => {
   *   // Call your enrichment provider here
   *   return { name: "Jane Doe", company: "Example Inc" };
   * });
   * ```
   */
  async enrich(
    request: EnrichRequest,
    providerCallback?: (req: EnrichRequest) => Promise<Record<string, unknown>>
  ): Promise<EnrichResult> {
    this.requireCloud("enrich");
    return enrich(this.apiClient, request, providerCallback);
  }

  /**
   * Load local agent/skill configuration (local mode only).
   * Reads from .hybriq/agents/*.yaml and .hybriq/skills/*.yaml.
   */
  async getLocalConfig(): Promise<LocalConfig> {
    if (this._mode !== "local") {
      throw new Error("getLocalConfig() is only available in local mode.");
    }
    await this.ensureLocalInit();
    return this._localConfig!;
  }

  /**
   * Get a local agent definition by ID (local mode only).
   */
  async getLocalAgent(agentId: string): Promise<LocalAgentConfig | undefined> {
    const config = await this.getLocalConfig();
    return getAgent(config, agentId);
  }

  /**
   * Get a local skill definition by ID (local mode only).
   */
  async getLocalSkill(skillId: string): Promise<LocalSkillConfig | undefined> {
    const config = await this.getLocalConfig();
    return getSkill(config, skillId);
  }

  /**
   * Scaffold the .hybriq/ config directory with example agent and skill files.
   */
  static scaffold(baseDir?: string): void {
    scaffoldConfig(baseDir);
  }

  /** Throw if not in cloud mode. */
  private requireCloud(method: string): void {
    if (this._mode !== "cloud") {
      throw new Error(`${method}() is only available in cloud mode.`);
    }
  }
}

// Re-export types
export type {
  HybrIQConfig,
  ExecuteRequest,
  ExecuteResult,
  AgentRunRequest,
  AgentExecutionResult,
  AsyncAccepted,
  ToolCall,
  LibraryItem,
  EnrichRequest,
  EnrichResult,
  BalanceInfo,
  UsageReport,
  PlanInfo,
  SubscriptionInfo,
  Message,
  ProviderConfig,
} from "./types.js";

export {
  HybrIQError,
  AuthError,
  InsufficientCreditsError,
  RateLimitError,
  HybrIQUnavailableError,
} from "./types.js";

export { AgentsModule } from "./agents.js";
export { InvalidLicenseError } from "./license/validator.js";
export { ProviderError } from "./local/engine.js";
export type { LocalAgentConfig, LocalSkillConfig, LocalConfig } from "./local/config.js";
export type { CacheStats } from "./local/cache.js";
export type { LocalUsageReport } from "./local/metering.js";
