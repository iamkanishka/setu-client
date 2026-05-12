import { describe, it, expect } from "vitest";
import { createConfig, getUrls, getKycHeaders } from "../src/config/index.js";

const BASE = { clientId: "cid", clientSecret: "csec" };

describe("createConfig", () => {
  it("returns a frozen config with defaults", () => {
    const cfg = createConfig(BASE);
    expect(cfg.clientId).toBe("cid");
    expect(cfg.clientSecret).toBe("csec");
    expect(cfg.environment).toBe("sandbox");
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.maxRetries).toBe(3);
    expect(cfg.retryBaseDelayMs).toBe(500);
    expect(cfg.retryMaxDelayMs).toBe(10_000);
    expect(cfg.rateLimitRps).toBe(100);
    expect(cfg.rateLimitBurst).toBe(20);
    expect(cfg.productInstanceId).toBeUndefined();
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it("accepts overrides", () => {
    const cfg = createConfig({
      ...BASE,
      environment: "production",
      timeoutMs: 5_000,
      maxRetries: 1,
      productInstanceId: "pid",
    });
    expect(cfg.environment).toBe("production");
    expect(cfg.timeoutMs).toBe(5_000);
    expect(cfg.maxRetries).toBe(1);
    expect(cfg.productInstanceId).toBe("pid");
  });

  it("throws when clientId is missing", () => {
    expect(() => createConfig({ clientId: "", clientSecret: "s" })).toThrow("clientId is required");
  });

  it("throws when clientSecret is missing", () => {
    expect(() => createConfig({ clientId: "id", clientSecret: "" })).toThrow(
      "clientSecret is required"
    );
  });
});

describe("getUrls", () => {
  it("returns sandbox URLs by default", () => {
    const urls = getUrls(createConfig(BASE));
    expect(urls.dataGateway).toContain("sandbox");
    expect(urls.fiu).toContain("sandbox");
    expect(urls.accountService).toContain("accountservice.setu.co");
  });

  it("returns production URLs when environment=production", () => {
    const urls = getUrls(createConfig({ ...BASE, environment: "production" }));
    expect(urls.dataGateway).toBe("https://dg.setu.co");
    expect(urls.fiu).toBe("https://fiu.setu.co");
  });
});

describe("getKycHeaders", () => {
  it("returns x-client-id and x-client-secret headers", () => {
    const headers = getKycHeaders(createConfig(BASE));
    expect(headers["x-client-id"]).toBe("cid");
    expect(headers["x-client-secret"]).toBe("csec");
    expect(headers["x-product-instance-id"]).toBeUndefined();
  });

  it("includes x-product-instance-id when set", () => {
    const headers = getKycHeaders(createConfig({ ...BASE, productInstanceId: "pid" }));
    expect(headers["x-product-instance-id"]).toBe("pid");
  });
});
