/**
 * @module setu-node/data/aa
 * Setu Account Aggregator (AA) FIU API client.
 *
 * @example
 * ```ts
 * const consent = await createConsent(cfg, {
 *   vua: "9999999999",
 *   fetchType: "ONETIME",
 *   consentTypes: ["TRANSACTIONS"],
 *   fiTypes: ["DEPOSIT"],
 *   consentDuration: { unit: "MONTH", value: 1 },
 *   dataRange: { from: "2024-01-01T00:00:00Z", to: "2024-12-31T23:59:59Z" },
 * });
 * ```
 */

import type { SetuConfig } from "../config/index.js";
import { getUrls, getKycHeaders } from "../config/index.js";
import { validationError, type SetuResult, err } from "../error/index.js";
import { jsonRequest } from "../http/index.js";
import { requireId, requireParam, chain } from "../validation/index.js";

function fiuUrl(cfg: SetuConfig, path: string): string {
  return getUrls(cfg).fiu + path;
}

async function kycReq(
  cfg: SetuConfig,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<SetuResult<unknown>> {
  return jsonRequest(method, fiuUrl(cfg, path), getKycHeaders(cfg), body, cfg);
}

// ── Consent ───────────────────────────────────────────────────────────────────

export interface Duration {
  unit: string;
  value: number;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface CreateConsentParams {
  vua: string;
  fetchType: string;
  consentTypes: string[];
  fiTypes: string[];
  /** Either `consentDuration` or `consentDateRange` is required. */
  consentDuration?: Duration;
  consentDateRange?: DateRange;
  dataRange?: DateRange;
  consentMode?: string;
  purpose?: unknown;
  dataLife?: Duration;
  frequency?: { unit: string; value: unknown };
  dataFilter?: unknown;
  redirectUrl?: string;
  context?: unknown;
  tags?: unknown;
}

/**
 * Creates an AA consent request. Redirect the customer to `response.url`.
 * `POST /consents`
 */
export async function createConsent(
  cfg: SetuConfig,
  params: CreateConsentParams
): Promise<SetuResult<unknown>> {
  const p = params as unknown as Record<string, unknown>;
  const v = chain(requireParam(p, "vua"), requireParam(p, "fetchType"));
  if (!v.ok) return err(v.error);

  if (params.consentDuration === undefined && params.consentDateRange === undefined) {
    return err(
      validationError("consentDuration", "consentDuration or consentDateRange is required")
    );
  }
  if (params.consentTypes.length === 0) {
    return err(validationError("consentTypes", "at least one consent type is required"));
  }
  if (params.consentTypes.includes("TRANSACTIONS") && params.dataRange === undefined) {
    return err(
      validationError("dataRange", "dataRange is required when consentTypes includes TRANSACTIONS")
    );
  }
  if (params.fiTypes.length === 0) {
    return err(validationError("fiTypes", "at least one FI type is required"));
  }

  return kycReq(cfg, "POST", "/consents", buildConsentBody(params));
}

/**
 * Retrieves the status of a consent request.
 * `GET /consents/:id[?expanded=true]`
 */
export async function getConsent(
  cfg: SetuConfig,
  consentId: string,
  expanded = false
): Promise<SetuResult<unknown>> {
  const v = requireId(consentId, "consentId");
  if (!v.ok) return err(v.error);
  const suffix = expanded ? "?expanded=true" : "";
  return kycReq(cfg, "GET", `/consents/${consentId}${suffix}`);
}

/** Revokes an active consent. `POST /v2/consents/:id/revoke` */
export async function revokeConsent(
  cfg: SetuConfig,
  consentId: string
): Promise<SetuResult<unknown>> {
  const v = requireId(consentId, "consentId");
  if (!v.ok) return err(v.error);
  return kycReq(cfg, "POST", `/v2/consents/${consentId}/revoke`);
}

export interface MultiConsentParams {
  mandatoryConsents: string[];
  optionalConsents?: string[];
}

/** Merges two consent requests into a single approval flow. */
export async function createMultiConsent(
  cfg: SetuConfig,
  params: MultiConsentParams
): Promise<SetuResult<unknown>> {
  if (params.mandatoryConsents.length === 0) {
    return err(
      validationError("mandatoryConsents", "at least one mandatory consent ID is required")
    );
  }
  return kycReq(cfg, "POST", "/v2/consents/collection", {
    mandatoryConsents: params.mandatoryConsents,
    optionalConsents: params.optionalConsents ?? [],
  });
}

/** Returns the timestamp and FIP list of the most recent data fetch. */
export async function getLastFetchStatus(
  cfg: SetuConfig,
  consentId: string
): Promise<SetuResult<unknown>> {
  const v = requireId(consentId, "consentId");
  if (!v.ok) return err(v.error);
  return kycReq(cfg, "GET", `/v2/consents/${consentId}/fetch/status`);
}

/** Lists all non-expired data sessions for a consent. */
export async function listDataSessions(
  cfg: SetuConfig,
  consentId: string
): Promise<SetuResult<unknown>> {
  const v = requireId(consentId, "consentId");
  if (!v.ok) return err(v.error);
  return kycReq(cfg, "GET", `/v2/consents/${consentId}/data-sessions`);
}

// ── Data fetch ────────────────────────────────────────────────────────────────

export interface CreateDataSessionParams {
  consentId: string;
  format?: string;
  fipDataRange?: DateRange;
}

/**
 * Creates a data fetch session against an ACTIVE consent.
 * `POST /v2/sessions`
 */
export async function createDataSession(
  cfg: SetuConfig,
  params: CreateDataSessionParams
): Promise<SetuResult<unknown>> {
  const v = requireParam(params as unknown as Record<string, unknown>, "consentId");
  if (!v.ok) return err(v.error);

  const body: Record<string, unknown> = {
    consentId: params.consentId,
    format: params.format ?? "json",
  };
  if (params.fipDataRange) body["DataRange"] = params.fipDataRange;

  return kycReq(cfg, "POST", "/v2/sessions", body);
}

/** Retrieves the current status of a data session. `GET /v2/sessions/:id` */
export async function getDataSession(
  cfg: SetuConfig,
  sessionId: string
): Promise<SetuResult<unknown>> {
  const v = requireId(sessionId, "sessionId");
  if (!v.ok) return err(v.error);
  return kycReq(cfg, "GET", `/v2/sessions/${sessionId}`);
}

/** Fetches FI data for a COMPLETED or PARTIAL session. `GET /v2/sessions/:id/fetch` */
export async function fetchFiData(
  cfg: SetuConfig,
  sessionId: string
): Promise<SetuResult<unknown>> {
  const v = requireId(sessionId, "sessionId");
  if (!v.ok) return err(v.error);
  return kycReq(cfg, "GET", `/v2/sessions/${sessionId}/fetch`);
}

// ── Context helpers ───────────────────────────────────────────────────────────

/** Returns a context param filtering by account type (`"SAVINGS"` | `"CURRENT"`). */
export function withAccountType(type: string): Record<string, string> {
  return { key: "accounttype", value: type };
}

/** Returns a context param restricting consent to specific FIP IDs (comma-separated). */
export function withFipFilter(fipIds: string): Record<string, string> {
  return { key: "fipId", value: fipIds };
}

/** Returns a context param excluding specific FIP IDs (comma-separated). */
export function withExcludeFips(fipIds: string): Record<string, string> {
  return { key: "excludeFipIds", value: fipIds };
}

/** Returns a context param for account selection mode. */
export function withAccountSelectionMode(
  mode: "single" | "multi" | "multi-opt-out"
): Record<string, string> {
  return { key: "accountSelectionMode", value: mode };
}

/** Returns a context param filtering by transaction type. */
export function withTransactionType(type: "debit" | "credit"): Record<string, string> {
  return { key: "transactionType", value: type };
}

/** Returns a context param with a custom consent purpose description. */
export function withPurposeDescription(desc: string): Record<string, string> {
  return { key: "purposeDescription", value: desc };
}

// ── Private builders ──────────────────────────────────────────────────────────

function formatDuration(d: Duration | undefined): Record<string, string> | undefined {
  if (!d) return undefined;
  return { unit: d.unit, value: String(d.value) };
}

function formatDateRange(r: DateRange | undefined): Record<string, string> | undefined {
  if (!r) return undefined;
  return { from: r.from, to: r.to };
}

function buildConsentBody(params: CreateConsentParams): Record<string, unknown> {
  const base: Record<string, unknown> = {
    vua: params.vua,
    fetchType: params.fetchType,
    consentMode: params.consentMode,
    consentTypes: params.consentTypes,
    fiTypes: params.fiTypes,
    purpose: params.purpose,
    dataRange: formatDateRange(params.dataRange),
    dataLife: formatDuration(params.dataLife),
    frequency: params.frequency
      ? { unit: params.frequency.unit, value: params.frequency.value }
      : undefined,
    dataFilter: params.dataFilter,
    redirectUrl: params.redirectUrl,
    context: params.context,
    consentDuration: formatDuration(params.consentDuration),
    consentDateRange: formatDateRange(params.consentDateRange),
  };

  if (params.tags !== undefined) {
    base["additionalParams"] = { tags: params.tags };
  }

  return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== null && v !== undefined));
}
