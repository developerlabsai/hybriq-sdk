/**
 * HybrIQApiClient — HTTP client for the HybrIQ API.
 *
 * Handles authentication, error mapping, and retry logic.
 */

import {
  AuthError,
  InsufficientCreditsError,
  RateLimitError,
  HybrIQError,
  HybrIQUnavailableError,
} from "./types.js";

export class HybrIQApiClient {
  /** @internal */
  readonly apiKey: string;
  /** @internal */
  readonly baseUrl: string;

  constructor(config: { apiKey: string; baseUrl: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  /**
   * POST request to the HybrIQ API.
   */
  async post<T = unknown>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const { data } = await this.request<T>("POST", path, body, extraHeaders);
    return data;
  }

  /**
   * POST request returning both data and response headers.
   */
  async postWithHeaders<T = unknown>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<{ data: T; headers: Headers }> {
    return this.request<T>("POST", path, body, extraHeaders);
  }

  /**
   * GET request to the HybrIQ API.
   */
  async get<T = unknown>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    let url = path;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url = `${path}?${searchParams.toString()}`;
    }
    const { data } = await this.request<T>("GET", url);
    return data;
  }

  /**
   * DELETE request to the HybrIQ API.
   */
  async delete<T = unknown>(path: string): Promise<T> {
    const { data } = await this.request<T>("DELETE", path);
    return data;
  }

  /**
   * Internal request handler with retry logic for 5xx and 429 errors.
   * 402 (InsufficientCredits) is never retried.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    attempt = 0
  ): Promise<{ data: T; headers: Headers }> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      // Network error — retry up to 3 times, then throw HybrIQUnavailableError
      if (attempt < 3) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
        await new Promise((r) => setTimeout(r, delay));
        return this.request<T>(method, path, body, extraHeaders, attempt + 1);
      }
      throw new HybrIQUnavailableError(
        `HybrIQ API unreachable after ${attempt + 1} attempts: ${err instanceof Error ? err.message : "unknown"}`
      );
    }

    if (response.ok) {
      return { data: (await response.json()) as T, headers: response.headers };
    }

    // Parse error response
    let errorBody: { error?: string; remainingCredits?: number; retryAfter?: number } = {};
    try {
      errorBody = (await response.json()) as typeof errorBody;
    } catch {
      // Ignore parse errors
    }

    // Map status codes to specific error types
    switch (response.status) {
      case 401:
        throw new AuthError(errorBody.error);
      case 402:
        // Never retry 402 — credits won't magically appear
        throw new InsufficientCreditsError(
          errorBody.remainingCredits ?? 0,
          errorBody.error
        );
      case 429: {
        // Retry-After-aware retry (up to 3 attempts)
        if (attempt < 3) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
          const delay = retryAfterSec && retryAfterSec > 0
            ? Math.min(retryAfterSec * 1000, 30_000)
            : Math.min(1000 * Math.pow(2, attempt), 4000);
          await new Promise((r) => setTimeout(r, delay));
          return this.request<T>(method, path, body, extraHeaders, attempt + 1);
        }
        throw new RateLimitError(errorBody.retryAfter, errorBody.error);
      }
      default:
        // Retry 5xx errors with exponential backoff (max 3 retries)
        if (response.status >= 500 && attempt < 3) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
          await new Promise((r) => setTimeout(r, delay));
          return this.request<T>(method, path, body, extraHeaders, attempt + 1);
        }
        throw new HybrIQError(
          errorBody.error ?? `HTTP ${response.status}`,
          response.status,
          "SERVER_ERROR"
        );
    }
  }
}
