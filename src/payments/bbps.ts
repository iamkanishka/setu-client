/**
 * @module setu-node/payments/bbps
 * Setu BBPS BillCollect, BillPay, and WhatsApp Collect clients.
 */

import type { SetuConfig } from "../config/index.js";
import { getUrls } from "../config/index.js";
import { type SetuResult, err } from "../error/index.js";
import { jsonRequest } from "../http/index.js";
import { getToken } from "../token/index.js";
import { requireId, requireParam, requirePositive, chain } from "../validation/index.js";

function umapUrl(cfg: SetuConfig, path: string): string {
  return getUrls(cfg).umapApi + path;
}

async function withToken<T>(
  cfg: SetuConfig,
  fn: (token: string) => Promise<SetuResult<T>>
): Promise<SetuResult<T>> {
  const result = await getToken(cfg);
  if (!result.ok) return result;
  return fn(result.data);
}

function rejectNils(m: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null && v !== undefined));
}

// ── BBPS BillCollect (biller side) ───────────────────────────────────────────

/**
 * Fetches a BBPS transaction by its Setu platform ID.
 * `GET /v1/bbps/transactions/{id}`
 */
export async function getTransaction(cfg: SetuConfig, txnId: string): Promise<SetuResult<unknown>> {
  const v = requireId(txnId, "txnId");
  if (!v.ok) return err(v.error);

  return withToken(cfg, async (token) =>
    jsonRequest(
      "GET",
      umapUrl(cfg, `/v1/bbps/transactions/${txnId}`),
      { authorization: `Bearer ${token}` },
      undefined,
      cfg
    )
  );
}

export interface CustomerInfo {
  [key: string]: unknown;
}

export interface BillDetail {
  billerBillId: string;
  amount: number;
  dueDate?: string;
  generatedOn?: string;
  recurrence?: string;
  amountExactness?: string;
  currencyCode?: string;
  aggregates?: unknown;
  settlement?: unknown;
}

/**
 * Builds a bill-fetch response body for your `/bills/fetch/` webhook endpoint.
 */
export function buildBillFetchResponse(
  customer: CustomerInfo,
  bills: BillDetail[]
): Record<string, unknown> {
  const status = bills.length === 0 ? "NOT_AVAILABLE" : "AVAILABLE";
  return {
    customer,
    billDetails: { billFetchStatus: status, bills: bills.map(buildBill) },
  };
}

/** Builds a bill map for inclusion in a bill-fetch response. */
export function buildBill(params: BillDetail): Record<string, unknown> {
  return rejectNils({
    generatedOn: params.generatedOn ?? null,
    dueDate: params.dueDate ?? null,
    recurrence: params.recurrence ?? "ONE_TIME",
    amountExactness: params.amountExactness ?? "EXACT",
    billerBillID: params.billerBillId,
    amount: {
      currencyCode: params.currencyCode ?? "INR",
      value: params.amount,
    },
    aggregates: params.aggregates ?? null,
    settlement: params.settlement ?? null,
  });
}

export interface SettlementAccount {
  id?: string;
  ifsc?: string;
  name?: string;
}

export interface SettlementPart {
  account: { id?: string; ifsc?: string };
  splitValue: number;
  remarks?: string;
}

/** Builds a settlement split object for BBPS payment routing (up to 5 parts). */
export function buildSettlement(
  primaryAccount: SettlementAccount,
  parts: SettlementPart[] = []
): Record<string, unknown> {
  return {
    primaryAccount: rejectNils({
      id: primaryAccount.id ?? null,
      ifsc: primaryAccount.ifsc ?? null,
      name: primaryAccount.name ?? null,
    }),
    parts: parts.map((part) =>
      rejectNils({
        account: rejectNils({
          id: part.account.id ?? null,
          ifsc: part.account.ifsc ?? null,
        }),
        split: { unit: "INR", value: part.splitValue },
        remarks: part.remarks ?? null,
      })
    ),
  };
}

// ── BBPS BillPay (agent side) ─────────────────────────────────────────────────

export interface FetchBillParams {
  billerId: string;
  customerIdentifiers?: Record<string, unknown>;
}

/**
 * Fetches a customer's bill from a BBPS biller.
 * `POST /v1/billpay/bills/fetch`
 */
export async function fetchBill(
  cfg: SetuConfig,
  params: FetchBillParams
): Promise<SetuResult<unknown>> {
  const v = requireParam(params as unknown as Record<string, unknown>, "billerId");
  if (!v.ok) return err(v.error);

  const body = {
    billerId: params.billerId,
    customerIdentifiers: params.customerIdentifiers ?? {},
  };

  return withToken(cfg, async (token) =>
    jsonRequest(
      "POST",
      umapUrl(cfg, "/v1/billpay/bills/fetch"),
      { authorization: `Bearer ${token}` },
      body,
      cfg
    )
  );
}

export interface PayBillParams {
  billerId: string;
  amount: number;
  paymentMode?: string;
  merchantReferenceId?: string;
  customerIdentifiers?: Record<string, unknown>;
  customerMobile?: string;
}

/**
 * Pays a bill through the BBPS network.
 * `POST /v1/billpay/bills/pay`
 */
export async function payBill(
  cfg: SetuConfig,
  params: PayBillParams
): Promise<SetuResult<unknown>> {
  const p = params as unknown as Record<string, unknown>;
  const v = chain(requireParam(p, "billerId"), requirePositive(params.amount, "amount"));
  if (!v.ok) return err(v.error);

  const body = rejectNils({
    billerId: params.billerId,
    amount: params.amount,
    paymentMode: params.paymentMode ?? null,
    merchantReferenceId: params.merchantReferenceId ?? null,
    customerIdentifiers: params.customerIdentifiers ?? {},
    customerMobile: params.customerMobile ?? null,
  });

  return withToken(cfg, async (token) =>
    jsonRequest(
      "POST",
      umapUrl(cfg, "/v1/billpay/bills/pay"),
      { authorization: `Bearer ${token}` },
      body,
      cfg
    )
  );
}

// ── WhatsApp Collect ──────────────────────────────────────────────────────────

export interface SendReminderParams {
  customerMobile: string;
  billerBillId: string;
  billAmount: number;
  customerName?: string;
  dueDate?: string;
  templateName?: string;
  expiryMinutes?: number;
  languageCode?: string;
}

/**
 * Sends a WhatsApp bill payment reminder with an embedded payment link.
 * `POST /v1/whatsapp/bills`
 */
export async function sendReminder(
  cfg: SetuConfig,
  params: SendReminderParams
): Promise<SetuResult<unknown>> {
  const p = params as unknown as Record<string, unknown>;
  const v = chain(
    requireParam(p, "customerMobile"),
    requireParam(p, "billerBillId"),
    requirePositive(params.billAmount, "billAmount")
  );
  if (!v.ok) return err(v.error);

  const body = rejectNils({
    customerMobile: params.customerMobile,
    customerName: params.customerName ?? null,
    billAmount: params.billAmount,
    billerBillId: params.billerBillId,
    dueDate: params.dueDate ?? null,
    templateName: params.templateName ?? null,
    expiryMinutes: params.expiryMinutes ?? null,
    languageCode: params.languageCode ?? null,
  });

  return withToken(cfg, async (token) =>
    jsonRequest(
      "POST",
      umapUrl(cfg, "/v1/whatsapp/bills"),
      { authorization: `Bearer ${token}` },
      body,
      cfg
    )
  );
}

/**
 * Fetches the delivery and payment status of a sent WhatsApp reminder.
 * `GET /v1/whatsapp/bills/{id}`
 */
export async function getReminderStatus(cfg: SetuConfig, id: string): Promise<SetuResult<unknown>> {
  const v = requireId(id, "id");
  if (!v.ok) return err(v.error);

  return withToken(cfg, async (token) =>
    jsonRequest(
      "GET",
      umapUrl(cfg, `/v1/whatsapp/bills/${id}`),
      { authorization: `Bearer ${token}` },
      undefined,
      cfg
    )
  );
}
