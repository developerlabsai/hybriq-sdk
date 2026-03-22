/**
 * Unit tests for HybrIQApiClient — HTTP client with retry logic.
 *
 * Uses MSW to intercept HTTP requests and simulate API responses,
 * error codes, and retry scenarios.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server.js";
import { HybrIQApiClient } from "../../src/client.js";
import {
  AuthError,
  InsufficientCreditsError,
  RateLimitError,
  HybrIQError,
} from "../../src/types.js";

const BASE_URL = "http://localhost:3000";
const API_KEY = "hiq_test_client";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("HybrIQApiClient", () => {
  const client = new HybrIQApiClient({ apiKey: API_KEY, baseUrl: BASE_URL });

  describe("GET requests", () => {
    it("should make authenticated GET requests", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v1/test`, ({ request }) => {
          const auth = request.headers.get("Authorization");
          expect(auth).toBe(`Bearer ${API_KEY}`);
          return HttpResponse.json({ ok: true });
        })
      );

      const result = await client.get<{ ok: boolean }>("/api/v1/test");
      expect(result.ok).toBe(true);
    });

    it("should append query params to GET requests", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v1/search`, ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get("q")).toBe("hello");
          expect(url.searchParams.get("page")).toBe("2");
          return HttpResponse.json({ results: [] });
        })
      );

      await client.get("/api/v1/search", { q: "hello", page: "2" });
    });
  });

  describe("POST requests", () => {
    it("should send JSON body in POST requests", async () => {
      server.use(
        http.post(`${BASE_URL}/api/v1/data`, async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual({ name: "test" });
          return HttpResponse.json({ id: "123" });
        })
      );

      const result = await client.post<{ id: string }>("/api/v1/data", {
        name: "test",
      });
      expect(result.id).toBe("123");
    });
  });

  describe("DELETE requests", () => {
    it("should make DELETE requests", async () => {
      server.use(
        http.delete(`${BASE_URL}/api/v1/item/123`, () => {
          return HttpResponse.json({ deleted: true });
        })
      );

      const result = await client.delete<{ deleted: boolean }>(
        "/api/v1/item/123"
      );
      expect(result.deleted).toBe(true);
    });
  });

  describe("Error handling", () => {
    it("should throw AuthError on 401", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v1/protected`, () => {
          return HttpResponse.json(
            { error: "Invalid API key" },
            { status: 401 }
          );
        })
      );

      await expect(client.get("/api/v1/protected")).rejects.toThrow(AuthError);
    });

    it("should throw InsufficientCreditsError on 402", async () => {
      server.use(
        http.post(`${BASE_URL}/api/v1/execute`, () => {
          return HttpResponse.json(
            { error: "No credits", remainingCredits: 0 },
            { status: 402 }
          );
        })
      );

      await expect(client.post("/api/v1/execute", {})).rejects.toThrow(
        InsufficientCreditsError
      );
    });

    it("should throw RateLimitError on 429 after retries", async () => {
      let attempts = 0;
      server.use(
        http.get(`${BASE_URL}/api/v1/limited`, () => {
          attempts++;
          return HttpResponse.json(
            { error: "Rate limited" },
            { status: 429, headers: { "Retry-After": "0" } }
          );
        })
      );

      await expect(client.get("/api/v1/limited")).rejects.toThrow(
        RateLimitError
      );
      // Should have retried 3 times + initial = 4 attempts
      expect(attempts).toBe(4);
    });

    it("should throw HybrIQError on other 4xx errors", async () => {
      server.use(
        http.get(`${BASE_URL}/api/v1/notfound`, () => {
          return HttpResponse.json({ error: "Not found" }, { status: 404 });
        })
      );

      await expect(client.get("/api/v1/notfound")).rejects.toThrow(
        HybrIQError
      );
    });
  });

  describe("Retry logic", () => {
    it("should retry on 5xx errors up to 3 times", async () => {
      let attempts = 0;
      server.use(
        http.get(`${BASE_URL}/api/v1/flaky`, () => {
          attempts++;
          if (attempts < 3) {
            return HttpResponse.json(
              { error: "Server error" },
              { status: 500 }
            );
          }
          return HttpResponse.json({ ok: true });
        })
      );

      const result = await client.get<{ ok: boolean }>("/api/v1/flaky");
      expect(result.ok).toBe(true);
      expect(attempts).toBe(3);
    });

    it("should not retry 402 errors", async () => {
      let attempts = 0;
      server.use(
        http.post(`${BASE_URL}/api/v1/pay`, () => {
          attempts++;
          return HttpResponse.json(
            { error: "No credits", remainingCredits: 0 },
            { status: 402 }
          );
        })
      );

      await expect(client.post("/api/v1/pay", {})).rejects.toThrow(
        InsufficientCreditsError
      );
      expect(attempts).toBe(1); // No retries
    });
  });

  describe("URL normalization", () => {
    it("should strip trailing slash from baseUrl", () => {
      const c = new HybrIQApiClient({
        apiKey: "key",
        baseUrl: "http://example.com/",
      });
      expect(c.baseUrl).toBe("http://example.com");
    });
  });
});
