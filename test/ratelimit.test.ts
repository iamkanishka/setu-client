import { describe, it, expect, beforeEach } from "vitest";
import { createConfig } from "../src/config/index.js";
import { acquireToken, resetBuckets } from "../src/ratelimit/index.js";

beforeEach(() => resetBuckets());

describe("acquireToken", () => {
  it("resolves immediately when tokens are available", async () => {
    const cfg = createConfig({
      clientId: "cid",
      clientSecret: "csec",
      rateLimitRps: 100,
      rateLimitBurst: 10,
      timeoutMs: 1_000,
    });
    await expect(acquireToken(cfg)).resolves.toBeUndefined();
  });

  it("buckets are independent per clientId", async () => {
    const cfg1 = createConfig({
      clientId: "c1",
      clientSecret: "s",
      rateLimitRps: 100,
      rateLimitBurst: 5,
    });
    const cfg2 = createConfig({
      clientId: "c2",
      clientSecret: "s",
      rateLimitRps: 100,
      rateLimitBurst: 5,
    });

    // Drain cfg1 bucket partially
    for (let i = 0; i < 3; i++) await acquireToken(cfg1);

    // cfg2 should still have a full burst bucket
    await expect(acquireToken(cfg2)).resolves.toBeUndefined();
  });

  it("rejects with timeout error when bucket is exhausted and timeout is tiny", async () => {
    const cfg = createConfig({
      clientId: "exhaust",
      clientSecret: "s",
      rateLimitRps: 1,
      rateLimitBurst: 1,
      timeoutMs: 1, // 1ms — will time out before refill
    });

    await acquireToken(cfg); // consume the only token

    await expect(acquireToken(cfg)).rejects.toThrow("timed out");
  });

  it("buckets are per environment", async () => {
    const sandbox = createConfig({
      clientId: "cid",
      clientSecret: "s",
      environment: "sandbox",
      rateLimitBurst: 2,
    });
    const prod = createConfig({
      clientId: "cid",
      clientSecret: "s",
      environment: "production",
      rateLimitBurst: 2,
    });

    await acquireToken(sandbox);
    await acquireToken(sandbox); // drain sandbox

    // production bucket is untouched
    await expect(acquireToken(prod)).resolves.toBeUndefined();
  });
});
