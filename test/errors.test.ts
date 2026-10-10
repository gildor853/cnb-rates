import { describe, expect, it } from "vitest";
import { CnbRatesError, isCnbRatesError, tryParseTxt } from "../src/index.js";
import { attempt, attemptAsync, show } from "../src/errors.js";
import { roundRatio } from "../src/decimal.js";

describe("errors", () => {
  it("CnbRatesError carries name, code, message, status and cause", () => {
    const cause = new Error("socket hang up");
    const err = new CnbRatesError("FetchError", "failed", { status: 503, cause });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("CnbRatesError");
    expect(err.code).toBe("FetchError");
    expect(err.message).toBe("failed");
    expect(err.status).toBe(503);
    expect(err.cause).toBe(cause);
    const plain = new CnbRatesError("ParseError", "x");
    expect(plain.status).toBeUndefined();
    expect("cause" in plain).toBe(false);
  });

  it("isCnbRatesError narrows only library errors", () => {
    expect(isCnbRatesError(new CnbRatesError("ParseError", "x"))).toBe(true);
    expect(isCnbRatesError(new Error("x"))).toBe(false);
    expect(isCnbRatesError({ code: "ParseError" })).toBe(false);
    expect(isCnbRatesError(null)).toBe(false);
  });

  it("try* variants return library errors as results", () => {
    const r = tryParseTxt("");
    expect(!r.ok && isCnbRatesError(r.error) && r.error.code).toBe("ParseError");
  });

  it("attempt / attemptAsync rethrow anything that is not a library error", async () => {
    const bug = new TypeError("bug");
    expect(() =>
      attempt(() => {
        throw bug;
      }),
    ).toThrow(bug);
    await expect(attemptAsync(() => Promise.reject(bug))).rejects.toBe(bug);
    await expect(attemptAsync(() => Promise.resolve(1))).resolves.toEqual({ ok: true, value: 1 });
    const lib = new CnbRatesError("FetchError", "x");
    await expect(attemptAsync(() => Promise.reject(lib))).resolves.toEqual({ ok: false, error: lib });
  });
});

describe("roundRatio (internal)", () => {
  it("normalises a negative denominator", () => {
    expect(roundRatio(1n, -3n, 2, "half-up")).toBe("-0.33");
    expect(roundRatio(-2n, -3n, 2, "half-up")).toBe("0.67");
    expect(roundRatio(5n, 2n, 0, "half-even")).toBe("2");
    expect(roundRatio(5n, 2n, 0, "trunc")).toBe("2");
  });

  it("show describes untrusted values without throwing", () => {
    expect(show("abc")).toBe('"abc"');
    expect(show("x".repeat(50))).toBe(JSON.stringify(`${"x".repeat(40)}…`));
    expect(show(42)).toBe("42");
    expect(show(null)).toBe("null");
    expect(show(undefined)).toBe("undefined");
    expect(show(Symbol("s"))).toBe("Symbol(s)");
    expect(show(Object.create(null))).toBe("[object Object]");
    expect(show([1, 2])).toBe("[object Array]");
    expect(show(new Date(Number.NaN))).toBe("Invalid Date");
    expect(show(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
  });
});
