import { EventEmitter } from "node:events";
import type { SetuError } from "../error/index.js";

// ── Event shapes ──────────────────────────────────────────────────────────────

export interface RequestStartEvent {
  method: string;
  url: string;
  attempt: number;
  startTimeMs: number;
}

export interface RequestStopEvent {
  method: string;
  url: string;
  attempt: number;
  durationMs: number;
  httpStatus: number | undefined;
}

export interface RequestExceptionEvent {
  method: string;
  url: string;
  attempt: number;
  durationMs: number;
  error: SetuError;
}

export interface TokenRefreshEvent {
  environment: string;
  success: boolean;
  durationMs: number;
}

export interface RateLimitWaitEvent {
  waitMs: number;
}

// ── Typed event map ───────────────────────────────────────────────────────────

export interface SetuEvents {
  "request:start": [event: RequestStartEvent];
  "request:stop": [event: RequestStopEvent];
  "request:exception": [event: RequestExceptionEvent];
  "token:refresh": [event: TokenRefreshEvent];
  "ratelimit:wait": [event: RateLimitWaitEvent];
}

// ── Singleton emitter ─────────────────────────────────────────────────────────

class SetuTelemetry extends EventEmitter {
  constructor() {
    super({ captureRejections: true });
    // Default: log exceptions and failed token refreshes to stderr
    this.on("request:exception", (e) => {
      process.stderr.write(
        `[setu] HTTP exception method=${e.method} url=${e.url} attempt=${String(e.attempt)} error=${e.error.message}\n`
      );
    });
    this.on("token:refresh", (e) => {
      if (!e.success) {
        process.stderr.write(
          `[setu] Token refresh failed env=${e.environment} duration=${String(e.durationMs)}ms\n`
        );
      }
    });
  }

  override emit<K extends keyof SetuEvents>(event: K, ...args: SetuEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  override on<K extends keyof SetuEvents>(
    event: K,
    listener: (...args: SetuEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof SetuEvents>(
    event: K,
    listener: (...args: SetuEvents[K]) => void
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof SetuEvents>(
    event: K,
    listener: (...args: SetuEvents[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }
}

/** Global telemetry bus. Attach listeners to observe SDK internals. */
export const telemetry = new SetuTelemetry();

// ── Span helper ───────────────────────────────────────────────────────────────

function extractHttpStatus(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  return typeof v["httpStatus"] === "number" ? v["httpStatus"] : undefined;
}

/**
 * Wraps an async operation in telemetry start/stop/exception events.
 * @internal
 */
export async function span<T>(
  meta: Pick<RequestStartEvent, "method" | "url" | "attempt">,
  fn: () => Promise<T>
): Promise<T> {
  const startTimeMs = Date.now();
  telemetry.emit("request:start", { ...meta, startTimeMs });

  try {
    const result = await fn();
    const durationMs = Date.now() - startTimeMs;
    const httpStatus = extractHttpStatus(result);
    telemetry.emit("request:stop", { ...meta, durationMs, httpStatus });
    return result;
  } catch (thrown) {
    const durationMs = Date.now() - startTimeMs;
    telemetry.emit("request:exception", {
      ...meta,
      durationMs,
      error: thrown as SetuError,
    });
    throw thrown;
  }
}
