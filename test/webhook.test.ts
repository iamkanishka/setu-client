import { describe, it, expect, vi } from "vitest";
import {
  dispatch,
  dispatchRaw,
  eventType,
  consentId,
  sessionId,
  consentStatus,
  sessionStatus,
  isPaymentSuccessful,
  isConsentActive,
  isSessionCompleted,
  type WebhookEvent,
} from "../src/webhook/index.js";

// ── dispatch routing ──────────────────────────────────────────────────────────

const ALL_PAYMENT_EVENTS = [
  "payment.initiated",
  "payment.pending",
  "payment.success",
  "payment.failed",
];

const ALL_MANDATE_EVENTS = [
  "mandate.initiated",
  "mandate.live",
  "mandate.rejected",
  "mandate.paused",
  "mandate.revoked",
  "mandate.updated",
  "mandate_operation.create.initiated",
  "mandate_operation.create.success",
  "mandate_operation.create.failed",
  "mandate_operation.update.initiated",
  "mandate_operation.update.success",
  "mandate_operation.update.failed",
  "mandate_operation.revoke.initiated",
  "mandate_operation.revoke.success",
  "mandate_operation.revoke.failed",
  "mandate_operation.execute.success",
  "mandate_operation.execute.failed",
  "mandate_operation.notify.success",
  "mandate_operation.notify.failed",
];

const ALL_REFUND_EVENTS = ["refund.pending", "refund.successful"];

const ALL_DISPUTE_EVENTS = [
  "dispute_created",
  "dispute_open",
  "dispute_closed",
  "dispute_in_review",
  "dispute_won",
  "dispute_lost",
];

describe("dispatch — payment events", () => {
  for (const et of ALL_PAYMENT_EVENTS) {
    it(`routes ${et} to handlePayment`, async () => {
      const cb = vi.fn();
      await dispatch({ eventType: et }, { handlePayment: cb });
      expect(cb).toHaveBeenCalledWith({ eventType: et });
    });
  }
});

describe("dispatch — mandate events", () => {
  for (const et of ALL_MANDATE_EVENTS) {
    it(`routes ${et} to handleMandate`, async () => {
      const cb = vi.fn();
      await dispatch({ eventType: et }, { handleMandate: cb });
      expect(cb).toHaveBeenCalledOnce();
    });
  }
});

describe("dispatch — refund events", () => {
  for (const et of ALL_REFUND_EVENTS) {
    it(`routes ${et} to handleRefund`, async () => {
      const cb = vi.fn();
      await dispatch({ eventType: et }, { handleRefund: cb });
      expect(cb).toHaveBeenCalledOnce();
    });
  }
});

describe("dispatch — dispute events", () => {
  for (const et of ALL_DISPUTE_EVENTS) {
    it(`routes ${et} to handleDispute`, async () => {
      const cb = vi.fn();
      await dispatch({ eventType: et }, { handleDispute: cb });
      expect(cb).toHaveBeenCalledOnce();
    });
  }
});

describe("dispatch — AA events", () => {
  it("routes CONSENT_STATUS_UPDATE to handleConsent", async () => {
    const cb = vi.fn();
    await dispatch({ eventType: "CONSENT_STATUS_UPDATE" }, { handleConsent: cb });
    expect(cb).toHaveBeenCalledOnce();
  });

  it("routes SESSION_STATUS_UPDATE to handleSession", async () => {
    const cb = vi.fn();
    await dispatch({ eventType: "SESSION_STATUS_UPDATE" }, { handleSession: cb });
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe("dispatch — BBPS settlement detection", () => {
  it("routes event with partnerDetails+events to handleBbpsSettlement", async () => {
    const cb = vi.fn();
    const event: WebhookEvent = {
      partnerDetails: { id: "p-1" },
      events: [{ type: "BILL_SETTLEMENT_STATUS" }],
    };
    await dispatch(event, { handleBbpsSettlement: cb });
    expect(cb).toHaveBeenCalledWith(event);
  });

  it("does not route to BBPS if only partnerDetails present", async () => {
    const bbpsCb = vi.fn();
    const unknownCb = vi.fn();
    await dispatch(
      { partnerDetails: {} },
      { handleBbpsSettlement: bbpsCb, handleUnknown: unknownCb }
    );
    expect(bbpsCb).not.toHaveBeenCalled();
    expect(unknownCb).toHaveBeenCalled();
  });
});

describe("dispatch — unknown events", () => {
  it("routes unrecognised eventType to handleUnknown", async () => {
    const cb = vi.fn();
    await dispatch({ eventType: "some.new.event" }, { handleUnknown: cb });
    expect(cb).toHaveBeenCalledOnce();
  });

  it("routes event with no eventType to handleUnknown", async () => {
    const cb = vi.fn();
    await dispatch({}, { handleUnknown: cb });
    expect(cb).toHaveBeenCalledOnce();
  });

  it("supports type field as alternative to eventType", async () => {
    const cb = vi.fn();
    await dispatch({ type: "payment.success" }, { handlePayment: cb });
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe("dispatch — missing callback is a no-op", () => {
  it("does not throw when handlePayment is absent", async () => {
    await expect(dispatch({ eventType: "payment.success" }, {})).resolves.toBeUndefined();
  });
});

describe("dispatch — callback errors are caught", () => {
  it("does not throw when callback throws", async () => {
    const errCb = vi.fn().mockRejectedValue(new Error("handler exploded"));
    await expect(
      dispatch({ eventType: "payment.success" }, { handlePayment: errCb })
    ).resolves.toBeUndefined();
  });
});

// ── dispatchRaw ───────────────────────────────────────────────────────────────

describe("dispatchRaw", () => {
  it("returns true and dispatches on valid JSON", async () => {
    const cb = vi.fn();
    const result = await dispatchRaw(JSON.stringify({ eventType: "payment.success" }), {
      handlePayment: cb,
    });
    expect(result).toBe(true);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("returns false on invalid JSON", async () => {
    const result = await dispatchRaw("NOT_JSON{{{", {});
    expect(result).toBe(false);
  });
});

// ── Helper functions ──────────────────────────────────────────────────────────

describe("eventType helper", () => {
  it("returns eventType field", () => {
    expect(eventType({ eventType: "payment.success" })).toBe("payment.success");
  });

  it("returns type field as fallback", () => {
    expect(eventType({ type: "mandate.live" })).toBe("mandate.live");
  });

  it("returns unknown when both absent", () => {
    expect(eventType({})).toBe("unknown");
  });
});

describe("consentId helper", () => {
  it("returns consentId field", () => {
    expect(consentId({ consentId: "consent-abc" })).toBe("consent-abc");
  });

  it("returns undefined when absent", () => {
    expect(consentId({})).toBeUndefined();
  });
});

describe("sessionId helper", () => {
  it("returns dataSessionId field", () => {
    expect(sessionId({ dataSessionId: "session-xyz" })).toBe("session-xyz");
  });

  it("returns undefined when absent", () => {
    expect(sessionId({})).toBeUndefined();
  });
});

describe("consentStatus helper", () => {
  it("returns nested data.status", () => {
    expect(consentStatus({ data: { status: "ACTIVE" } })).toBe("ACTIVE");
  });

  it("returns undefined when absent", () => {
    expect(consentStatus({})).toBeUndefined();
  });
});

describe("sessionStatus helper", () => {
  it("returns nested data.status", () => {
    expect(sessionStatus({ data: { status: "COMPLETED" } })).toBe("COMPLETED");
  });
});

describe("isPaymentSuccessful", () => {
  it("returns true only for payment.success", () => {
    expect(isPaymentSuccessful({ eventType: "payment.success" })).toBe(true);
    expect(isPaymentSuccessful({ eventType: "payment.failed" })).toBe(false);
    expect(isPaymentSuccessful({})).toBe(false);
  });
});

describe("isConsentActive", () => {
  it("returns true when data.status is ACTIVE", () => {
    expect(isConsentActive({ data: { status: "ACTIVE" } })).toBe(true);
    expect(isConsentActive({ data: { status: "REVOKED" } })).toBe(false);
    expect(isConsentActive({})).toBe(false);
  });
});

describe("isSessionCompleted", () => {
  it("returns true when data.status is COMPLETED", () => {
    expect(isSessionCompleted({ data: { status: "COMPLETED" } })).toBe(true);
    expect(isSessionCompleted({ data: { status: "PARTIAL" } })).toBe(false);
    expect(isSessionCompleted({})).toBe(false);
  });
});
