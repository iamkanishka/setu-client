/**
 * @module setu-node/webhook
 *
 * Unified webhook dispatcher for all Setu notification events.
 *
 * @example
 * ```ts
 * // Express.js usage
 * app.post("/webhooks/setu", express.raw({ type: "application/json" }), (req, res) => {
 *   const result = dispatchRaw(req.body.toString(), myCallbacks);
 *   res.sendStatus(result ? 200 : 400);
 * });
 * ```
 */

// ── Callback types ────────────────────────────────────────────────────────────

export type CallbackResult = void | Promise<void>;

export interface SetuCallbacks {
  /** Called for payment events: initiated, pending, success, failed. */
  handlePayment?: (event: WebhookEvent) => CallbackResult;
  /** Called for all mandate status and mandate operation events. */
  handleMandate?: (event: WebhookEvent) => CallbackResult;
  /** Called for refund.pending and refund.successful events. */
  handleRefund?: (event: WebhookEvent) => CallbackResult;
  /** Called for all dispute_* events. */
  handleDispute?: (event: WebhookEvent) => CallbackResult;
  /** Called for CONSENT_STATUS_UPDATE events. */
  handleConsent?: (event: WebhookEvent) => CallbackResult;
  /** Called for SESSION_STATUS_UPDATE events. */
  handleSession?: (event: WebhookEvent) => CallbackResult;
  /** Called for BBPS BILL_SETTLEMENT_STATUS events. */
  handleBbpsSettlement?: (event: WebhookEvent) => CallbackResult;
  /** Called for unrecognised event types. */
  handleUnknown?: (event: WebhookEvent) => CallbackResult;
}

export type WebhookEvent = Record<string, unknown>;

// ── Event sets (mirrors the Elixir source) ────────────────────────────────────

const PAYMENT_EVENTS = new Set([
  "payment.initiated",
  "payment.pending",
  "payment.success",
  "payment.failed",
]);

const MANDATE_EVENTS = new Set([
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
]);

const REFUND_EVENTS = new Set(["refund.pending", "refund.successful"]);

const DISPUTE_EVENTS = new Set([
  "dispute_created",
  "dispute_open",
  "dispute_closed",
  "dispute_in_review",
  "dispute_won",
  "dispute_lost",
]);

const CONSENT_EVENT = "CONSENT_STATUS_UPDATE";
const SESSION_EVENT = "SESSION_STATUS_UPDATE";

// ── Dispatcher ────────────────────────────────────────────────────────────────

function isBbpsSettlement(event: WebhookEvent): boolean {
  return "events" in event && "partnerDetails" in event;
}

function getEventType(event: WebhookEvent): string {
  const et = event["eventType"] ?? event["type"];
  return typeof et === "string" ? et : "";
}

async function safeCall(
  fn: ((event: WebhookEvent) => CallbackResult) | undefined,
  event: WebhookEvent,
  callbackName: string
): Promise<void> {
  if (!fn) return;
  try {
    await fn(event);
  } catch (e) {
    process.stderr.write(`[setu] ${callbackName} threw: ${String(e)}\n`);
  }
}

/**
 * Dispatches a decoded webhook event object to the appropriate callback.
 * All callbacks are awaited and errors are caught (never throws).
 */
export async function dispatch(event: WebhookEvent, callbacks: SetuCallbacks): Promise<void> {
  const eventType = getEventType(event);

  if (PAYMENT_EVENTS.has(eventType)) {
    return safeCall(callbacks.handlePayment, event, "handlePayment");
  }
  if (MANDATE_EVENTS.has(eventType)) {
    return safeCall(callbacks.handleMandate, event, "handleMandate");
  }
  if (REFUND_EVENTS.has(eventType)) {
    return safeCall(callbacks.handleRefund, event, "handleRefund");
  }
  if (DISPUTE_EVENTS.has(eventType)) {
    return safeCall(callbacks.handleDispute, event, "handleDispute");
  }
  if (eventType === CONSENT_EVENT) {
    return safeCall(callbacks.handleConsent, event, "handleConsent");
  }
  if (eventType === SESSION_EVENT) {
    return safeCall(callbacks.handleSession, event, "handleSession");
  }
  if (isBbpsSettlement(event)) {
    return safeCall(callbacks.handleBbpsSettlement, event, "handleBbpsSettlement");
  }
  return safeCall(callbacks.handleUnknown, event, "handleUnknown");
}

/**
 * Parses a raw JSON string and dispatches to the appropriate callback.
 * Returns `false` if JSON parsing fails.
 */
export async function dispatchRaw(body: string, callbacks: SetuCallbacks): Promise<boolean> {
  let event: WebhookEvent;
  try {
    event = JSON.parse(body) as WebhookEvent;
  } catch {
    process.stderr.write("[setu] Failed to decode webhook body\n");
    return false;
  }
  await dispatch(event, callbacks);
  return true;
}

// ── Helper predicates ─────────────────────────────────────────────────────────

/** Returns the event type string from a decoded webhook event map. */
export function eventType(event: WebhookEvent): string {
  return getEventType(event) || "unknown";
}

/** Returns the consent ID from an AA consent notification. */
export function consentId(event: WebhookEvent): string | undefined {
  const id = event["consentId"];
  return typeof id === "string" ? id : undefined;
}

/** Returns the data session ID from an AA session notification. */
export function sessionId(event: WebhookEvent): string | undefined {
  const id = event["dataSessionId"];
  return typeof id === "string" ? id : undefined;
}

/** Returns the consent status from an AA consent notification. */
export function consentStatus(event: WebhookEvent): string | undefined {
  const data = event["data"] as Record<string, unknown> | undefined;
  const status = data?.["status"];
  return typeof status === "string" ? status : undefined;
}

/** Returns the session status from an AA session notification. */
export function sessionStatus(event: WebhookEvent): string | undefined {
  const data = event["data"] as Record<string, unknown> | undefined;
  const status = data?.["status"];
  return typeof status === "string" ? status : undefined;
}

/** Returns `true` when the event is a successful payment. */
export function isPaymentSuccessful(event: WebhookEvent): boolean {
  return event["eventType"] === "payment.success";
}

/** Returns `true` when the consent status in the event is `"ACTIVE"`. */
export function isConsentActive(event: WebhookEvent): boolean {
  return consentStatus(event) === "ACTIVE";
}

/** Returns `true` when the session status in the event is `"COMPLETED"`. */
export function isSessionCompleted(event: WebhookEvent): boolean {
  return sessionStatus(event) === "COMPLETED";
}
