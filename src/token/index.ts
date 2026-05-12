import type { SetuConfig } from "../config/index.js";
import { getUrls } from "../config/index.js";
import { authError, decodeError, type SetuResult, ok, err } from "../error/index.js";
import { telemetry } from "../telemetry/index.js";

const TOKEN_TTL_S = 300;
const REFRESH_BUFFER_S = 60;
const LOGIN_PATH = "/v1/users/login";
const USER_AGENT = "setu-node/1.0.0";

interface CachedToken {
  token: string;
  expiresAtS: number; // Unix seconds
}

/** Cache keyed by `clientId:environment`. */
const cache = new Map<string, CachedToken>();

/** In-flight refresh promises — singleflight deduplication. */
const inFlight = new Map<string, Promise<SetuResult<string>>>();

function cacheKey(cfg: SetuConfig): string {
  return `${cfg.clientId}:${cfg.environment}`;
}

function getFromCache(cfg: SetuConfig): string | undefined {
  const entry = cache.get(cacheKey(cfg));
  if (!entry) return undefined;
  const nowS = Math.floor(Date.now() / 1_000);
  return entry.expiresAtS - nowS > REFRESH_BUFFER_S ? entry.token : undefined;
}

function setInCache(cfg: SetuConfig, token: string, ttlS: number): void {
  const nowS = Math.floor(Date.now() / 1_000);
  cache.set(cacheKey(cfg), { token, expiresAtS: nowS + ttlS });
}

async function doFetch(cfg: SetuConfig): Promise<SetuResult<string>> {
  const startMs = Date.now();
  const url = getUrls(cfg).accountService + LOGIN_PATH;
  const body = JSON.stringify({
    clientID: cfg.clientId,
    secret: cfg.clientSecret,
    grant_type: "client_credentials",
  });

  let success = false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
        client: "bridge",
      },
      body,
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      return err(authError(res.status, `Token fetch failed: ${raw}`));
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (e) {
      return err(decodeError("Token JSON decode failed", e));
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("access_token" in parsed) ||
      typeof (parsed as { access_token?: unknown }).access_token !== "string"
    ) {
      return err(decodeError("Token response missing access_token field"));
    }

    const tokenData = parsed as { access_token: string; expires_in?: unknown };
    const token = tokenData.access_token;
    const ttl = typeof tokenData.expires_in === "number" ? tokenData.expires_in : TOKEN_TTL_S;

    setInCache(cfg, token, ttl);
    success = true;
    return ok(token);
  } catch (e) {
    return err(authError(0, `Token fetch threw: ${String(e)}`));
  } finally {
    telemetry.emit("token:refresh", {
      environment: cfg.environment,
      success,
      durationMs: Date.now() - startMs,
    });
  }
}

/**
 * Returns a valid Bearer token for the given config.
 *
 * Reads from the in-memory cache first. On cache miss, performs a token
 * refresh with **singleflight deduplication** — if multiple concurrent calls
 * hit a miss simultaneously, only one HTTP request is made and all callers
 * await the same promise.
 */
export async function getToken(cfg: SetuConfig): Promise<SetuResult<string>> {
  const cached = getFromCache(cfg);
  if (cached !== undefined) return ok(cached);

  const key = cacheKey(cfg);
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing;

  const promise = doFetch(cfg).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Clears the cached token for the given config, forcing a re-fetch on the
 * next call to {@link getToken}.
 */
export function invalidateToken(cfg: SetuConfig): void {
  cache.delete(cacheKey(cfg));
}

/** Clears all cached tokens. Useful between test runs. */
export function clearTokenCache(): void {
  cache.clear();
  inFlight.clear();
}
