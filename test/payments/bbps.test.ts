import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfig } from "../../src/config/index.js";
import {
  getTransaction,
  buildBillFetchResponse,
  buildBill,
  buildSettlement,
  fetchBill,
  payBill,
  sendReminder,
  getReminderStatus,
} from "../../src/payments/bbps.js";
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
        text: () => Promise.resolve(JSON.stringify(body)),
        json: () => Promise.resolve(body),
      })
  );
}

beforeEach(() => {
  clearTokenCache();
  resetBuckets();
});
afterEach(() => vi.unstubAllGlobals());

// ── getTransaction ────────────────────────────────────────────────────────────

describe("getTransaction validation", () => {
  it("rejects empty txnId", async () => {
    const r = await getTransaction(cfg, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("validation");
  });
});

// ── Pure builder functions ────────────────────────────────────────────────────

describe("buildBillFetchResponse", () => {
  it("returns AVAILABLE when bills array is non-empty", () => {
    const customer = { id: "cust-1" };
    const bills = [{ billerBillId: "bill-1", amount: 5000 }];
    const resp = buildBillFetchResponse(customer, bills);
    expect((resp["billDetails"] as Record<string, unknown>)["billFetchStatus"]).toBe("AVAILABLE");
    expect(resp["customer"]).toEqual(customer);
  });

  it("returns NOT_AVAILABLE when bills array is empty", () => {
    const resp = buildBillFetchResponse({}, []);
    expect((resp["billDetails"] as Record<string, unknown>)["billFetchStatus"]).toBe(
      "NOT_AVAILABLE"
    );
  });
});

describe("buildBill", () => {
  it("builds a bill with required fields", () => {
    const bill = buildBill({ billerBillId: "bill-1", amount: 10000 });
    expect(bill["billerBillID"]).toBe("bill-1");
    expect((bill["amount"] as Record<string, unknown>)["value"]).toBe(10000);
    expect((bill["amount"] as Record<string, unknown>)["currencyCode"]).toBe("INR");
    expect(bill["recurrence"]).toBe("ONE_TIME");
    expect(bill["amountExactness"]).toBe("EXACT");
  });

  it("omits nil fields", () => {
    const bill = buildBill({ billerBillId: "bill-1", amount: 500 });
    expect("dueDate" in bill).toBe(false);
    expect("generatedOn" in bill).toBe(false);
    expect("aggregates" in bill).toBe(false);
  });

  it("includes optional fields when provided", () => {
    const bill = buildBill({
      billerBillId: "b-1",
      amount: 200,
      dueDate: "2025-12-31",
      recurrence: "MONTHLY",
    });
    expect(bill["dueDate"]).toBe("2025-12-31");
    expect(bill["recurrence"]).toBe("MONTHLY");
  });
});

describe("buildSettlement", () => {
  it("builds a primary account with no parts", () => {
    const s = buildSettlement({ id: "acc-1", ifsc: "HDFC0001234", name: "Acme" });
    expect((s["primaryAccount"] as Record<string, unknown>)["id"]).toBe("acc-1");
    expect(Array.isArray(s["parts"])).toBe(true);
    expect((s["parts"] as unknown[]).length).toBe(0);
  });

  it("builds parts with split values", () => {
    const s = buildSettlement({ id: "acc-1", ifsc: "HDFC0001" }, [
      { account: { id: "acc-2", ifsc: "ICIC0001" }, splitValue: 500, remarks: "Tax" },
    ]);
    const parts = s["parts"] as Record<string, unknown>[];
    expect(parts.length).toBe(1);
    expect((parts[0]!["split"] as Record<string, unknown>)["value"]).toBe(500);
    expect(parts[0]!["remarks"]).toBe("Tax");
  });

  it("omits nil account fields", () => {
    const s = buildSettlement({ id: "acc-1" });
    const primary = s["primaryAccount"] as Record<string, unknown>;
    expect("name" in primary).toBe(false);
    expect("ifsc" in primary).toBe(false);
  });
});

// ── fetchBill / payBill ───────────────────────────────────────────────────────

describe("fetchBill validation", () => {
  it("rejects missing billerId", async () => {
    const r = await fetchBill(cfg, { billerId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("billerId");
  });
});

describe("payBill validation", () => {
  it("rejects missing billerId", async () => {
    const r = await payBill(cfg, { billerId: "", amount: 500 });
    expect(r.ok).toBe(false);
  });

  it("rejects zero amount", async () => {
    const r = await payBill(cfg, { billerId: "biller-1", amount: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("amount");
  });
});

// ── WhatsApp ──────────────────────────────────────────────────────────────────

describe("sendReminder validation", () => {
  it("rejects missing customerMobile", async () => {
    const r = await sendReminder(cfg, {
      customerMobile: "",
      billerBillId: "bill-1",
      billAmount: 1000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("customerMobile");
  });

  it("rejects missing billerBillId", async () => {
    const r = await sendReminder(cfg, {
      customerMobile: "9999999999",
      billerBillId: "",
      billAmount: 1000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("billerBillId");
  });

  it("rejects zero billAmount", async () => {
    const r = await sendReminder(cfg, {
      customerMobile: "9999999999",
      billerBillId: "bill-1",
      billAmount: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("billAmount");
  });
});

describe("getReminderStatus validation", () => {
  it("rejects empty id", async () => {
    const r = await getReminderStatus(cfg, "");
    expect(r.ok).toBe(false);
  });
});

describe("getReminderStatus happy path", () => {
  it("returns ok with API response", async () => {
    mockSuccess({ status: "DELIVERED" });
    const r = await getReminderStatus(cfg, "reminder-123");
    expect(r.ok).toBe(true);
  });
});
