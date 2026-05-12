/** Discriminant for every structured Setu SDK error. */
export type ErrorType = "api" | "auth" | "rate_limit" | "network" | "validation" | "decode";

/** Structured error returned by every public SDK function. */
export interface SetuError {
  /** Discriminant tag — use for exhaustive pattern matching. */
  readonly type: ErrorType;
  /** HTTP status code, if the error originated from an HTTP response. */
  readonly httpStatus: number | undefined;
  /** Machine-readable error code from the Setu API or SDK. */
  readonly code: string;
  /** Human-readable description of the error. */
  readonly message: string;
  /** For validation errors: the offending field name. */
  readonly field: string | undefined;
  /** Setu trace ID for support tickets. */
  readonly traceId: string | undefined;
  /**
   * Value of the `Retry-After` header (seconds or HTTP date).
   * Present on rate-limit errors.
   */
  readonly retryAfter: string | undefined;
  /** Whether it is safe to retry this request. */
  readonly retryable: boolean;
  /** Original caught error or reason, if available. */
  readonly cause: unknown;
}

// ── Constructors ─────────────────────────────────────────────────────────────

/** Builds an `api` error from a non-2xx HTTP response. */
export function apiError(
  httpStatus: number,
  code: string,
  message: string,
  traceId?: string
): SetuError {
  return {
    type: "api",
    httpStatus,
    code,
    message,
    field: undefined,
    traceId,
    retryAfter: undefined,
    retryable: [429, 500, 502, 503, 504].includes(httpStatus),
    cause: undefined,
  };
}

/** Builds an `auth` error for HTTP 401 / 403. */
export function authError(httpStatus: number, message: string, traceId?: string): SetuError {
  return {
    type: "auth",
    httpStatus,
    code: "AUTH_ERROR",
    message,
    field: undefined,
    traceId,
    retryAfter: undefined,
    retryable: false,
    cause: undefined,
  };
}

/** Builds a `rate_limit` error for HTTP 429. */
export function rateLimitError(traceId?: string, retryAfter?: string): SetuError {
  return {
    type: "rate_limit",
    httpStatus: 429,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Rate limit exceeded",
    field: undefined,
    traceId,
    retryAfter,
    retryable: true,
    cause: undefined,
  };
}

/** Builds a `network` error from a transport-level exception. */
export function networkError(message: string, cause?: unknown): SetuError {
  return {
    type: "network",
    httpStatus: undefined,
    code: "NETWORK_ERROR",
    message,
    field: undefined,
    traceId: undefined,
    retryAfter: undefined,
    retryable: true,
    cause,
  };
}

/** Builds a `validation` error. No HTTP call is made when this is returned. */
export function validationError(field: string | undefined, message: string): SetuError {
  return {
    type: "validation",
    httpStatus: 400,
    code: "VALIDATION_ERROR",
    message,
    field,
    traceId: undefined,
    retryAfter: undefined,
    retryable: false,
    cause: undefined,
  };
}

/** Builds a `decode` error when JSON decoding fails. */
export function decodeError(message: string, cause?: unknown): SetuError {
  return {
    type: "decode",
    httpStatus: undefined,
    code: "DECODE_ERROR",
    message,
    field: undefined,
    traceId: undefined,
    retryAfter: undefined,
    retryable: false,
    cause,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a human-readable summary of the error. */
export function formatError(err: SetuError): string {
  let msg = `[${err.type}] ${err.message}`;
  if (err.field) msg += ` (field: ${err.field})`;
  if (err.httpStatus !== undefined) msg += ` HTTP ${String(err.httpStatus)}`;
  if (err.traceId) msg += ` traceId=${err.traceId}`;
  return msg;
}

/** Narrows an unknown thrown value to a {@link SetuError}, if possible. */
export function isSetuError(value: unknown): value is SetuError {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "code" in value &&
    "message" in value &&
    "retryable" in value
  );
}

/** Result type used by every public SDK function. */
export type SetuResult<T> = { ok: true; data: T } | { ok: false; error: SetuError };

/** Wraps a value into a successful result. */
export const ok = <T>(data: T): SetuResult<T> => ({ ok: true, data });

/** Wraps a {@link SetuError} into a failure result. */
export const err = (error: SetuError): SetuResult<never> => ({ ok: false, error });
