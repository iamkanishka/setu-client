import { describe, it, expect } from "vitest";
import {
  apiError,
  authError,
  rateLimitError,
  networkError,
  validationError,
  decodeError,
  formatError,
  isSetuError,
  ok,
  err,
} from "../src/error/index.js";

describe("apiError", () => {
  it("builds a retryable api error for 5xx", () => {
    const e = apiError(500, "SERVER_ERROR", "Internal error");
    expect(e.type).toBe("api");
    expect(e.httpStatus).toBe(500);
    expect(e.code).toBe("SERVER_ERROR");
    expect(e.retryable).toBe(true);
    expect(e.traceId).toBeUndefined();
  });

  it("is not retryable for 400", () => {
    const e = apiError(400, "BAD_REQUEST", "Bad input");
    expect(e.retryable).toBe(false);
  });

  it("includes traceId when provided", () => {
    const e = apiError(500, "ERR", "msg", "trace-123");
    expect(e.traceId).toBe("trace-123");
  });
});

describe("authError", () => {
  it("is never retryable", () => {
    const e = authError(401, "Unauthorized");
    expect(e.type).toBe("auth");
    expect(e.retryable).toBe(false);
    expect(e.code).toBe("AUTH_ERROR");
  });
});

describe("rateLimitError", () => {
  it("is always retryable with correct code", () => {
    const e = rateLimitError("tid", "30");
    expect(e.type).toBe("rate_limit");
    expect(e.retryable).toBe(true);
    expect(e.httpStatus).toBe(429);
    expect(e.retryAfter).toBe("30");
    expect(e.traceId).toBe("tid");
  });
});

describe("networkError", () => {
  it("is always retryable", () => {
    const cause = new Error("ECONNREFUSED");
    const e = networkError("Connection refused", cause);
    expect(e.type).toBe("network");
    expect(e.retryable).toBe(true);
    expect(e.cause).toBe(cause);
    expect(e.httpStatus).toBeUndefined();
  });
});

describe("validationError", () => {
  it("sets field and is not retryable", () => {
    const e = validationError("pan", "PAN must be 10 chars");
    expect(e.type).toBe("validation");
    expect(e.field).toBe("pan");
    expect(e.retryable).toBe(false);
    expect(e.httpStatus).toBe(400);
  });

  it("accepts undefined field", () => {
    const e = validationError(undefined, "something went wrong");
    expect(e.field).toBeUndefined();
  });
});

describe("decodeError", () => {
  it("is not retryable", () => {
    const e = decodeError("JSON parse failed");
    expect(e.type).toBe("decode");
    expect(e.retryable).toBe(false);
    expect(e.httpStatus).toBeUndefined();
  });
});

describe("formatError", () => {
  it("formats a full error message", () => {
    const e = apiError(500, "ERR", "Internal error", "trace-42");
    const msg = formatError(e);
    expect(msg).toContain("[api]");
    expect(msg).toContain("Internal error");
    expect(msg).toContain("HTTP 500");
    expect(msg).toContain("traceId=trace-42");
  });

  it("includes field in validation errors", () => {
    const e = validationError("pan", "required");
    expect(formatError(e)).toContain("field: pan");
  });

  it("omits httpStatus when undefined", () => {
    const e = networkError("oops");
    expect(formatError(e)).not.toContain("HTTP");
  });
});

describe("isSetuError", () => {
  it("returns true for a SetuError", () => {
    expect(isSetuError(apiError(400, "ERR", "msg"))).toBe(true);
  });

  it("returns false for non-errors", () => {
    expect(isSetuError(null)).toBe(false);
    expect(isSetuError("string")).toBe(false);
    expect(isSetuError({ type: "x" })).toBe(false); // missing code/message/retryable
  });
});

describe("ok / err result helpers", () => {
  it("ok wraps data", () => {
    const r = ok({ id: "123" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ id: "123" });
  });

  it("err wraps error", () => {
    const r = err(networkError("oops"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("network");
  });
});
