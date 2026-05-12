import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfig } from "../../src/config/index.js";
import {
  createConsent,
  getConsent,
  revokeConsent,
  createMultiConsent,
  getLastFetchStatus,
  listDataSessions,
  createDataSession,
  getDataSession,
  fetchFiData,
  withAccountType,
  withFipFilter,
  withExcludeFips,
  withAccountSelectionMode,
  withTransactionType,
  withPurposeDescription,
} from "../../src/data/aa.js";
import { clearTokenCache } from "../../src/token/index.js";
import { resetBuckets } from "../../src/ratelimit/index.js";

const cfg = createConfig({
  clientId: "cid",
  clientSecret: "csec",
  rateLimitRps: 1000,
  rateLimitBurst: 1000,
  maxRetries: 0,
});

const VALID_CONSENT_PARAMS = {
  vua: "9999999999",
  fetchType: "ONETIME",
  consentTypes: ["TRANSACTIONS"],
  fiTypes: ["DEPOSIT"],
  consentDuration: { unit: "MONTH", value: 1 },
  dataRange: { from: "2024-01-01T00:00:00Z", to: "2024-12-31T23:59:59Z" },
};

function mockSuccess(body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  );
}

beforeEach(() => {
  clearTokenCache();
  resetBuckets();
});
afterEach(() => vi.unstubAllGlobals());

// ── Consent validation ────────────────────────────────────────────────────────

describe("createConsent validation", () => {
  it("rejects missing vua", async () => {
    const r = await createConsent(cfg, { ...VALID_CONSENT_PARAMS, vua: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("vua");
  });

  it("rejects missing fetchType", async () => {
    const r = await createConsent(cfg, { ...VALID_CONSENT_PARAMS, fetchType: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("fetchType");
  });

  it("rejects when neither consentDuration nor consentDateRange is present", async () => {
    const { consentDuration: _cd1, ...rest } = VALID_CONSENT_PARAMS;
    const r = await createConsent(cfg, { ...rest });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("consentDuration");
  });

  it("accepts consentDateRange as an alternative to consentDuration", async () => {
    mockSuccess({ url: "https://setu.co/consent/abc" });
    const { consentDuration: _cd2, ...rest } = VALID_CONSENT_PARAMS;
    const r = await createConsent(cfg, {
      ...rest,
      consentDateRange: { from: "2024-01-01T00:00:00Z", to: "2024-12-31T23:59:59Z" },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty consentTypes", async () => {
    const r = await createConsent(cfg, { ...VALID_CONSENT_PARAMS, consentTypes: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("consentTypes");
  });

  it("rejects TRANSACTIONS type without dataRange", async () => {
    const { dataRange: _dr, ...rest } = VALID_CONSENT_PARAMS;
    const r = await createConsent(cfg, { ...rest });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("dataRange");
  });

  it("accepts non-TRANSACTIONS type without dataRange", async () => {
    mockSuccess({ url: "https://setu.co/consent/xyz" });
    const r = await createConsent(cfg, {
      vua: "9999999999",
      fetchType: "ONETIME",
      consentTypes: ["PROFILE"],
      fiTypes: ["DEPOSIT"],
      consentDuration: { unit: "MONTH", value: 1 },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty fiTypes", async () => {
    const r = await createConsent(cfg, { ...VALID_CONSENT_PARAMS, fiTypes: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("fiTypes");
  });
});

describe("getConsent validation", () => {
  it("rejects empty consentId", async () => {
    const r = await getConsent(cfg, "");
    expect(r.ok).toBe(false);
  });

  it("adds expanded=true query param when requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", fetchMock);
    await getConsent(cfg, "consent-abc", true);
    const url = (fetchMock.mock.calls[0] as [string])[0];
    expect(url).toContain("?expanded=true");
  });
});

describe("revokeConsent validation", () => {
  it("rejects empty consentId", async () => {
    const r = await revokeConsent(cfg, "");
    expect(r.ok).toBe(false);
  });
});

describe("createMultiConsent validation", () => {
  it("rejects empty mandatoryConsents", async () => {
    const r = await createMultiConsent(cfg, { mandatoryConsents: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("mandatoryConsents");
  });
});

// ── Data fetch validation ─────────────────────────────────────────────────────

describe("createDataSession validation", () => {
  it("rejects missing consentId", async () => {
    const r = await createDataSession(cfg, { consentId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("consentId");
  });
});

describe("getDataSession / fetchFiData / getLastFetchStatus / listDataSessions validation", () => {
  it("getDataSession rejects empty sessionId", async () => {
    const r = await getDataSession(cfg, "");
    expect(r.ok).toBe(false);
  });

  it("fetchFiData rejects empty sessionId", async () => {
    const r = await fetchFiData(cfg, "");
    expect(r.ok).toBe(false);
  });

  it("getLastFetchStatus rejects empty consentId", async () => {
    const r = await getLastFetchStatus(cfg, "");
    expect(r.ok).toBe(false);
  });

  it("listDataSessions rejects empty consentId", async () => {
    const r = await listDataSessions(cfg, "");
    expect(r.ok).toBe(false);
  });
});

// ── Context helpers ───────────────────────────────────────────────────────────

describe("context helpers", () => {
  it("withAccountType returns correct key-value", () => {
    expect(withAccountType("SAVINGS")).toEqual({ key: "accounttype", value: "SAVINGS" });
  });

  it("withFipFilter returns correct key-value", () => {
    expect(withFipFilter("fip-1,fip-2")).toEqual({ key: "fipId", value: "fip-1,fip-2" });
  });

  it("withExcludeFips returns correct key-value", () => {
    expect(withExcludeFips("fip-x")).toEqual({ key: "excludeFipIds", value: "fip-x" });
  });

  it("withAccountSelectionMode returns correct key-value", () => {
    expect(withAccountSelectionMode("multi")).toEqual({
      key: "accountSelectionMode",
      value: "multi",
    });
  });

  it("withTransactionType returns correct key-value", () => {
    expect(withTransactionType("debit")).toEqual({ key: "transactionType", value: "debit" });
  });

  it("withPurposeDescription returns correct key-value", () => {
    expect(withPurposeDescription("Loan KYC")).toEqual({
      key: "purposeDescription",
      value: "Loan KYC",
    });
  });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe("createConsent happy path", () => {
  it("returns consent URL on success", async () => {
    mockSuccess({ url: "https://fiu-sandbox.setu.co/consent/abc123" });
    const r = await createConsent(cfg, VALID_CONSENT_PARAMS);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data as Record<string, unknown>)["url"]).toContain("consent");
  });
});
