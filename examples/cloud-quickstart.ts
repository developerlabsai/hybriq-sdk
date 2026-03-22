/**
 * @hybriq/sdk — Cloud Mode Quick Start
 *
 * Run: npx tsx examples/cloud-quickstart.ts
 *
 * Required env vars:
 *   HYBRIQ_API_KEY=hiq_live_xxx
 *   HYBRIQ_BASE_URL=https://api.hybriq.dev
 *   ANTHROPIC_API_KEY=sk-ant-xxx
 */

import { HybrIQSDK, InsufficientCreditsError, RateLimitError } from "../src/index.js";

async function main(): Promise<void> {
  const sdk = new HybrIQSDK({
    mode: "cloud",
    apiKey: process.env.HYBRIQ_API_KEY!,
    baseUrl: process.env.HYBRIQ_BASE_URL!,
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
    },
  });

  console.log("SDK mode:", sdk.mode);

  // --- Check balance ---
  const balance = await sdk.getBalance();
  console.log(`Credits: ${balance.creditBalance} (${balance.plan} plan)`);

  // --- Execute an LLM call ---
  try {
    const result = await sdk.execute({
      model: "claude-sonnet-4-5-20250929",
      messages: [
        { role: "user", content: "What are the three laws of robotics?" },
      ],
      maxTokens: 256,
    });

    console.log("\n--- Response ---");
    console.log(result.response);
    console.log(`\nCache hit: ${result.cacheHit}`);
    console.log(`Tokens: ${result.tokensIn} in / ${result.tokensOut} out`);
    console.log(`Credits charged: ${result.creditsCharged}`);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      console.error("Not enough credits. Current balance:", err.remainingCredits);
    } else if (err instanceof RateLimitError) {
      console.error("Rate limited. Retry after:", err.retryAfter, "seconds");
    } else {
      throw err;
    }
  }

  // --- Browse library ---
  const agents = await sdk.library.browse("agents");
  console.log(`\nLibrary: ${agents.length} agents available`);

  // --- Usage report ---
  const usage = await sdk.getUsage("current");
  console.log(`\nUsage this period: ${usage.totalExecutions} executions, $${usage.costUsd.toFixed(2)}`);
}

main().catch(console.error);
