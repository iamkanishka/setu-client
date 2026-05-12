import type { SetuConfig } from "../config/index.js";
import { telemetry } from "../telemetry/index.js";

const CHECK_INTERVAL_MS = 50;

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

/** Per-(clientId + environment) token buckets. */
const buckets = new Map<string, Bucket>();

function bucketKey(cfg: SetuConfig): string {
  return `${cfg.clientId}:${cfg.environment}`;
}

function tryAcquire(cfg: SetuConfig): boolean {
  const key = bucketKey(cfg);
  const nowMs = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: cfg.rateLimitBurst, lastRefillMs: nowMs };
    buckets.set(key, bucket);
  }

  const elapsedSec = (nowMs - bucket.lastRefillMs) / 1_000;
  bucket.tokens = Math.min(cfg.rateLimitBurst, bucket.tokens + cfg.rateLimitRps * elapsedSec);
  bucket.lastRefillMs = nowMs;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/**
 * Acquires one token from the rate-limiter bucket for the given config.
 *
 * Resolves immediately when a token is available.
 * Rejects with an error if `cfg.timeoutMs` elapses before a token is granted.
 */
export async function acquireToken(cfg: SetuConfig): Promise<void> {
  const deadline = Date.now() + cfg.timeoutMs;

  return new Promise<void>((resolve, reject) => {
    function attempt(): void {
      if (tryAcquire(cfg)) {
        resolve();
        return;
      }

      const now = Date.now();
      if (now >= deadline) {
        reject(new Error("Rate-limit wait timed out"));
        return;
      }

      telemetry.emit("ratelimit:wait", { waitMs: CHECK_INTERVAL_MS });
      setTimeout(attempt, CHECK_INTERVAL_MS);
    }

    attempt();
  });
}

/** Clears all rate-limit buckets. Useful between test runs. */
export function resetBuckets(): void {
  buckets.clear();
}
