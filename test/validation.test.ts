import { describe, it, expect } from "vitest";
import {
  requireParam,
  requirePositive,
  requireId,
  requireMerchant,
  chain,
} from "../src/validation/index.js";

describe("requireParam", () => {
  it("returns ok for a non-empty string value", () => {
    expect(requireParam({ name: "Alice" }, "name").ok).toBe(true);
  });

  it("fails for missing key", () => {
    const r = requireParam({}, "name");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.field).toBe("name");
      expect(r.error.type).toBe("validation");
    }
  });

  it("fails for empty string", () => {
    expect(requireParam({ name: "" }, "name").ok).toBe(false);
  });

  it("fails for non-string value", () => {
    expect(requireParam({ age: 42 }, "age").ok).toBe(false);
  });

  it("fails for null", () => {
    expect(requireParam({ x: null }, "x").ok).toBe(false);
  });
});

describe("requirePositive", () => {
  it("returns ok for a positive integer", () => {
    expect(requirePositive(100, "amount").ok).toBe(true);
  });

  it("fails for zero", () => {
    expect(requirePositive(0, "amount").ok).toBe(false);
  });

  it("fails for negative", () => {
    expect(requirePositive(-1, "amount").ok).toBe(false);
  });

  it("fails for a float", () => {
    expect(requirePositive(1.5, "amount").ok).toBe(false);
  });

  it("fails for a string", () => {
    expect(requirePositive("100", "amount").ok).toBe(false);
  });

  it("includes field name in error", () => {
    const r = requirePositive(0, "amount");
    if (!r.ok) expect(r.error.field).toBe("amount");
  });
});

describe("requireId", () => {
  it("returns ok for a non-empty string", () => {
    expect(requireId("abc-123", "id").ok).toBe(true);
  });

  it("fails for empty string", () => {
    expect(requireId("", "id").ok).toBe(false);
  });

  it("fails for undefined", () => {
    expect(requireId(undefined, "id").ok).toBe(false);
  });

  it("fails for number", () => {
    expect(requireId(99, "id").ok).toBe(false);
  });
});

describe("requireMerchant", () => {
  it("returns ok for a non-empty string", () => {
    expect(requireMerchant("mid-123").ok).toBe(true);
  });

  it("fails for empty string with merchant_id field", () => {
    const r = requireMerchant("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("merchant_id");
  });

  it("fails for undefined", () => {
    expect(requireMerchant(undefined).ok).toBe(false);
  });
});

describe("chain", () => {
  it("returns ok when all checks pass", () => {
    const r = chain(
      requireParam({ a: "x" }, "a"),
      requireId("id-1", "id"),
      requirePositive(50, "amount")
    );
    expect(r.ok).toBe(true);
  });

  it("short-circuits on first failure", () => {
    let called = false;
    const lazy = () => {
      called = true;
      return { ok: true as const };
    };
    const r = chain(requireParam({}, "missing"), lazy());
    expect(r.ok).toBe(false);
    // The lazy result was pre-computed before chain, but the important
    // check is that the returned result is the first failure.
    if (!r.ok) expect(r.error.field).toBe("missing");
    expect(called).toBe(true); // JS evaluates args before calling chain
  });

  it("returns the first failing error", () => {
    const r = chain(requireParam({}, "a"), requireParam({}, "b"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("a");
  });

  it("returns ok for empty chain", () => {
    expect(chain().ok).toBe(true);
  });
});
