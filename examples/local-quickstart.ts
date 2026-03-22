/**
 * @hybriq/sdk — Local Mode Quick Start
 *
 * Run: npx tsx examples/local-quickstart.ts
 *
 * Required env vars:
 *   HYBRIQ_LICENSE_KEY=hiq_oss_xxx
 *   ANTHROPIC_API_KEY=sk-ant-xxx  (or OPENAI_API_KEY for OpenAI models)
 */

import { HybrIQSDK, ProviderError } from "../src/index.js";

async function main(): Promise<void> {
  const sdk = new HybrIQSDK({
    mode: "local",
    licenseKey: process.env.HYBRIQ_LICENSE_KEY!,
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
    },
    cache: {
      semanticMatch: true,
      embeddingProvider: "local",  // Offline TF-IDF, no API needed
      semanticThreshold: 0.92,
    },
  });

  console.log("SDK mode:", sdk.mode);

  // --- Execute first call (cache miss) ---
  try {
    console.log("\n--- First call (cache miss expected) ---");
    const result1 = await sdk.execute({
      model: "claude-sonnet-4-5-20250929",
      messages: [
        { role: "user", content: "Explain what a neural network is in simple terms." },
      ],
      maxTokens: 256,
    });

    console.log(result1.response.slice(0, 200) + "...");
    console.log(`Cache hit: ${result1.cacheHit}`);

    // --- Execute same call again (exact cache hit) ---
    console.log("\n--- Second call (exact cache hit expected) ---");
    const result2 = await sdk.execute({
      model: "claude-sonnet-4-5-20250929",
      messages: [
        { role: "user", content: "Explain what a neural network is in simple terms." },
      ],
      maxTokens: 256,
    });

    console.log(`Cache hit: ${result2.cacheHit}, Type: ${result2.cacheType}`);

    // --- Execute similar call (semantic cache hit expected) ---
    console.log("\n--- Third call (semantic cache hit expected) ---");
    const result3 = await sdk.execute({
      model: "claude-sonnet-4-5-20250929",
      messages: [
        { role: "user", content: "Can you explain neural networks simply?" },
      ],
      maxTokens: 256,
    });

    console.log(`Cache hit: ${result3.cacheHit}, Type: ${result3.cacheType ?? "none"}`);
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error(`Provider error (${err.provider}): ${err.message}`);
    } else {
      throw err;
    }
  }

  // --- Cache stats ---
  const stats = sdk.cache.stats();
  console.log("\n--- Cache Stats ---");
  console.log(`  Entries:       ${stats.totalEntries}`);
  console.log(`  Hit rate:      ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`  Exact hits:    ${stats.exactHits}`);
  console.log(`  Semantic hits: ${stats.semanticHits}`);
  console.log(`  Savings:       $${stats.estimatedSavingsUsd.toFixed(2)}`);

  // --- Usage report ---
  const usage = await sdk.usage("current");
  console.log("\n--- Usage (Last 30 Days) ---");
  console.log(`  Executions: ${usage.totalExecutions}`);
  console.log(`  Tokens in:  ${usage.totalTokensIn}`);
  console.log(`  Tokens out: ${usage.totalTokensOut}`);
  console.log(`  Total cost: $${usage.totalCostUsd.toFixed(4)}`);

  // --- Local agent config ---
  try {
    const config = await sdk.getLocalConfig();
    console.log(`\n--- Local Config ---`);
    console.log(`  Agents: ${config.agents.length}`);
    console.log(`  Skills: ${config.skills.length}`);
    for (const agent of config.agents) {
      console.log(`    - ${agent.id}: ${agent.name} (${agent.model})`);
    }
  } catch {
    console.log("\nNo local config found. Run: npx hybriq init");
  }
}

main().catch(console.error);
