import type { SetuConfig } from "../config/index.js";
import {
  apiError,
  authError,
  decodeError,
  networkError,
  rateLimitError,
  type SetuError,
  type SetuResult,
  ok,
  err,
} from "../error/index.js";
import { acquireToken } from "../ratelimit/index.js";
import { span } from "../telemetry/index.js";

const USER_AGENT = "setu-node/1.0.0";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface RawResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: string;
}

// ── Backoff ───────────────────────────────────────────────────────────────────

/** Full-jitter exponential backoff: sleep in [0, min(maxDelay, base * 2^attempt)]. */
function backoffMs(attempt: number, cfg: SetuConfig): number {
  const cap = Math.min(
    cfg.retryMaxDelayMs,
    Math.round(cfg.retryBaseDelayMs * Math.pow(2, attempt))
  );
  return Math.floor(Math.random() * Math.max(1, cap));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Retry classification ──────────────────────────────────────────────────────

function isRetryableStatus(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

// ── Error decoding ────────────────────────────────────────────────────────────

function parseErrorBody(raw: string): { code: string; message: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const p = parsed as Record<string, unknown>;
    if (typeof p["code"] === "string" && typeof p["message"] === "string") {
      return { code: p["code"], message: p["message"] };
    }
    if (typeof p["error"] === "string" && typeof p["message"] === "string") {
      return { code: p["error"], message: p["message"] };
    }
    if (typeof p["message"] === "string") {
      return { code: "UNKNOWN", message: p["message"] };
    }
  } catch {
    // not JSON
  }
  return undefined;
}

function decodeHttpError(res: RawResponse): SetuError {
  const traceId = res.headers.get("x-trace-id") ?? undefined;
  const retryAfter = res.headers.get("retry-after") ?? undefined;
  const parsed = parseErrorBody(res.body);
  const message = parsed?.message ?? res.body;
  const code = parsed?.code ?? String(res.status);

  if (res.status === 401 || res.status === 403) {
    return authError(res.status, message, traceId);
  }
  if (res.status === 429) {
    return rateLimitError(traceId, retryAfter);
  }
  return apiError(res.status, code, message, traceId);
}

// ── Core request ──────────────────────────────────────────────────────────────

async function doRequest(
  method: HttpMethod,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
  cfg: SetuConfig,
  attempt: number
): Promise<SetuResult<RawResponse>> {
  try {
    await acquireToken(cfg);
  } catch {
    return err(networkError("Rate-limit wait timed out"));
  }

  const result = await span({ method, url, attempt }, async () => {
    try {
      const res = await fetch(url, {
        method,
        headers: { "user-agent": USER_AGENT, ...headers },
        body: body ?? undefined,
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });

      const raw = await res.text();
      const response: RawResponse = {
        status: res.status,
        headers: res.headers,
        body: raw,
      };
      return ok(response);
    } catch (e) {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        return err(networkError("Request timed out", e));
      }
      return err(networkError(`Network error: ${String(e)}`, e));
    }
  });

  const canRetry =
    attempt < cfg.maxRetries &&
    (result.ok ? isRetryableStatus(result.data.status) : result.error.retryable);

  if (canRetry) {
    await sleep(backoffMs(attempt, cfg));
    return doRequest(method, url, headers, body, cfg, attempt + 1);
  }

  return result;
}

/**
 * Executes an HTTP request with rate limiting, retry, and telemetry.
 * Returns the raw response (status + body) without JSON decoding.
 */
export async function request(
  method: HttpMethod,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
  cfg: SetuConfig
): Promise<SetuResult<RawResponse>> {
  return doRequest(method, url, headers, body, cfg, 0);
}

/**
 * Executes a JSON API request and decodes a 2xx response body.
 * On non-2xx, decodes the Setu error shape into a {@link SetuError}.
 */
export async function jsonRequest(
  method: HttpMethod,
  url: string,
  extraHeaders: Record<string, string>,
  body: unknown,
  cfg: SetuConfig
): Promise<SetuResult<unknown>> {
  const encoded = body !== undefined ? JSON.stringify(body) : undefined;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    ...extraHeaders,
  };

  const result = await request(method, url, headers, encoded, cfg);
  if (!result.ok) return result;

  const raw = result.data;

  if (raw.status >= 200 && raw.status < 300) {
    if (!raw.body) return ok({});
    try {
      return ok(JSON.parse(raw.body) as unknown);
    } catch (e) {
      return err(decodeError("JSON decode failed", e));
    }
  }

  return err(decodeHttpError(raw));
}
