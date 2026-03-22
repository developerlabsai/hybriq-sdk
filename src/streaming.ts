/**
 * T061: SSE streaming client for SDK cloud mode.
 *
 * Provides `AgentsModule.runStream()` that connects to the SSE endpoint
 * and returns an async iterator of streaming events (chunk, done, error).
 */

import type { AgentRunRequest } from "./types.js";
import {
  HybrIQError,
  HybrIQUnavailableError,
} from "./types.js";

/** SSE chunk event data. */
export interface StreamChunkEvent {
  type: "chunk";
  content: string;
  index: number;
}

/** SSE done event data. */
export interface StreamDoneEvent {
  type: "done";
  executionId: string;
  totalTokens: number;
  cost: number;
  cacheHit: boolean;
  duration: number;
}

/** SSE error event data. */
export interface StreamErrorEvent {
  type: "error";
  code: string;
  message: string;
}

/** Union type for all SSE events. */
export type StreamEvent = StreamChunkEvent | StreamDoneEvent | StreamErrorEvent;

/**
 * Connect to an SSE streaming endpoint and yield events.
 *
 * @param baseUrl - The API base URL.
 * @param apiKey - The API key for authentication.
 * @param agentId - The agent ID to execute.
 * @param request - The agent run request.
 * @returns An async iterable of stream events.
 */
export async function* streamAgentRun(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  request: AgentRunRequest
): AsyncGenerator<StreamEvent, void, unknown> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agents/${encodeURIComponent(agentId)}/run`;

  const { messages, metadata, version } = request;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (version) {
    headers["X-Agent-Version"] = version;
  }

  const body = JSON.stringify({
    messages,
    stream: true,
    ...(metadata ? { metadata } : {}),
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });
  } catch (err) {
    throw new HybrIQUnavailableError(
      `Failed to connect to SSE endpoint: ${err instanceof Error ? err.message : "unknown"}`
    );
  }

  if (!response.ok) {
    let errorBody: { error?: string } = {};
    try {
      errorBody = (await response.json()) as typeof errorBody;
    } catch {
      // Ignore
    }
    throw new HybrIQError(
      errorBody.error ?? `HTTP ${response.status}`,
      response.status,
      "SERVER_ERROR"
    );
  }

  if (!response.body) {
    throw new HybrIQError(
      "No response body from SSE endpoint",
      0,
      "STREAM_ERROR"
    );
  }

  // Parse SSE events from the response stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE events from buffer
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? ""; // Keep incomplete event in buffer

      for (const eventText of events) {
        const event = parseSSEEvent(eventText);
        if (event) {
          yield event;
          // Stop after error event
          if (event.type === "error") {
            return;
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const event = parseSSEEvent(buffer);
      if (event) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE event from text.
 */
function parseSSEEvent(text: string): StreamEvent | null {
  const lines = text.split("\n");
  let eventType = "";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      data = line.slice(6);
    }
  }

  if (!eventType || !data) return null;

  try {
    const parsed = JSON.parse(data);

    switch (eventType) {
      case "chunk":
        return {
          type: "chunk",
          content: parsed.content,
          index: parsed.index,
        };
      case "done":
        return {
          type: "done",
          executionId: parsed.executionId,
          totalTokens: parsed.totalTokens,
          cost: parsed.cost,
          cacheHit: parsed.cacheHit,
          duration: parsed.duration,
        };
      case "error":
        return {
          type: "error",
          code: parsed.code,
          message: parsed.message,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
