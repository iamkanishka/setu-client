import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfig } from "../../src/config/index.js";
import { createEsign, getEsign, downloadEsign, esignComplete } from "../../src/data/esign.js";
import { clearTokenCache } from "../../src/token/index.js";
import { resetBuckets } from "../../src/ratelimit/index.js";

const cfg = createConfig({
  clientId: "cid",
  clientSecret: "csec",
  rateLimitRps: 1000,
  rateLimitBurst: 1000,
  maxRetries: 0,
});

const VALID_SIGNER = { name: "Alice Kumar", mobile: "9999999999" };

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

describe("createEsign validation", () => {
  it("rejects missing documentBase64", async () => {
    const r = await createEsign(cfg, {
      documentBase64: "",
      documentName: "contract.pdf",
      signers: [VALID_SIGNER],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("documentBase64");
  });

  it("rejects missing documentName", async () => {
    const r = await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "",
      signers: [VALID_SIGNER],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("documentName");
  });

  it("rejects empty signers array", async () => {
    const r = await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "doc.pdf",
      signers: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("signers");
  });

  it("rejects more than 6 signers", async () => {
    const r = await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "doc.pdf",
      signers: Array(7).fill(VALID_SIGNER),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.field).toBe("signers");
      expect(r.error.message).toContain("6");
    }
  });

  it("rejects signer with missing name", async () => {
    const r = await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "doc.pdf",
      signers: [{ name: "", mobile: "9999999999" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toContain("name");
  });

  it("rejects signer with missing mobile", async () => {
    const r = await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "doc.pdf",
      signers: [{ name: "Alice", mobile: "" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toContain("mobile");
  });

  it("validates signer index in error field", async () => {
    const r = await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "doc.pdf",
      signers: [VALID_SIGNER, { name: "Bob", mobile: "" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toContain("[1]");
  });

  it("accepts up to 6 valid signers", async () => {
    mockSuccess({ id: "esign-123", status: "CREATED" });
    const r = await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "doc.pdf",
      signers: Array(6).fill(VALID_SIGNER),
    });
    expect(r.ok).toBe(true);
  });

  it("includes optional signaturePosition when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "doc.pdf",
      signers: [
        { name: "Alice", mobile: "9999999999", signaturePosition: { page: 1, x: 100, y: 200 } },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      signers: Array<{ signaturePosition?: unknown }>;
    };
    expect(body.signers[0]?.signaturePosition).toMatchObject({ page: 1, x: 100, y: 200 });
  });
});

describe("getEsign / downloadEsign validation", () => {
  it("getEsign rejects empty id", async () => {
    const r = await getEsign(cfg, "");
    expect(r.ok).toBe(false);
  });

  it("downloadEsign rejects empty id", async () => {
    const r = await downloadEsign(cfg, "");
    expect(r.ok).toBe(false);
  });
});

describe("esignComplete", () => {
  it("returns true for COMPLETED status", () => {
    expect(esignComplete({ status: "COMPLETED" })).toBe(true);
  });

  it("returns false for non-COMPLETED status", () => {
    expect(esignComplete({ status: "PENDING" })).toBe(false);
    expect(esignComplete({ status: "CREATED" })).toBe(false);
    expect(esignComplete({})).toBe(false);
  });
});

describe("createEsign happy path", () => {
  it("returns ok with API response", async () => {
    mockSuccess({ id: "esign-abc", status: "CREATED", signerUrls: ["https://setu.co/sign/abc"] });
    const r = await createEsign(cfg, {
      documentBase64: "BASE64DATA==",
      documentName: "contract.pdf",
      signers: [VALID_SIGNER],
      redirectUrl: "https://myapp.com/done",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data as Record<string, unknown>)["status"]).toBe("CREATED");
  });
});
