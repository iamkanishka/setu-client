import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfig } from "../../src/config/index.js";
import * as PAN from "../../src/data/kyc/pan.js";
import * as BAV from "../../src/data/kyc/bav.js";
import * as GST from "../../src/data/kyc/gst.js";
import * as NameMatch from "../../src/data/kyc/namematch.js";
import * as EKYC from "../../src/data/kyc/ekyc.js";
import * as DigiLocker from "../../src/data/kyc/digilocker.js";
import { clearTokenCache } from "../../src/token/index.js";
import { resetBuckets } from "../../src/ratelimit/index.js";

const cfg = createConfig({
  clientId: "cid",
  clientSecret: "csec",
  rateLimitRps: 1000,
  rateLimitBurst: 1000,
  maxRetries: 0,
});

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

// ── PAN ───────────────────────────────────────────────────────────────────────

describe("PAN.verify validation", () => {
  it("rejects PAN shorter than 10 chars", async () => {
    const r = await PAN.verify(cfg, {
      pan: "ABCDE123",
      consent: "Y",
      reason: "Customer KYC for loan onboarding",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("pan");
  });

  it("rejects PAN longer than 10 chars", async () => {
    const r = await PAN.verify(cfg, {
      pan: "ABCDE1234AB",
      consent: "Y",
      reason: "Customer KYC for loan onboarding",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("pan");
  });

  it("rejects consent not Y or y", async () => {
    const r = await PAN.verify(cfg, {
      pan: "ABCDE1234A",
      consent: "N",
      reason: "Customer KYC for loan onboarding",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("consent");
  });

  it("accepts lowercase y for consent", async () => {
    mockSuccess({ verification: "success", message: "PAN is valid" });
    const r = await PAN.verify(cfg, {
      pan: "ABCDE1234A",
      consent: "y",
      reason: "Customer KYC for loan onboarding",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects reason shorter than 20 chars", async () => {
    const r = await PAN.verify(cfg, { pan: "ABCDE1234A", consent: "Y", reason: "short" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("reason");
  });
});

describe("PAN.isValid", () => {
  it("returns true for success response", () => {
    expect(PAN.isValid({ verification: "success", message: "PAN is valid" })).toBe(true);
  });

  it("returns false for invalid PAN", () => {
    expect(PAN.isValid({ verification: "failure", message: "PAN is invalid" })).toBe(false);
  });

  it("returns false for empty response", () => {
    expect(PAN.isValid({})).toBe(false);
  });
});

// ── BAV ───────────────────────────────────────────────────────────────────────

describe("BAV.verifySync validation", () => {
  it("rejects missing accountNumber", async () => {
    const r = await BAV.verifySync(cfg, { accountNumber: "", ifsc: "HDFC0001" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("accountNumber");
  });

  it("rejects missing ifsc", async () => {
    const r = await BAV.verifySync(cfg, { accountNumber: "1234567890", ifsc: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("ifsc");
  });
});

describe("BAV.verifyAsync validation", () => {
  it("rejects missing accountNumber", async () => {
    const r = await BAV.verifyAsync(cfg, { accountNumber: "", ifsc: "HDFC0001" });
    expect(r.ok).toBe(false);
  });
});

describe("BAV.getAsyncStatus validation", () => {
  it("rejects empty id", async () => {
    const r = await BAV.getAsyncStatus(cfg, "");
    expect(r.ok).toBe(false);
  });
});

// ── GST ───────────────────────────────────────────────────────────────────────

describe("GST.verify validation", () => {
  it("rejects GSTIN shorter than 15 chars", async () => {
    const r = await GST.verify(cfg, { gstin: "27AAICB3918J1C" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("gstin");
  });

  it("rejects GSTIN longer than 15 chars", async () => {
    const r = await GST.verify(cfg, { gstin: "27AAICB3918J1CTX" });
    expect(r.ok).toBe(false);
  });

  it("accepts exactly 15 char GSTIN", async () => {
    mockSuccess({ data: { company: { status: "Active" } } });
    const r = await GST.verify(cfg, { gstin: "27AAICB3918J1CT" });
    expect(r.ok).toBe(true);
  });
});

describe("GST.isActive", () => {
  it("returns true for Active status", () => {
    expect(GST.isActive({ data: { company: { status: "Active" } } })).toBe(true);
  });

  it("returns false for Inactive status", () => {
    expect(GST.isActive({ data: { company: { status: "Inactive" } } })).toBe(false);
  });

  it("returns false for missing data", () => {
    expect(GST.isActive({})).toBe(false);
  });
});

// ── NameMatch ─────────────────────────────────────────────────────────────────

describe("NameMatch.match validation", () => {
  it("rejects empty name1", async () => {
    const r = await NameMatch.match(cfg, { name1: "", name2: "Bob" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("name1");
  });

  it("rejects empty name2", async () => {
    const r = await NameMatch.match(cfg, { name1: "Alice", name2: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("name2");
  });

  it("rejects name1 exceeding 100 chars", async () => {
    const r = await NameMatch.match(cfg, { name1: "A".repeat(101), name2: "Bob" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("100");
  });
});

describe("NameMatch.isMatch", () => {
  it("returns true when optimistic score >= threshold", () => {
    const r = { optimistic_match_output: { match_percentage: 80 } };
    expect(NameMatch.isMatch(r, 75)).toBe(true);
  });

  it("returns false when optimistic score < threshold", () => {
    const r = { optimistic_match_output: { match_percentage: 60 } };
    expect(NameMatch.isMatch(r, 75)).toBe(false);
  });

  it("defaults threshold to 75", () => {
    expect(NameMatch.isMatch({ optimistic_match_output: { match_percentage: 76 } })).toBe(true);
    expect(NameMatch.isMatch({ optimistic_match_output: { match_percentage: 74 } })).toBe(false);
  });

  it("returns false when field is missing", () => {
    expect(NameMatch.isMatch({})).toBe(false);
  });
});

describe("NameMatch.isStrictMatch", () => {
  it("uses pessimistic_match_output", () => {
    expect(
      NameMatch.isStrictMatch({ pessimistic_match_output: { match_percentage: 80 } }, 75)
    ).toBe(true);
    expect(
      NameMatch.isStrictMatch({ pessimistic_match_output: { match_percentage: 70 } }, 75)
    ).toBe(false);
  });
});

// ── EKYC ──────────────────────────────────────────────────────────────────────

describe("EKYC.get validation", () => {
  it("rejects empty id", async () => {
    const r = await EKYC.get(cfg, "");
    expect(r.ok).toBe(false);
  });
});

describe("EKYC.isComplete", () => {
  it("returns true for SUCCESS status", () => {
    expect(EKYC.isComplete({ status: "SUCCESS" })).toBe(true);
  });

  it("returns false for non-SUCCESS status", () => {
    expect(EKYC.isComplete({ status: "KYC_REQUESTED" })).toBe(false);
    expect(EKYC.isComplete({ status: "ERROR" })).toBe(false);
    expect(EKYC.isComplete({})).toBe(false);
  });
});

describe("EKYC.create happy path", () => {
  it("returns ok with optional params", async () => {
    mockSuccess({ kycURL: "https://setu.co/ekyc/abc" });
    const r = await EKYC.create(cfg, { webhookUrl: "https://myapp.com/webhook" });
    expect(r.ok).toBe(true);
  });

  it("works with no params", async () => {
    mockSuccess({ kycURL: "https://setu.co/ekyc/def" });
    const r = await EKYC.create(cfg);
    expect(r.ok).toBe(true);
  });
});

// ── DigiLocker ────────────────────────────────────────────────────────────────

describe("DigiLocker.createSession validation", () => {
  it("rejects missing redirectUrl", async () => {
    const r = await DigiLocker.createSession(cfg, { redirectUrl: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("redirectUrl");
  });
});

describe("DigiLocker.getSession validation", () => {
  it("rejects empty sessionId", async () => {
    const r = await DigiLocker.getSession(cfg, "");
    expect(r.ok).toBe(false);
  });
});

describe("DigiLocker.getDocument validation", () => {
  it("rejects empty sessionId", async () => {
    const r = await DigiLocker.getDocument(cfg, "", "ADHAR");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("sessionId");
  });

  it("rejects empty documentType", async () => {
    const r = await DigiLocker.getDocument(cfg, "session-1", "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("documentType");
  });
});
