/**
 * OpenAI provider — Wraps openai SDK for LLM calls.
 */

import type { ProviderConfig, LLMRequest, LLMResponse } from "../types.js";

/**
 * Calls the OpenAI API using the tenant's API key.
 */
export async function callOpenAI(
  config: ProviderConfig,
  request: LLMRequest
): Promise<LLMResponse> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: config.apiKey });

  const startTime = Date.now();

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }

  for (const m of request.messages) {
    messages.push({
      role: m.role as "user" | "assistant",
      content: m.content,
    });
  }

  const response = await client.chat.completions.create({
    model: request.model,
    messages,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature,
  });

  const durationMs = Date.now() - startTime;

  const content = response.choices[0]?.message?.content ?? "";
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;

  const costUsd = estimateOpenAICost(request.model, tokensIn, tokensOut);

  return {
    content,
    tokensIn,
    tokensOut,
    costUsd,
    durationMs,
    modelProvider: "openai",
    modelName: request.model,
  };
}

/**
 * Estimates cost for OpenAI models (per 1K tokens).
 */
function estimateOpenAICost(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
  };

  const rates = pricing[model] ?? { input: 0.005, output: 0.015 };
  return (tokensIn / 1000) * rates.input + (tokensOut / 1000) * rates.output;
}
