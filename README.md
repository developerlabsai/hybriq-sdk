# @hybriq/sdk

[![CI](https://github.com/developerlabsai/hybriq-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/developerlabsai/hybriq-sdk/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@hybriq/sdk.svg)](https://www.npmjs.com/package/@hybriq/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

**Federated intelligence layer for AI agent teams.**

Model-agnostic, cache-wrapped LLM execution with semantic caching, agent orchestration, federated library, enrichment, and built-in billing. Works with any LLM: Claude, GPT-4o, AWS Bedrock, Gemini, Mistral, and more.

---

## Installation

```bash
npm install @hybriq/sdk
```

**With a specific LLM provider:**

```bash
# Anthropic Claude
npm install @hybriq/sdk @anthropic-ai/sdk

# OpenAI
npm install @hybriq/sdk openai
```

## Quick Start

### Cloud Mode (Production)

Connect to the HybrIQ platform for managed caching, billing, and the federated library.

```typescript
import { HybrIQSDK } from "@hybriq/sdk";

const sdk = new HybrIQSDK({
  mode: "cloud",
  apiKey: "hiq_live_your_api_key",       // From developer portal
  baseUrl: "https://api.hybriq.dev",
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
    openai: { apiKey: process.env.OPENAI_API_KEY! },
  },
});

// Execute with automatic caching + credit billing
const result = await sdk.execute({
  model: "claude-sonnet-4-5-20250929",
  messages: [{ role: "user", content: "Explain quantum computing in 3 sentences." }],
});

console.log(result.response);
console.log(`Cache hit: ${result.cacheHit}, Credits: ${result.creditsCharged}`);
```

### Local Mode (Development / OSS)

Run entirely on your machine with a free license key. No external API required.

```typescript
const sdk = new HybrIQSDK({
  mode: "local",
  licenseKey: "hiq_oss_your_license_key",
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
  },
  cache: {
    semanticMatch: true,        // Two-tier semantic cache
    embeddingProvider: "local",  // Offline TF-IDF (or "openai")
    semanticThreshold: 0.92,    // Cosine similarity threshold
  },
});

const result = await sdk.execute({
  model: "claude-sonnet-4-5-20250929",
  messages: [{ role: "user", content: "What is machine learning?" }],
});

// Check cache stats
const stats = sdk.cache.stats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Savings: $${stats.estimatedSavingsUsd.toFixed(2)}`);
```

## Features

| Feature | Cloud | Local |
|---------|-------|-------|
| LLM Execution | Cache + credits via API | SQLite two-tier cache |
| Semantic Cache | Server-side (production) | Exact + cosine similarity |
| Agent Orchestration | Full run/stream/async | YAML config (license-gated) |
| Library Catalog | Browse/subscribe (4 layers) | Local YAML definitions |
| Enrichment | Cross-tenant cache | -- |
| Billing | Real-time credits | Local metering + cost tracking |
| Analytics | Full dashboard | CLI (`npx hybriq stats`) |
| Data Export | -- | `.tar.gz` pack for migration |

## Architecture

### Two-Tier Semantic Cache

Every execution flows through two cache tiers before making an API call:

1. **Exact Match** -- SHA-256 hash of (model + systemPrompt + messages). Sub-millisecond, zero cost.
2. **Semantic Match** -- Cosine similarity on embedding vectors. Catches rephrased prompts.

```
Request -> [Exact Hash?] --hit--> Return cached (free)
              |
             miss
              v
           [Semantic Match?] --hit--> Return cached (free)
              |
             miss
              v
           [Call LLM API] --> Store in both caches
```

**Embedding Strategies:**
- `"local"` -- TF-IDF with n-gram feature hashing. 256-dim vectors. Zero dependencies, works offline.
- `"openai"` -- text-embedding-3-small. 1536-dim vectors. Higher quality, requires API key.

### Cloud Execution Flow

```
sdk.execute() -> POST /execute/start (reserve credits, check cache)
                    |
                   miss -> Call LLM provider directly (your API keys)
                    |
                 POST /execute/complete (finalize credits, store cache)
```

Credits are reserved before the LLM call and refunded if the call fails. The SDK gracefully degrades to direct LLM calls if the HybrIQ API is unreachable.

## API Reference

### `HybrIQSDK`

#### Constructor

```typescript
new HybrIQSDK(config: HybrIQConfig)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | `"cloud" \| "local"` | Yes | Execution mode |
| `apiKey` | `string` | Cloud | API key from developer portal |
| `baseUrl` | `string` | Cloud | HybrIQ API base URL |
| `licenseKey` | `string` | Local | OSS license key (`hiq_oss_...`) |
| `providers` | `object` | Yes | LLM provider API keys |
| `cache` | `object` | No | Cache configuration (local mode) |

#### Core Methods

| Method | Mode | Returns | Description |
|--------|------|---------|-------------|
| `execute(request)` | Both | `ExecuteResult` | Execute an LLM call with caching |
| `cache.stats()` | Local | `CacheStats` | Cache performance metrics |
| `usage(period?)` | Local | `LocalUsageReport` | Execution usage report |
| `export(outputPath)` | Local | `void` | Export pack for cloud migration |

#### Cloud-Only Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `agents.run(id, request)` | `AgentExecutionResult` | Run a cloud agent |
| `agents.runStream(id, request)` | `AsyncGenerator` | Stream agent response (SSE) |
| `library.browse(type, params?)` | `LibraryItem[]` | Browse the federated catalog |
| `library.subscribe(type, id)` | `SubscriptionInfo` | Subscribe to a library item |
| `library.list()` | `SubscriptionInfo[]` | List active subscriptions |
| `enrich(request)` | `EnrichResult` | Cross-tenant entity enrichment |
| `getBalance()` | `BalanceInfo` | Current credit balance |
| `getUsage(period?)` | `UsageReport` | Usage report for billing period |
| `getPlans()` | `PlanInfo[]` | Available billing plans |

#### Local-Only Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getLocalConfig()` | `LocalConfig` | Load all YAML agents/skills |
| `getLocalAgent(id)` | `LocalAgentConfig` | Load a specific agent config |
| `getLocalSkill(id)` | `LocalSkillConfig` | Load a specific skill config |

### `ExecuteRequest`

```typescript
interface ExecuteRequest {
  model: string;                    // e.g., "claude-sonnet-4-5-20250929", "gpt-4o"
  messages: Message[];              // Conversation messages
  systemPrompt?: string;            // System instruction
  maxTokens?: number;               // Max response tokens
  temperature?: number;             // Sampling temperature (0-1)
  agentId?: string;                 // Tag execution with agent
  skillId?: string;                 // Tag execution with skill
  shareable?: boolean;              // Allow cross-tenant cache (cloud)
  metadata?: Record<string, unknown>; // Custom metadata
}
```

### `ExecuteResult`

```typescript
interface ExecuteResult {
  executionId: string;
  response: string;
  cacheHit: boolean;
  cacheType?: "exact" | "semantic";
  tokensIn: number;
  tokensOut: number;
  creditsCharged: number;
  remainingCredits?: number;
  modelProvider: string;
  modelName: string;
  degraded?: boolean;               // True if API was unreachable
}
```

### Error Classes

```typescript
import {
  HybrIQError,                // Base error (all SDK errors extend this)
  AuthError,                   // 401 — invalid API key
  InsufficientCreditsError,    // 402 — not enough credits
  RateLimitError,              // 429 — rate limit exceeded
  ProviderError,               // LLM provider error
  HybrIQUnavailableError,     // Service unreachable
} from "@hybriq/sdk";
```

| Error | Status | Properties |
|-------|--------|------------|
| `AuthError` | 401 | `message` |
| `InsufficientCreditsError` | 402 | `remainingCredits` |
| `RateLimitError` | 429 | `retryAfter` (seconds) |
| `ProviderError` | varies | `provider`, `statusCode` |

## Agents & Skills (Local YAML Config)

Define agents and skills in `.hybriq/` YAML files:

```bash
# Scaffold example configs
npx hybriq init
```

```yaml
# .hybriq/agents/researcher.yaml
name: Researcher
description: Research assistant with web search
model: claude-sonnet-4-5-20250929
systemPrompt: |
  You are a research assistant. Provide well-sourced answers.
maxTokens: 4096
temperature: 0.3
skills:
  - summarize
  - extract-entities
tags:
  - research
```

```typescript
const config = await sdk.getLocalConfig();
const agent = await sdk.getLocalAgent("researcher");
```

**License limits:** Community (5 agents / 10 skills), Pro (unlimited).

## CLI

```bash
# View local stats (cache, executions, savings)
npx hybriq stats

# Scaffold .hybriq/ config directory
npx hybriq init
```

The `stats` command displays cache hit rates, token savings, execution history, and storage usage with formatted ANSI output.

## Developer Portal

Self-service web portal for managing your HybrIQ account:

- Account signup with 100 free credits
- Email verification and Terms of Service
- API key creation and revocation
- Usage dashboard and billing
- Agent and skill management

## Error Handling

```typescript
try {
  const result = await sdk.execute({ ... });
} catch (err) {
  if (err instanceof InsufficientCreditsError) {
    console.log(`Low credits: ${err.remainingCredits}`);
    // Prompt user to upgrade plan
  } else if (err instanceof RateLimitError) {
    console.log(`Retry after ${err.retryAfter}s`);
    // Back off and retry
  } else if (err instanceof ProviderError) {
    console.log(`${err.provider} failed: ${err.message}`);
    // Try a different model/provider
  } else if (err instanceof AuthError) {
    console.log("Invalid API key");
    // Check credentials
  }
}
```

## Migration: Local to Cloud

Export your local cache and configs for seamless migration to the cloud platform:

```typescript
// 1. Export from local
const sdk = new HybrIQSDK({ mode: "local", licenseKey: "..." });
await sdk.export("./hybriq-export.tar.gz");

// 2. Import to cloud (via API or portal upload)
```

The export includes agents, skills, and cached responses in a portable `.tar.gz` format.

## TypeScript Support

Full type definitions included. All interfaces are exported:

```typescript
import type {
  HybrIQConfig,
  ExecuteRequest,
  ExecuteResult,
  AgentRunRequest,
  AgentExecutionResult,
  LibraryItem,
  SubscriptionInfo,
  EnrichRequest,
  EnrichResult,
  BalanceInfo,
  UsageReport,
  PlanInfo,
  LocalAgentConfig,
  LocalSkillConfig,
  CacheStats,
} from "@hybriq/sdk";
```

## Examples

See the [examples/](examples/) directory for complete working code:

- [Cloud Quickstart](examples/cloud-quickstart.ts) — API key auth, execution, library browsing, billing
- [Local Quickstart](examples/local-quickstart.ts) — License key, cache demonstration, stats

## Requirements

- **Node.js** 18+
- **TypeScript** 5.0+ (optional but recommended)
- At least one LLM provider SDK installed as a peer dependency

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT -- see [LICENSE](LICENSE) for details.
