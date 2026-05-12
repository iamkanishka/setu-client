import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfig } from "../src/config/index.js";
import { jsonRequest, request } from "../src/http/index.js";
import { resetBuckets } from "../src/ratelimit/index.js";

const cfg = createConfig({
  clientId: "cid",
  clientSecret: "csec",
  maxRetries: 0, // disable retries for unit tests
  timeoutMs: 5_000,
  rateLimitRps: 1000,
  rateLimitBurst: 1000,
});

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const responseHeaders = new Headers(headers);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: responseHeaders,
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    })
  );
}

beforeEach(() => resetBuckets());
afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("returns ok with raw response on 200", async () => {
    mockFetch(200, { id: "abc" });
    const r = await request("GET", "https://example.com/api", {}, undefined, cfg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe(200);
  });

  it("returns ok even on 4xx (raw layer does not decode errors)", async () => {
    mockFetch(400, { error: "bad" });
    const r = await request("GET", "https://example.com/api", {}, undefined, cfg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe(400);
  });

  it("returns network error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const r = await request("GET", "https://example.com/api", {}, undefined, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe("network");
      expect(r.error.retryable).toBe(true);
    }
  });

  it("sends user-agent header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", fetchMock);
    await request("GET", "https://example.com", {}, undefined, cfg);
    const calledHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(calledHeaders["user-agent"]).toContain("setu-node");
  });
});

describe("jsonRequest", () => {
  it("decodes 2xx JSON body", async () => {
    mockFetch(200, { intentLink: "upi://pay?..." });
    const r = await jsonRequest("GET", "https://example.com/api", {}, undefined, cfg);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data as Record<string, unknown>)["intentLink"]).toBe("upi://pay?...");
  });

  it("returns empty object for 204 with empty body", async () => {
    mockFetch(200, "");
    const r = await jsonRequest("GET", "https://example.com", {}, undefined, cfg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({});
  });

  it("returns auth error for 401", async () => {
    mockFetch(401, { message: "Unauthorized" });
    const r = await jsonRequest("POST", "https://example.com", {}, {}, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe("auth");
      expect(r.error.httpStatus).toBe(401);
    }
  });

  it("returns auth error for 403", async () => {
    mockFetch(403, { message: "Forbidden" });
    const r = await jsonRequest("POST", "https://example.com", {}, {}, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("auth");
  });

  it("returns rate_limit error for 429 with retry-after header", async () => {
    mockFetch(429, { message: "Too many requests" }, { "retry-after": "60" });
    const r = await jsonRequest("GET", "https://example.com", {}, undefined, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe("rate_limit");
      expect(r.error.retryAfter).toBe("60");
    }
  });

  it("returns api error for 500", async () => {
    mockFetch(500, { code: "SERVER_ERROR", message: "Internal Server Error" });
    const r = await jsonRequest("POST", "https://example.com", {}, {}, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe("api");
      expect(r.error.code).toBe("SERVER_ERROR");
    }
  });

  it("extracts trace_id from x-trace-id header", async () => {
    mockFetch(500, { message: "err" }, { "x-trace-id": "trace-xyz" });
    const r = await jsonRequest("GET", "https://example.com", {}, undefined, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.traceId).toBe("trace-xyz");
  });

  it("returns decode error for malformed JSON on 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve("NOT_JSON{{{"),
      })
    );
    const r = await jsonRequest("GET", "https://example.com", {}, undefined, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("decode");
  });

  it("encodes body as JSON and sends content-type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", fetchMock);
    await jsonRequest("POST", "https://example.com", {}, { foo: "bar" }, cfg);
    const calledOpts = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(calledOpts.body).toBe('{"foo":"bar"}');
    expect((calledOpts.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("retries on 500 when maxRetries > 0", async () => {
    const retryCfg = createConfig({
      clientId: "cid",
      clientSecret: "csec",
      maxRetries: 2,
      retryBaseDelayMs: 1, // tiny delay for test speed
      rateLimitRps: 1000,
      rateLimitBurst: 1000,
    });
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        calls++;
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          text: () => Promise.resolve('{"message":"err"}'),
        };
      })
    );
    const r = await jsonRequest("GET", "https://example.com", {}, undefined, retryCfg);
    expect(r.ok).toBe(false);
    expect(calls).toBe(3); // 1 attempt + 2 retries
  });
});
