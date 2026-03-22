/**
 * AgentsModule — SDK module for agent execution.
 *
 * Provides typed `run()` method that calls `POST /api/v1/agents/{agentId}/run`
 * and returns a typed `AgentExecutionResult`.
 */

import { HybrIQApiClient } from "./client.js";
import { streamAgentRun, type StreamEvent } from "./streaming.js";
import type { AgentRunRequest, AgentExecutionResult } from "./types.js";

export class AgentsModule {
  constructor(private client: HybrIQApiClient) {}


  /**
   * Execute an agent with the given messages.
   *
   * @param agentId - The agent to execute.
   * @param request - Messages, optional webhook/stream/metadata.
   * @returns Typed execution result with response, cost, and cache info.
   *
   * @example
   * ```ts
   * const result = await sdk.agents.run("agent-id", {
   *   messages: [{ role: "user", content: "Summarize this document" }],
   * });
   * console.log(result.response.content);
   * ```
   */
  async run(
    agentId: string,
    request: AgentRunRequest
  ): Promise<AgentExecutionResult> {
    const { messages, webhook, stream, metadata, version } = request;

    const extraHeaders: Record<string, string> = {};
    if (version) {
      extraHeaders["X-Agent-Version"] = version;
    }

    const body = {
      messages,
      ...(webhook ? { webhook } : {}),
      ...(stream !== undefined ? { stream } : {}),
      ...(metadata ? { metadata } : {}),
    };

    const { data, headers } = await this.client.postWithHeaders<AgentExecutionResult>(
      `/api/v1/agents/${encodeURIComponent(agentId)}/run`,
      body,
      Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined
    );

    // Populate cacheHit from X-Cache header if not already set
    if (data.response && headers.get("X-Cache")) {
      data.response.cacheHit = headers.get("X-Cache") === "HIT";
    }

    return data;
  }

  /**
   * Execute an agent with SSE streaming, returning an async iterator of events.
   *
   * @param agentId - The agent to execute.
   * @param request - Messages and optional metadata/version.
   * @returns Async iterator yielding chunk, done, and error events.
   *
   * @example
   * ```ts
   * for await (const event of sdk.agents.runStream("agent-id", {
   *   messages: [{ role: "user", content: "Tell me a story" }],
   * })) {
   *   if (event.type === "chunk") process.stdout.write(event.content);
   *   if (event.type === "done") console.log("\nDone:", event.executionId);
   * }
   * ```
   */
  async *runStream(
    agentId: string,
    request: Omit<AgentRunRequest, "stream" | "webhook">
  ): AsyncGenerator<StreamEvent, void, unknown> {
    yield* streamAgentRun(this.client.baseUrl, this.client.apiKey, agentId, {
      ...request,
      stream: true,
    });
  }
}
