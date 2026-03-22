/**
 * Local execution engine.
 *
 * Runs the full execution pipeline locally with the developer's own
 * LLM API keys. Two-tier cache lookup:
 *   1. Exact match (SHA-256 hash)
 *   2. Semantic match (cosine similarity on embeddings, if enabled)
 *
 * Validates license, checks feature limits, checks cache, calls LLM
 * provider directly, stores results, and logs to local metering.
 */

import type {
  ExecuteRequest,
  ExecuteResult,
  ProviderConfig,
  Message,
} from "../types.js";
import { LocalCache } from "./cache.js";
import { LocalMetering } from "./metering.js";
import type { ValidatedLicense } from "../license/validator.js";
import { checkFeatureAccess } from "../license/validator.js";

/** Error thrown when an LLM provider API call fails. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * Execute an LLM call locally using the developer's own API keys.
 */
export async function executeLocal(
  request: ExecuteRequest,
  providers: { anthropic?: ProviderConfig; openai?: ProviderConfig },
  license: ValidatedLicense,
  cache: LocalCache,
  metering: LocalMetering
): Promise<ExecuteResult> {
  const startTime = Date.now();
  const provider = resolveProvider(request.model);

  // Check feature limits
  if (request.agentId) {
    const canUseAgent = checkFeatureAccess(license, "agent", 0);
    if (!canUseAgent) {
      throw new Error(
        `License tier '${license.payload.tier}' has reached the maximum number of agents (${license.payload.entitlements.maxAgents}).`
      );
    }
  }

  // === Tier 1: Exact match cache ===
  const cacheHash = LocalCache.computeHash(
    request.model,
    request.systemPrompt,
    request.messages
  );
  const cached = cache.get(cacheHash);

  if (cached) {
    const durationMs = Date.now() - startTime;
    metering.logExecution({
      model: request.model,
      tokensIn: cached.tokensIn,
      tokensOut: cached.tokensOut,
      costUsd: 0,
      durationMs,
      cacheHit: true,
      cacheType: "exact",
    });

    return {
      executionId: `local_${Date.now()}`,
      response: cached.response,
      cacheHit: true,
      cacheType: "exact",
      tokensIn: cached.tokensIn,
      tokensOut: cached.tokensOut,
      creditsCharged: 0,
      remainingCredits: -1,
      modelProvider: cached.modelProvider,
      modelName: cached.modelName,
    };
  }

  // === Tier 2: Semantic match cache ===
  const semanticMatch = await cache.getSemanticMatch(
    request.model,
    request.systemPrompt,
    request.messages
  );

  if (semanticMatch) {
    const durationMs = Date.now() - startTime;
    metering.logExecution({
      model: request.model,
      tokensIn: semanticMatch.tokensIn,
      tokensOut: semanticMatch.tokensOut,
      costUsd: 0,
      durationMs,
      cacheHit: true,
      cacheType: "semantic",
    });

    return {
      executionId: `local_${Date.now()}`,
      response: semanticMatch.response,
      cacheHit: true,
      cacheType: "semantic",
      tokensIn: semanticMatch.tokensIn,
      tokensOut: semanticMatch.tokensOut,
      creditsCharged: 0,
      remainingCredits: -1,
      modelProvider: semanticMatch.modelProvider,
      modelName: semanticMatch.modelName,
    };
  }

  // === Cache miss — call LLM provider ===
  const providerConfig = providers[provider];
  if (!providerConfig) {
    throw new ProviderError(
      `No API key configured for provider '${provider}'. Provide it in the SDK config: { providers: { ${provider}: { apiKey: "..." } } }`,
      provider
    );
  }

  let response: string;
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;

  try {
    const result = await callProvider(
      provider,
      providerConfig.apiKey,
      request.model,
      request.systemPrompt,
      request.messages,
      request.maxTokens,
      request.temperature
    );
    response = result.content;
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;
    costUsd = result.costUsd;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(
      `${provider} API call failed: ${err instanceof Error ? err.message : "unknown error"}`,
      provider,
      err instanceof Error && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : undefined
    );
  }

  const durationMs = Date.now() - startTime;

  // Store in cache (exact + semantic embedding)
  await cache.set(
    cacheHash,
    response,
    tokensIn,
    tokensOut,
    provider,
    request.model,
    request.systemPrompt,
    request.messages
  );

  // Log to metering
  metering.logExecution({
    model: request.model,
    tokensIn,
    tokensOut,
    costUsd,
    durationMs,
    cacheHit: false,
  });

  return {
    executionId: `local_${Date.now()}`,
    response,
    cacheHit: false,
    tokensIn,
    tokensOut,
    creditsCharged: 0,
    remainingCredits: -1,
    modelProvider: provider,
    modelName: request.model,
  };
}

/**
 * Resolve which provider to use based on model name.
 */
function resolveProvider(model: string): "anthropic" | "openai" {
  if (
    model.startsWith("claude") ||
    model.includes("anthropic") ||
    model.includes("sonnet") ||
    model.includes("opus") ||
    model.includes("haiku")
  ) {
    return "anthropic";
  }
  return "openai";
}

/**
 * Call an LLM provider directly.
 */
async function callProvider(
  provider: "anthropic" | "openai",
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  messages: Message[],
  maxTokens?: number,
  temperature?: number
): Promise<{
  content: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}> {
  if (provider === "anthropic") {
    return callAnthropic(apiKey, model, systemPrompt, messages, maxTokens, temperature);
  }
  return callOpenAI(apiKey, model, systemPrompt, messages, maxTokens, temperature);
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  messages: Message[],
  maxTokens?: number,
  temperature?: number
): Promise<{ content: string; tokensIn: number; tokensOut: number; costUsd: number }> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens ?? 4096,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (systemPrompt) body.system = systemPrompt;
  if (temperature !== undefined) body.temperature = temperature;

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError(
      `Anthropic API unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      "anthropic"
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ProviderError(
      `Anthropic API returned ${response.status}: ${errorText.slice(0, 500)}`,
      "anthropic",
      response.status
    );
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };

  const content = data.content?.filter((c) => c.type === "text").map((c) => c.text).join("") ?? "";

  return {
    content,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
    costUsd: 0,
  };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  messages: Message[],
  maxTokens?: number,
  temperature?: number
): Promise<{ content: string; tokensIn: number; tokensOut: number; costUsd: number }> {
  const allMessages = [];
  if (systemPrompt) allMessages.push({ role: "system", content: systemPrompt });
  allMessages.push(...messages.map((m) => ({ role: m.role, content: m.content })));

  const body: Record<string, unknown> = { model, messages: allMessages };
  if (maxTokens) body.max_tokens = maxTokens;
  if (temperature !== undefined) body.temperature = temperature;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError(
      `OpenAI API unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      "openai"
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new ProviderError(
      `OpenAI API returned ${response.status}: ${errorText.slice(0, 500)}`,
      "openai",
      response.status
    );
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
    costUsd: 0,
  };
}
