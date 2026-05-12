import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfig } from "../../src/config/index.js";
import {
  createDqr,
  getDqr,
  createSqr,
  getSqr,
  getLastPayment,
  getPaymentHistory,
  createTpv,
  verifyVpa,
  createCollect,
  createMandate,
  getMandate,
  updateMandate,
  getMandateOperation,
  preDebitNotify,
  getPreDebitNotification,
  executeMandate,
  getMandateExecution,
  createRefund,
  getDispute,
  acceptDispute,
  rejectDispute,
  createMerchant,
  getMerchant,
  checkVpaAvailability,
  createVpa,
} from "../../src/payments/upi.js";
import { clearTokenCache } from "../../src/token/index.js";
import { resetBuckets } from "../../src/ratelimit/index.js";

const cfg = createConfig({
  clientId: "cid",
  clientSecret: "csec",
  rateLimitRps: 1000,
  rateLimitBurst: 1000,
  maxRetries: 0,
});
const MID = "merchant-123";

function mockWithToken(responseBody: unknown = { ok: true }) {
  // Call 1: token endpoint (uses res.json())
  // Call 2+: UPI API endpoint (uses res.text())
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve(""),
        json: () => Promise.resolve({ access_token: "test-tok", expires_in: 300 }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(responseBody)),
        json: () => Promise.resolve(responseBody),
      })
  );
}

beforeEach(() => {
  clearTokenCache();
  resetBuckets();
});

afterEach(() => vi.unstubAllGlobals());

// ── Validation-only tests (no real HTTP needed) ───────────────────────────────

describe("createDqr validation", () => {
  it("rejects empty merchant_id", async () => {
    const r = await createDqr(cfg, "", { merchantVpa: "shop@pineaxis" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("merchant_id");
  });

  it("rejects missing merchantVpa", async () => {
    const r = await createDqr(cfg, MID, { merchantVpa: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("merchantVpa");
  });
});

describe("getDqr validation", () => {
  it("rejects empty dqrId", async () => {
    const r = await getDqr(cfg, MID, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("dqrId");
  });
});

describe("createSqr validation", () => {
  it("rejects missing merchantVpa", async () => {
    const r = await createSqr(cfg, MID, { merchantVpa: "" });
    expect(r.ok).toBe(false);
  });
});

describe("getSqr validation", () => {
  it("rejects empty sqrId", async () => {
    const r = await getSqr(cfg, MID, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("sqrId");
  });
});

describe("getLastPayment / getPaymentHistory validation", () => {
  it("rejects empty productInstanceId", async () => {
    const r = await getLastPayment(cfg, MID, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("productInstanceId");
  });

  it("rejects empty productInstanceId for history", async () => {
    const r = await getPaymentHistory(cfg, MID, "");
    expect(r.ok).toBe(false);
  });
});

describe("createTpv validation", () => {
  it("rejects missing merchantVpa", async () => {
    const r = await createTpv(cfg, MID, {
      merchantVpa: "",
      customerAccount: { ifsc: "HDFC0001234", accountNumber: "9876543210" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("merchantVpa");
  });

  it("rejects missing IFSC", async () => {
    const r = await createTpv(cfg, MID, {
      merchantVpa: "shop@pineaxis",
      customerAccount: { ifsc: "", accountNumber: "9876543210" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("customerAccount.ifsc");
  });

  it("rejects missing accountNumber", async () => {
    const r = await createTpv(cfg, MID, {
      merchantVpa: "shop@pineaxis",
      customerAccount: { ifsc: "HDFC0001234", accountNumber: "" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("customerAccount.accountNumber");
  });
});

describe("verifyVpa validation", () => {
  it("rejects empty vpa", async () => {
    const r = await verifyVpa(cfg, MID, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("vpa");
  });
});

describe("createCollect validation", () => {
  it("rejects missing customerVpa", async () => {
    const r = await createCollect(cfg, MID, {
      customerVpa: "",
      merchantVpa: "shop@pineaxis",
      merchantReferenceId: "ref-1",
      amount: 10000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("customerVpa");
  });

  it("rejects zero amount", async () => {
    const r = await createCollect(cfg, MID, {
      customerVpa: "customer@upi",
      merchantVpa: "shop@pineaxis",
      merchantReferenceId: "ref-1",
      amount: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("amount");
  });
});

describe("createMandate validation", () => {
  it("rejects missing merchantVpa", async () => {
    const r = await createMandate(cfg, MID, {
      merchantVpa: "",
      startDate: "01012025",
      endDate: "31122025",
      frequency: "monthly",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects missing frequency", async () => {
    const r = await createMandate(cfg, MID, {
      merchantVpa: "shop@upi",
      startDate: "01012025",
      endDate: "31122025",
      frequency: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("frequency");
  });
});

describe("updateMandate validation", () => {
  it("rejects missing merchantReferenceId", async () => {
    const r = await updateMandate(cfg, MID, "mandate-1", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("merchantReferenceId");
  });
});

describe("preDebitNotify validation", () => {
  it("rejects missing umn", async () => {
    const r = await preDebitNotify(cfg, MID, "mandate-1", {
      umn: "",
      executionDate: "01012025",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("umn");
  });

  it("rejects missing executionDate", async () => {
    const r = await preDebitNotify(cfg, MID, "mandate-1", {
      umn: "umn-123",
      executionDate: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("executionDate");
  });
});

describe("executeMandate validation", () => {
  it("rejects missing umn", async () => {
    const r = await executeMandate(cfg, MID, "mandate-1", { umn: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("umn");
  });
});

describe("createRefund validation", () => {
  it("rejects missing paymentId", async () => {
    const r = await createRefund(cfg, MID, {
      paymentId: "",
      amount: 500,
      merchantReferenceId: "ref-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("paymentId");
  });

  it("rejects zero amount", async () => {
    const r = await createRefund(cfg, MID, {
      paymentId: "pay-1",
      amount: 0,
      merchantReferenceId: "ref-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("amount");
  });

  it("rejects missing merchantReferenceId", async () => {
    const r = await createRefund(cfg, MID, {
      paymentId: "pay-1",
      amount: 500,
      merchantReferenceId: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("merchantReferenceId");
  });
});

describe("rejectDispute validation", () => {
  it("rejects missing evidence", async () => {
    const r = await rejectDispute(cfg, MID, "disp-1", { evidence: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("evidence");
  });
});

describe("createMerchant validation", () => {
  it("rejects missing aggregatorAccountId", async () => {
    const r = await createMerchant(cfg, {
      aggregatorAccountId: "",
      businessName: "Acme",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("aggregatorAccountId");
  });

  it("rejects missing businessName", async () => {
    const r = await createMerchant(cfg, {
      aggregatorAccountId: "agg-1",
      businessName: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("businessName");
  });
});

describe("createVpa validation", () => {
  it("rejects missing vpa", async () => {
    const r = await createVpa(cfg, MID, { vpa: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("vpa");
  });
});

// ── Happy path (mocked fetch) ─────────────────────────────────────────────────

describe("createDqr happy path", () => {
  it("returns ok with API response", async () => {
    mockWithToken({ intentLink: "upi://pay?pa=shop@pineaxis" });
    const r = await createDqr(cfg, MID, { merchantVpa: "shop@pineaxis", amount: 10000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.data as Record<string, unknown>)["intentLink"]).toContain("upi://");
    }
  });
});

describe("getMandate / getMandateOperation / getPreDebitNotification / getMandateExecution happy path", () => {
  it("getMandate succeeds", async () => {
    mockWithToken({ status: "LIVE" });
    const r = await getMandate(cfg, MID, "mandate-1");
    expect(r.ok).toBe(true);
  });

  it("getMandateOperation succeeds", async () => {
    mockWithToken({ status: "SUCCESS" });
    const r = await getMandateOperation(cfg, MID, "op-1");
    expect(r.ok).toBe(true);
  });

  it("getPreDebitNotification succeeds", async () => {
    mockWithToken({ status: "NOTIFIED" });
    const r = await getPreDebitNotification(cfg, MID, "notif-1");
    expect(r.ok).toBe(true);
  });

  it("getMandateExecution succeeds", async () => {
    mockWithToken({ status: "SUCCESS" });
    const r = await getMandateExecution(cfg, MID, "exec-1");
    expect(r.ok).toBe(true);
  });
});

describe("dispute operations happy path", () => {
  it("getDispute succeeds", async () => {
    mockWithToken({ status: "OPEN" });
    const r = await getDispute(cfg, MID, "disp-1");
    expect(r.ok).toBe(true);
  });

  it("acceptDispute succeeds", async () => {
    mockWithToken({ status: "ACCEPTED" });
    const r = await acceptDispute(cfg, MID, "disp-1");
    expect(r.ok).toBe(true);
  });

  it("rejectDispute succeeds with evidence", async () => {
    mockWithToken({ status: "REJECTED" });
    const r = await rejectDispute(cfg, MID, "disp-1", { evidence: "base64data==" });
    expect(r.ok).toBe(true);
  });
});

describe("aggregator happy path", () => {
  it("getMerchant succeeds", async () => {
    mockWithToken({ id: "merchant-123" });
    const r = await getMerchant(cfg, "merchant-123");
    expect(r.ok).toBe(true);
  });

  it("checkVpaAvailability succeeds", async () => {
    mockWithToken({ available: true });
    const r = await checkVpaAvailability(cfg, "shop@pineaxis");
    expect(r.ok).toBe(true);
  });
});
