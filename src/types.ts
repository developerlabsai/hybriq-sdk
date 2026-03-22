/**
 * @hybriq/sdk — Public type definitions.
 */

/** Configuration for initializing the HybrIQSDK. */
export interface HybrIQConfig {
  /** SDK operating mode: 'cloud' (V2 SaaS) or 'local' (OSS self-hosted). */
  mode?: "cloud" | "local";
  /** HybrIQ API key (format: hiq_live_xxx or hiq_xxx). Required for cloud mode. */
  apiKey?: string;
  /** HybrIQ API base URL. Required for cloud mode. */
  baseUrl?: string;
  /** OSS license key (format: hiq_oss_xxx). Required for local mode. */
  licenseKey?: string;
  /** LLM provider configurations (tenant provides their own keys). */
  providers?: {
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
  };
  /** Cache behavior options. */
  cache?: {
    enabled?: boolean;
    /** Enable semantic similarity matching (local mode). */
    semanticMatch?: boolean;
    /** Embedding provider for semantic cache: "local" (TF-IDF, offline) or "openai". */
    embeddingProvider?: "local" | "openai";
    /** Cosine similarity threshold for semantic matches (0-1). Default: 0.92. */
    semanticThreshold?: number;
    crossTenant?: boolean;
  };
}

/** Provider credential configuration. */
export interface ProviderConfig {
  apiKey: string;
}

/** A message in a conversation. */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Request to execute an LLM call with caching. */
export interface ExecuteRequest {
  /** Model identifier (e.g., "claude-sonnet-4-5-20250929", "gpt-4o"). */
  model: string;
  /** System prompt for the LLM. */
  systemPrompt?: string;
  /** Conversation messages. */
  messages: Message[];
  /** Max tokens for generation. */
  maxTokens?: number;
  /** Temperature for sampling. */
  temperature?: number;
  /** Agent ID for cache scoping. */
  agentId?: string;
  /** Skill ID for cache scoping. */
  skillId?: string;
  /** Whether this response is safe to share cross-tenant. */
  shareable?: boolean;
  /** Additional metadata to record. */
  metadata?: Record<string, unknown>;
}

/** Result of an LLM execution. */
export interface ExecuteResult {
  /** Unique execution ID from HybrIQ. */
  executionId: string;
  /** The LLM response text. */
  response: string;
  /** Whether the response came from cache. */
  cacheHit: boolean;
  /** Cache type if hit ("exact" | "semantic"). */
  cacheType?: "exact" | "semantic";
  /** Input tokens used. */
  tokensIn: number;
  /** Output tokens generated. */
  tokensOut: number;
  /** Credits charged for this execution. */
  creditsCharged: number;
  /** Remaining credit balance after execution. */
  remainingCredits: number;
  /** Model provider used. */
  modelProvider: string;
  /** Model name used. */
  modelName: string;
  /** Whether running in degraded mode (API unreachable). */
  degraded?: boolean;
}

/** LLM provider request (internal). */
export interface LLMRequest {
  model: string;
  systemPrompt?: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

/** LLM provider response (internal). */
export interface LLMResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  modelProvider: string;
  modelName: string;
}

/** Library item (agent, skill, specialty, team cluster). */
export interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  type: "agent" | "skill" | "specialty" | "team_cluster";
  version: string;
  category?: string;
  tags?: string[];
  visibility: "public" | "private";
  subscribed?: boolean;
  subscriptionId?: string;
  config?: Record<string, unknown>;
}

/** Enrichment request. */
export interface EnrichRequest {
  /** Entity type to enrich. */
  entityType: "contact" | "account" | "domain";
  /** Lookup key (email, domain, URL). */
  lookupKey: string;
  /** Enrichment provider. */
  provider: string;
  /** Pre-fetched enrichment data (if SDK called provider). */
  enrichedData?: Record<string, unknown>;
  /** Whether to isolate data to this tenant only. */
  isolateTenant?: boolean;
}

/** Enrichment result. */
export interface EnrichResult {
  /** Whether data came from cache. */
  cacheHit: boolean;
  /** The enriched data. */
  data?: Record<string, unknown>;
  /** Enrichment provider. */
  provider: string;
  /** Data confidence score. */
  confidence?: number;
  /** Credits charged. */
  creditsCharged: number;
  /** Execution ID for tracking. */
  executionId?: string;
}

/** Credit balance information. */
export interface BalanceInfo {
  /** Current credit balance. */
  creditBalance: number;
  /** Total credits purchased (lifetime). */
  creditsPurchased: number;
  /** Current plan name. */
  plan: string;
  /** Billing cycle start. */
  billingCycleStart?: string;
  /** Billing cycle end. */
  billingCycleEnd?: string;
}

/** Usage report for a billing period. */
export interface UsageReport {
  period: {
    start: string;
    end: string;
  };
  totalExecutions: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  creditsUsed: number;
  creditsByType: Record<string, number>;
  costUsd: number;
}

/** Plan information. */
export interface PlanInfo {
  id: string;
  name: string;
  displayName: string;
  monthlyCredits: number;
  priceUsd: number;
  apiRateLimit: number;
  semanticCacheEnabled: boolean;
  crossTenantCache: boolean;
}

/** Library subscription details. */
export interface SubscriptionInfo {
  id: string;
  itemType: string;
  itemId: string;
  configOverrides?: Record<string, unknown>;
  active: boolean;
  subscribedAt: string;
  item?: LibraryItem;
}

/** Request to execute an agent via the agent endpoint. */
export interface AgentRunRequest {
  /** Conversation messages to send to the agent. */
  messages: Message[];
  /** HTTPS webhook URL for async result delivery. */
  webhook?: string;
  /** Enable SSE streaming response. */
  stream?: boolean;
  /** Arbitrary metadata attached to the execution log. */
  metadata?: Record<string, unknown>;
  /** Pin execution to a specific agent version. */
  version?: string;
}

/** Tool call made during agent execution. */
export interface ToolCall {
  /** Tool call ID. */
  id: string;
  /** Tool name. */
  name: string;
  /** Tool arguments. */
  arguments: Record<string, unknown>;
}

/** Result of an agent execution. */
export interface AgentExecutionResult {
  /** Unique execution ID. */
  executionId: string;
  /** Execution status. */
  status: "completed" | "failed";
  /** Agent response. */
  response: {
    /** The agent's text response. */
    content: string;
    /** Tool calls made during execution. */
    toolCalls?: ToolCall[];
    /** Input tokens consumed. */
    tokensIn?: number;
    /** Output tokens generated. */
    tokensOut?: number;
    /** Whether the response was served from cache. */
    cacheHit: boolean;
  };
  /** Execution cost and timing. */
  cost: {
    /** Total cost in USD. */
    usd: number;
    /** Wall-clock execution time in milliseconds. */
    durationMs: number;
  };
  /** Error message when status is "failed". */
  error?: string;
}

/** Async execution accepted response. */
export interface AsyncAccepted {
  /** Execution ID for polling or webhook correlation. */
  executionId: string;
  /** Always "accepted" for async mode. */
  status: "accepted";
}

/** SDK error types. */
export class HybrIQError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = "HybrIQError";
  }
}

export class AuthError extends HybrIQError {
  constructor(message = "Unauthorized") {
    super(message, 401, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

export class InsufficientCreditsError extends HybrIQError {
  constructor(
    public remainingCredits: number,
    message = "Insufficient credits"
  ) {
    super(message, 402, "INSUFFICIENT_CREDITS");
    this.name = "InsufficientCreditsError";
  }
}

export class RateLimitError extends HybrIQError {
  constructor(
    public retryAfter?: number,
    message = "Rate limit exceeded"
  ) {
    super(message, 429, "RATE_LIMIT");
    this.name = "RateLimitError";
  }
}

export class HybrIQUnavailableError extends HybrIQError {
  constructor(message = "HybrIQ API is unreachable") {
    super(message, 0, "UNAVAILABLE");
    this.name = "HybrIQUnavailableError";
  }
}
