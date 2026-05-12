/**
 * @module setu-node/payments/upi
 *
 * Complete UPI Setu (UMAP) API client.
 *
 * Covers Flash (DQR / SQR), Collect, TPV, Mandates (recurring / one-time / SBMD),
 * mandate operations, pre-debit notifications, execution, refunds, disputes,
 * and aggregator merchant onboarding.
 *
 * All endpoints authenticate with Bearer tokens managed by {@link getToken}.
 *
 * @example
 * ```ts
 * const cfg = createConfig({ clientId: "...", clientSecret: "..." });
 * const result = await createDqr(cfg, merchantId, {
 *   merchantVpa: "shop@pineaxis",
 *   amount: 10_000,   // ₹100 in paise
 * });
 * if (result.ok) console.log(result.data.intentLink);
 * ```
 */

import type { SetuConfig } from "../config/index.js";
import { getUrls } from "../config/index.js";
import { validationError, type SetuResult, err } from "../error/index.js";
import { jsonRequest } from "../http/index.js";
import { getToken } from "../token/index.js";
import {
  requireMerchant,
  requireId,
  requireParam,
  requirePositive,
  chain,
} from "../validation/index.js";

// ── Shared request helpers ────────────────────────────────────────────────────

function umapUrl(cfg: SetuConfig, path: string): string {
  return getUrls(cfg).umapApi + path;
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function merchantHeaders(token: string, merchantId: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, merchantid: merchantId };
}

async function withToken<T>(
  cfg: SetuConfig,
  fn: (token: string) => Promise<SetuResult<T>>
): Promise<SetuResult<T>> {
  const tokenResult = await getToken(cfg);
  if (!tokenResult.ok) return tokenResult;
  return fn(tokenResult.data);
}

async function doGet(
  cfg: SetuConfig,
  path: string,
  headers: Record<string, string>
): Promise<SetuResult<unknown>> {
  return jsonRequest("GET", umapUrl(cfg, path), headers, undefined, cfg);
}

async function doPost(
  cfg: SetuConfig,
  path: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<SetuResult<unknown>> {
  return jsonRequest("POST", umapUrl(cfg, path), headers, body, cfg);
}

async function doPut(
  cfg: SetuConfig,
  path: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<SetuResult<unknown>> {
  return jsonRequest("PUT", umapUrl(cfg, path), headers, body, cfg);
}

/** Converts a snake_case key to camelCase. */
function camelizeKey(key: string): string {
  const [head, ...tail] = key.split("_");
  return (head ?? "") + tail.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

/** Converts all top-level atom keys to camelCase string keys. */
function camelize(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [camelizeKey(k), v]));
}

/** Removes keys with null or undefined values. */
function rejectNils(m: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null && v !== undefined));
}

// ── Flash — Dynamic QR ────────────────────────────────────────────────────────

export interface CreateDqrParams {
  merchantVpa: string;
  amount?: number;
  minAmount?: number;
  referenceId?: string;
  transactionNote?: string;
  expiryDate?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a Dynamic QR (DQR) — a single-use UPI payment link / QR code.
 *
 * `POST /v1/merchants/dqr`
 */
export async function createDqr(
  cfg: SetuConfig,
  merchantId: string,
  params: CreateDqrParams
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(params.merchantVpa, "merchantVpa"));
  if (!v.ok) return err(v.error);

  return withToken(cfg, (token) =>
    doPost(
      cfg,
      "/v1/merchants/dqr",
      merchantHeaders(token, merchantId),
      camelize(params as unknown as Record<string, unknown>)
    )
  );
}

/** Fetches a Dynamic QR by its ID. `GET /v1/merchants/dqr/{id}` */
export async function getDqr(
  cfg: SetuConfig,
  merchantId: string,
  dqrId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(dqrId, "dqrId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(cfg, `/v1/merchants/dqr/${dqrId}`, merchantHeaders(token, merchantId))
  );
}

// ── Static QR ────────────────────────────────────────────────────────────────

export interface CreateSqrParams {
  merchantVpa: string;
  [key: string]: unknown;
}

/** Creates a Static QR (SQR). `POST /v1/merchants/sqr` */
export async function createSqr(
  cfg: SetuConfig,
  merchantId: string,
  params: CreateSqrParams
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(params.merchantVpa, "merchantVpa"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPost(
      cfg,
      "/v1/merchants/sqr",
      merchantHeaders(token, merchantId),
      camelize(params as Record<string, unknown>)
    )
  );
}

/** Fetches a Static QR by its ID. `GET /v1/merchants/sqr/{id}` */
export async function getSqr(
  cfg: SetuConfig,
  merchantId: string,
  sqrId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(sqrId, "sqrId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(cfg, `/v1/merchants/sqr/${sqrId}`, merchantHeaders(token, merchantId))
  );
}

// ── Payment history ───────────────────────────────────────────────────────────

/** Returns the most recent payment on a product instance. */
export async function getLastPayment(
  cfg: SetuConfig,
  merchantId: string,
  productInstanceId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(productInstanceId, "productInstanceId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(
      cfg,
      `/v1/merchants/payments/product-instances/${productInstanceId}/last`,
      merchantHeaders(token, merchantId)
    )
  );
}

/** Returns the 5 most recent payments on a product instance. */
export async function getPaymentHistory(
  cfg: SetuConfig,
  merchantId: string,
  productInstanceId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(productInstanceId, "productInstanceId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(
      cfg,
      `/v1/merchants/payments/product-instances/${productInstanceId}/history`,
      merchantHeaders(token, merchantId)
    )
  );
}

// ── TPV ───────────────────────────────────────────────────────────────────────

export interface CustomerAccount {
  ifsc: string;
  accountNumber: string;
}

export interface CreateTpvParams {
  merchantVpa: string;
  customerAccount: CustomerAccount;
  amount?: number;
  minAmount?: number;
  referenceId?: string;
  transactionNote?: string;
  expiryDate?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a TPV payment link (Third-Party Validation).
 * Mandatory for SEBI-regulated merchants.
 *
 * `POST /v1/merchants/tpv`
 */
export async function createTpv(
  cfg: SetuConfig,
  merchantId: string,
  params: CreateTpvParams
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(params.merchantVpa, "merchantVpa"));
  if (!v.ok) return err(v.error);

  const { ifsc, accountNumber } = params.customerAccount;
  if (!ifsc) {
    return err(validationError("customerAccount.ifsc", "IFSC is required for TPV"));
  }
  if (!accountNumber) {
    return err(
      validationError("customerAccount.accountNumber", "accountNumber is required for TPV")
    );
  }

  const body = rejectNils({
    merchantVpa: params.merchantVpa,
    customerAccount: { ifsc, accountNumber },
    amount: params.amount ?? null,
    minAmount: params.minAmount ?? null,
    referenceId: params.referenceId ?? null,
    transactionNote: params.transactionNote ?? null,
    expiryDate: params.expiryDate ?? null,
    metadata: params.metadata ?? null,
  });

  return withToken(cfg, (token) =>
    doPost(cfg, "/v1/merchants/tpv", merchantHeaders(token, merchantId), body)
  );
}

/** Fetches a TPV link by its ID. `GET /v1/merchants/tpv/{id}` */
export async function getTpv(
  cfg: SetuConfig,
  merchantId: string,
  tpvId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(tpvId, "tpvId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(cfg, `/v1/merchants/tpv/${tpvId}`, merchantHeaders(token, merchantId))
  );
}

// ── Collect ───────────────────────────────────────────────────────────────────

/** Verifies whether a customer VPA is valid. */
export async function verifyVpa(
  cfg: SetuConfig,
  merchantId: string,
  vpa: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(vpa, "vpa"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(
      cfg,
      `/v1/merchants/vpa/validate?vpa=${encodeURIComponent(vpa)}`,
      merchantHeaders(token, merchantId)
    )
  );
}

export interface CreateCollectParams {
  customerVpa: string;
  merchantVpa: string;
  merchantReferenceId: string;
  amount: number;
  currency?: string;
  [key: string]: unknown;
}

/**
 * Creates a UPI Collect request.
 * @deprecated Prefer {@link createDqr} for new integrations per NPCI guidance.
 *
 * `POST /v1/merchants/collect`
 */
export async function createCollect(
  cfg: SetuConfig,
  merchantId: string,
  params: CreateCollectParams
): Promise<SetuResult<unknown>> {
  const p = params as Record<string, unknown>;
  const v = chain(
    requireMerchant(merchantId),
    requireParam(p, "customerVpa"),
    requireParam(p, "merchantVpa"),
    requirePositive(params.amount, "amount")
  );
  if (!v.ok) return err(v.error);

  const body = camelize({ ...params, currency: params.currency ?? "INR" });
  return withToken(cfg, (token) =>
    doPost(cfg, "/v1/merchants/collect", merchantHeaders(token, merchantId), body)
  );
}

/** Fetches the status of a collect request. */
export async function getCollect(
  cfg: SetuConfig,
  merchantId: string,
  collectId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(collectId, "collectId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(cfg, `/v1/merchants/collect/${collectId}`, merchantHeaders(token, merchantId))
  );
}

// ── Mandates ──────────────────────────────────────────────────────────────────

export interface CreateMandateParams {
  merchantVpa: string;
  startDate: string;
  endDate: string;
  frequency: string;
  [key: string]: unknown;
}

/**
 * Creates a UPI Mandate (recurring / one-time / SBMD).
 * `POST /v1/merchants/mandates`
 */
export async function createMandate(
  cfg: SetuConfig,
  merchantId: string,
  params: CreateMandateParams
): Promise<SetuResult<unknown>> {
  const p = params as Record<string, unknown>;
  const v = chain(
    requireMerchant(merchantId),
    requireParam(p, "merchantVpa"),
    requireParam(p, "startDate"),
    requireParam(p, "endDate"),
    requireParam(p, "frequency")
  );
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPost(cfg, "/v1/merchants/mandates", merchantHeaders(token, merchantId), camelize(p))
  );
}

/** Retrieves the current status of a mandate. */
export async function getMandate(
  cfg: SetuConfig,
  merchantId: string,
  mandateId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(mandateId, "mandateId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(cfg, `/v1/merchants/mandates/${mandateId}`, merchantHeaders(token, merchantId))
  );
}

/** Updates a mandate's amount limit or end date. */
export async function updateMandate(
  cfg: SetuConfig,
  merchantId: string,
  mandateId: string,
  params: Record<string, unknown>
): Promise<SetuResult<unknown>> {
  const v = chain(
    requireMerchant(merchantId),
    requireId(mandateId, "mandateId"),
    requireParam(params, "merchantReferenceId")
  );
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPut(
      cfg,
      `/v1/merchants/mandates/${mandateId}/modify`,
      merchantHeaders(token, merchantId),
      camelize(params)
    )
  );
}

/** Initiates merchant-side mandate revocation. */
export async function revokeMandate(
  cfg: SetuConfig,
  merchantId: string,
  mandateId: string,
  params: Record<string, unknown> = {}
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(mandateId, "mandateId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPut(
      cfg,
      `/v1/merchants/mandates/${mandateId}/revoke`,
      merchantHeaders(token, merchantId),
      camelize(params)
    )
  );
}

/** Retrieves the status of a mandate operation. */
export async function getMandateOperation(
  cfg: SetuConfig,
  merchantId: string,
  operationId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(operationId, "operationId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(
      cfg,
      `/v1/merchants/mandate-operations/${operationId}`,
      merchantHeaders(token, merchantId)
    )
  );
}

// ── Pre-debit ─────────────────────────────────────────────────────────────────

export interface PreDebitParams {
  umn: string;
  executionDate: string;
  amount?: number;
  sequenceNumber?: string;
  merchantReferenceId?: string;
  [key: string]: unknown;
}

/**
 * Sends a pre-debit notification 48–72 hours before mandate execution.
 * `POST /v1/merchants/mandates/{id}/notify`
 */
export async function preDebitNotify(
  cfg: SetuConfig,
  merchantId: string,
  mandateId: string,
  params: PreDebitParams
): Promise<SetuResult<unknown>> {
  const p = params as Record<string, unknown>;
  const v = chain(
    requireMerchant(merchantId),
    requireId(mandateId, "mandateId"),
    requireParam(p, "umn"),
    requireParam(p, "executionDate")
  );
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPost(
      cfg,
      `/v1/merchants/mandates/${mandateId}/notify`,
      merchantHeaders(token, merchantId),
      camelize(p)
    )
  );
}

/** Retrieves the status of a pre-debit notification. */
export async function getPreDebitNotification(
  cfg: SetuConfig,
  merchantId: string,
  notificationId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(notificationId, "notificationId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(
      cfg,
      `/v1/merchants/mandate-pre-debit-notifications/${notificationId}`,
      merchantHeaders(token, merchantId)
    )
  );
}

// ── Mandate execution ─────────────────────────────────────────────────────────

export interface ExecuteMandateParams {
  umn: string;
  amount?: number;
  sequenceNumber?: string;
  merchantReferenceId?: string;
  [key: string]: unknown;
}

/** Executes a mandate — debits the customer's bank account. */
export async function executeMandate(
  cfg: SetuConfig,
  merchantId: string,
  mandateId: string,
  params: ExecuteMandateParams
): Promise<SetuResult<unknown>> {
  const p = params as Record<string, unknown>;
  const v = chain(
    requireMerchant(merchantId),
    requireId(mandateId, "mandateId"),
    requireParam(p, "umn")
  );
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPost(
      cfg,
      `/v1/merchants/mandates/${mandateId}/execute`,
      merchantHeaders(token, merchantId),
      camelize(p)
    )
  );
}

/** Retrieves the status of a mandate execution. */
export async function getMandateExecution(
  cfg: SetuConfig,
  merchantId: string,
  executionId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(executionId, "executionId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(
      cfg,
      `/v1/merchants/mandate-executions/${executionId}`,
      merchantHeaders(token, merchantId)
    )
  );
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export interface CreateRefundParams {
  paymentId: string;
  amount: number;
  merchantReferenceId: string;
  type?: string;
  currency?: string;
  [key: string]: unknown;
}

/**
 * Initiates a refund for a completed UPI payment (within 60 days).
 * `POST /v1/merchants/refunds`
 */
export async function createRefund(
  cfg: SetuConfig,
  merchantId: string,
  params: CreateRefundParams
): Promise<SetuResult<unknown>> {
  const p = params as Record<string, unknown>;
  const v = chain(
    requireMerchant(merchantId),
    requireParam(p, "paymentId"),
    requirePositive(params.amount, "amount"),
    requireParam(p, "merchantReferenceId")
  );
  if (!v.ok) return err(v.error);

  const body = camelize({
    ...params,
    type: params.type ?? "online",
    currency: params.currency ?? "INR",
  });

  return withToken(cfg, (token) =>
    doPost(cfg, "/v1/merchants/refunds", merchantHeaders(token, merchantId), body)
  );
}

/** Retrieves the status of a refund. */
export async function getRefund(
  cfg: SetuConfig,
  merchantId: string,
  refundId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(refundId, "refundId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(cfg, `/v1/merchants/refunds/${refundId}`, merchantHeaders(token, merchantId))
  );
}

// ── Disputes ──────────────────────────────────────────────────────────────────

/** Retrieves the details of a customer dispute. */
export async function getDispute(
  cfg: SetuConfig,
  merchantId: string,
  disputeId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(disputeId, "disputeId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(cfg, `/v1/merchants/disputes/${disputeId}`, merchantHeaders(token, merchantId))
  );
}

/** Accepts a customer dispute, triggering an automatic refund. */
export async function acceptDispute(
  cfg: SetuConfig,
  merchantId: string,
  disputeId: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireMerchant(merchantId), requireId(disputeId, "disputeId"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPut(cfg, `/v1/merchants/disputes/${disputeId}/accept`, merchantHeaders(token, merchantId), {})
  );
}

/** Contests a dispute by submitting evidence to NPCI. */
export async function rejectDispute(
  cfg: SetuConfig,
  merchantId: string,
  disputeId: string,
  params: { evidence: string; [key: string]: unknown }
): Promise<SetuResult<unknown>> {
  const p = params as Record<string, unknown>;
  const v = chain(
    requireMerchant(merchantId),
    requireId(disputeId, "disputeId"),
    requireParam(p, "evidence")
  );
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPut(
      cfg,
      `/v1/merchants/disputes/${disputeId}/reject`,
      merchantHeaders(token, merchantId),
      camelize(p)
    )
  );
}

// ── Aggregator merchant onboarding ────────────────────────────────────────────

export interface CreateMerchantParams {
  aggregatorAccountId: string;
  businessName: string;
  [key: string]: unknown;
}

/** Onboards a new merchant under an aggregator account. */
export async function createMerchant(
  cfg: SetuConfig,
  params: CreateMerchantParams
): Promise<SetuResult<unknown>> {
  const p = params as Record<string, unknown>;
  const v = chain(requireParam(p, "aggregatorAccountId"), requireParam(p, "businessName"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPost(cfg, "/v1/aggregators/merchants", authHeaders(token), camelize(p))
  );
}

/** Retrieves a merchant by ID (aggregator only). */
export async function getMerchant(
  cfg: SetuConfig,
  merchantId: string
): Promise<SetuResult<unknown>> {
  const v = requireId(merchantId, "merchantId");
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doGet(cfg, `/v1/aggregators/merchants/${merchantId}`, authHeaders(token))
  );
}

/** Checks whether a VPA is available for assignment. */
export async function checkVpaAvailability(
  cfg: SetuConfig,
  vpa: string
): Promise<SetuResult<unknown>> {
  const v = requireId(vpa, "vpa");
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPost(cfg, "/v1/aggregators/vpa/check", authHeaders(token), { vpa })
  );
}

/** Assigns a VPA to a merchant (aggregator only). */
export async function createVpa(
  cfg: SetuConfig,
  merchantId: string,
  params: { vpa: string; [key: string]: unknown }
): Promise<SetuResult<unknown>> {
  const p = params as Record<string, unknown>;
  const v = chain(requireMerchant(merchantId), requireParam(p, "vpa"));
  if (!v.ok) return err(v.error);
  return withToken(cfg, (token) =>
    doPost(cfg, "/v1/merchants/vpas", merchantHeaders(token, merchantId), camelize(p))
  );
}
