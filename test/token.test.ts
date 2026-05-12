import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfig } from "../src/config/index.js";
import { getToken, invalidateToken, clearTokenCache } from "../src/token/index.js";
import { resetBuckets } from "../src/ratelimit/index.js";

const cfg = createConfig({
  clientId: "cid",
  clientSecret: "csec",
  rateLimitRps: 1000,
  rateLimitBurst: 1000,
});

function tokenOkResponse(token: string, expiresIn = 300) {
  const payload = { access_token: token, expires_in: expiresIn };
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: () => Promise.resolve(""),
    json: () => Promise.resolve(payload),
  };
}

function tokenErrResponse(status: number, body = "Unauthorized") {
  return {
    ok: false,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new Error("no json")),
  };
}

beforeEach(() => {
  clearTokenCache();
  resetBuckets();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearTokenCache();
});

describe("getToken", () => {
  it("fetches and returns a token on cache miss", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tokenOkResponse("tok-abc")));
    const r = await getToken(cfg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe("tok-abc");
  });

  it("returns cached token on second call — only 1 HTTP request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenOkResponse("cached-tok"));
    vi.stubGlobal("fetch", fetchMock);
    const r1 = await getToken(cfg);
    const r2 = await getToken(cfg);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.data).toBe("cached-tok");
      expect(r2.data).toBe("cached-tok");
    }
  });

  it("deduplicates concurrent refreshes (singleflight)", async () => {
    const freshCfg = createConfig({
      clientId: "singleflight-cid",
      clientSecret: "csec",
      rateLimitRps: 1000,
      rateLimitBurst: 1000,
    });
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 15));
        return tokenOkResponse("dedup-tok");
      })
    );
    const [a, b, c] = await Promise.all([
      getToken(freshCfg),
      getToken(freshCfg),
      getToken(freshCfg),
    ]);
    expect(calls).toBe(1);
    for (const r of [a, b, c]) {
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toBe("dedup-tok");
    }
  });

  it("returns auth error when login endpoint returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tokenErrResponse(401)));
    const r = await getToken(cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("auth");
  });

  it("returns decode error when response lacks access_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve(""),
        json: () => Promise.resolve({ token_type: "Bearer" }),
      })
    );
    const r = await getToken(cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("decode");
  });

  it("returns auth error when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const r = await getToken(cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("auth");
  });
});

describe("invalidateToken", () => {
  it("forces a re-fetch after invalidation", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        calls++;
        return tokenOkResponse(`tok-${calls}`);
      })
    );
    const r1 = await getToken(cfg);
    expect(calls).toBe(1);
    if (r1.ok) expect(r1.data).toBe("tok-1");
    invalidateToken(cfg);
    const r2 = await getToken(cfg);
    expect(calls).toBe(2);
    if (r2.ok) expect(r2.data).toBe("tok-2");
  });
});
