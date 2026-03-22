/**
 * Anthropic provider — Wraps @anthropic-ai/sdk for LLM calls.
 */

import type { ProviderConfig, LLMRequest, LLMResponse } from "../types.js";

/**
 * Calls the Anthropic API using the tenant's API key.
 */
export async function callAnthropic(
  config: ProviderConfig,
  request: LLMRequest
): Promise<LLMResponse> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: config.apiKey });

  const startTime = Date.now();

  const response = await client.messages.create({
    model: request.model,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature,
    system: request.systemPrompt,
    messages: request.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const durationMs = Date.now() - startTime;

  // Extract text content from response
  const content = response.content
    .filter((block) => block.type === "text")
    .map((block) => {
      if (block.type === "text") return block.text;
      return "";
    })
    .join("");

  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;

  // Approximate cost calculation
  const costUsd = estimateAnthropicCost(request.model, tokensIn, tokensOut);

  return {
    content,
    tokensIn,
    tokensOut,
    costUsd,
    durationMs,
    modelProvider: "anthropic",
    modelName: request.model,
  };
}

/**
 * Estimates cost for Anthropic models (per 1K tokens).
 */
function estimateAnthropicCost(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-opus-4-6": { input: 0.015, output: 0.075 },
    "claude-sonnet-4-5-20250929": { input: 0.003, output: 0.015 },
    "claude-haiku-4-5-20251001": { input: 0.0008, output: 0.004 },
  };

  const rates = pricing[model] ?? { input: 0.003, output: 0.015 };
  return (tokensIn / 1000) * rates.input + (tokensOut / 1000) * rates.output;
}
