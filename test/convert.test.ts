import { describe, expect, it } from "vitest";
import { convert, getRate, listCurrencies, parseTxt, tryConvert } from "../src/index.js";
import { codeOf, fixture } from "./helpers.js";

// All expected values below are computed by hand from the 09.10.2026 #195 list:
// EUR 24,365 · USD 21,745 · GBP 28,745 · 100 JPY 13,744 · 1000 IDR 1,216 · 100 HUF 6,675
const list = parseTxt(fixture("cs-2026-10-09.txt"));

describe("convert", () => {
  it("foreign -> CZK", () => {
    expect(convert(100, "EUR", "CZK", list)).toBe("2436.50"); // 100 × 24.365
    expect(convert("10000", "JPY", "CZK", list)).toBe("1374.40"); // 10000 × 13.744 / 100
    expect(convert(1_000_000, "IDR", "CZK", list)).toBe("1216.00"); // 1e6 × 1.216 / 1000
    expect(convert(1000, "HUF", "CZK", list)).toBe("66.75"); // 1000 × 6.675 / 100
  });

  it("CZK -> foreign", () => {
    expect(convert(1000, "CZK", "EUR", list)).toBe("41.04"); // 1000 / 24.365 = 41.0424...
    expect(convert(1000, "CZK", "EUR", list, { decimals: 6 })).toBe("41.042479"); // 41.04247896...
    expect(convert(100, "CZK", "JPY", list)).toBe("727.59"); // 100 / 0.13744 = 727.5902...
  });

  it("cross rates via CZK", () => {
    expect(convert(100, "EUR", "USD", list)).toBe("112.05"); // 2436.5 / 21.745 = 112.0487...
    expect(convert(1, "GBP", "JPY", list)).toBe("209.15"); // 28.745 / 0.13744 = 209.1458...
    expect(convert(1000, "HUF", "EUR", list)).toBe("2.74"); // 66.75 / 24.365 = 2.7395...
    expect(convert(1, "JPY", "IDR", list)).toBe("113.03"); // 0.13744 / 0.001216 = 113.0263...
  });

  it("CZK -> CZK and same currency", () => {
    expect(convert("1234.5", "CZK", "CZK", list)).toBe("1234.50");
    expect(convert("19.999", "usd", "USD", list)).toBe("20.00");
  });

  it("is exact where binary floats are not", () => {
    // 0.1 × 24.365 = 2.4365 exactly; in floats 0.1 * 24.365 = 2.4365000000000006
    expect(convert(0.1, "EUR", "CZK", list, { decimals: 4 })).toBe("2.4365");
    expect(convert("0.3", "CZK", "CZK", list, { decimals: 20 })).toBe("0.30000000000000000000");
    expect(convert(123456789012345678901234567890n, "EUR", "CZK", list, { decimals: 0 })).toBe(
      "3008024664285802466428580246640", // × 24.365 = …246639.850, rounded half-up
    );
  });

  it("rounding modes on exact ties", () => {
    // 0.1 EUR = 2.4365 CZK -> tie at 3 decimals
    expect(convert("0.1", "EUR", "CZK", list, { decimals: 3 })).toBe("2.437");
    expect(convert("0.1", "EUR", "CZK", list, { decimals: 3, rounding: "half-even" })).toBe("2.436");
    expect(convert("0.1", "EUR", "CZK", list, { decimals: 3, rounding: "trunc" })).toBe("2.436");
    expect(convert("-0.1", "EUR", "CZK", list, { decimals: 3 })).toBe("-2.437");
    expect(convert("-0.1", "EUR", "CZK", list, { decimals: 3, rounding: "half-even" })).toBe("-2.436");
    expect(convert("1.005", "CZK", "CZK", list)).toBe("1.01");
    expect(convert("1.005", "CZK", "CZK", list, { rounding: "half-even" })).toBe("1.00");
    expect(convert("1.015", "CZK", "CZK", list, { rounding: "half-even" })).toBe("1.02");
    expect(convert("2.5", "CZK", "CZK", list, { decimals: 0, rounding: "half-even" })).toBe("2");
    expect(convert("3.5", "CZK", "CZK", list, { decimals: 0, rounding: "half-even" })).toBe("4");
  });

  it("formats zero and small negatives", () => {
    expect(convert(0, "EUR", "CZK", list)).toBe("0.00");
    expect(convert("-0.001", "CZK", "CZK", list)).toBe("0.00");
    expect(convert("-0.005", "CZK", "CZK", list)).toBe("-0.01");
    expect(convert(1, "IDR", "CZK", list, { decimals: 0 })).toBe("0");
  });

  it("rejects unknown currencies", () => {
    expect(codeOf(() => convert(1, "XYZ", "CZK", list))).toBe("UnknownCurrency");
    expect(codeOf(() => convert(1, "CZK", "BTC", list))).toBe("UnknownCurrency");
    expect(codeOf(() => convert(1, 5 as never, "CZK", list))).toBe("UnknownCurrency");
  });

  it("rejects invalid amounts and options", () => {
    for (const a of ["1,5", "1e3", "abc", "", " ", "1.", ".5", Number.NaN, Infinity, null as never]) {
      expect(codeOf(() => convert(a, "EUR", "CZK", list))).toBe("InvalidAmount");
    }
    expect(codeOf(() => convert(1, "EUR", "CZK", list, { decimals: -1 }))).toBe("InvalidAmount");
    expect(codeOf(() => convert(1, "EUR", "CZK", list, { decimals: 1.5 }))).toBe("InvalidAmount");
    expect(codeOf(() => convert(1, "EUR", "CZK", list, { rounding: "up" as never }))).toBe("InvalidAmount");
  });

  it("accepts numbers in exponent notation", () => {
    expect(convert(1e21, "CZK", "CZK", list, { decimals: 0 })).toBe("1000000000000000000000");
    expect(convert(1e-7, "EUR", "CZK", list, { decimals: 10 })).toBe("0.0000024365");
  });

  it("tryConvert returns a result", () => {
    expect(tryConvert(100, "EUR", "CZK", list)).toEqual({ ok: true, value: "2436.50" });
    const bad = tryConvert(1, "XYZ", "CZK", list);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("UnknownCurrency");
  });
});

describe("getRate / listCurrencies", () => {
  it("looks up case-insensitively", () => {
    expect(getRate("jpy", list)).toMatchObject({ code: "JPY", amount: 100, rate: "13.744", perUnit: "0.13744" });
  });
  it("CZK is not in the list", () => {
    expect(codeOf(() => getRate("CZK", list))).toBe("UnknownCurrency");
  });
  it("lists codes in published order", () => {
    const codes = listCurrencies(list);
    expect(codes).toHaveLength(30);
    expect(codes[0]).toBe("AUD");
    expect(codes).toContain("IDR");
    expect(codes).not.toContain("CZK");
  });
});
