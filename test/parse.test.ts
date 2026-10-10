import { describe, expect, it } from "vitest";
import { parseJson, parseTxt, tryParseJson, tryParseTxt } from "../src/index.js";
import { codeOf, fixture } from "./helpers.js";

describe("parseTxt (Czech, 09.10.2026)", () => {
  const list = parseTxt(fixture("cs-2026-10-09.txt"));

  it("reads the header", () => {
    expect(list.date).toBe("2026-10-09");
    expect(list.sequence).toBe(195);
    expect(list.rates).toHaveLength(30);
  });

  it("reads lines with Czech decimal commas", () => {
    expect(list.rates[0]).toEqual({
      country: "Austrálie",
      currency: "dolar",
      amount: 1,
      code: "AUD",
      rate: "15.181",
      perUnit: "15.181",
    });
    const eur = list.rates.find((r) => r.code === "EUR")!;
    expect(eur).toMatchObject({ country: "EMU", currency: "euro", rate: "24.365" });
  });

  it("normalises rates per 1 unit for multiplier amounts", () => {
    const by = (c: string) => list.rates.find((r) => r.code === c)!;
    expect(by("JPY")).toMatchObject({ amount: 100, rate: "13.744", perUnit: "0.13744" });
    expect(by("IDR")).toMatchObject({ amount: 1000, rate: "1.216", perUnit: "0.001216" });
    expect(by("HUF")).toMatchObject({ amount: 100, rate: "6.675", perUnit: "0.06675" });
    expect(by("PHP")).toMatchObject({ amount: 100, rate: "34.615", perUnit: "0.34615" });
    expect(by("DKK")).toMatchObject({ amount: 1, rate: "3.26", perUnit: "3.26" }); // published as 3,260
  });

  it("returns frozen data", () => {
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list.rates)).toBe(true);
    expect(Object.isFrozen(list.rates[0])).toBe(true);
  });
});

describe("other sources agree", () => {
  const cs = parseTxt(fixture("cs-2026-10-09.txt"));
  const strip = (l: typeof cs) => l.rates.map(({ code, amount, rate, perUnit }) => ({ code, amount, rate, perUnit }));
  const sorted = (l: typeof cs) => strip(l).sort((a, b) => a.code.localeCompare(b.code));

  it("English TXT (09 Oct 2026 header, dot decimals)", () => {
    const en = parseTxt(fixture("en-2026-10-09.txt"));
    expect(en.date).toBe("2026-10-09");
    expect(en.sequence).toBe(195);
    expect(en.rates.find((r) => r.code === "USD")).toMatchObject({ country: "USA", currency: "dollar" });
    expect(sorted(en)).toEqual(sorted(cs));
  });

  it("JSON API", () => {
    const json = parseJson(fixture("api-2026-10-09.json"));
    expect(json.date).toBe("2026-10-09");
    expect(json.sequence).toBe(195);
    expect(sorted(json)).toEqual(sorted(cs));
    // Also accepts an already-parsed object.
    expect(parseJson(JSON.parse(fixture("api-2026-10-09.json"))).rates).toHaveLength(30);
  });

  it("historical list (03.01.2000)", () => {
    const old = parseTxt(fixture("cs-2000-01-03.txt"));
    expect(old.date).toBe("2000-01-03");
    expect(old.sequence).toBe(1);
    expect(old.rates.find((r) => r.code === "GRD")).toMatchObject({ amount: 100, rate: "10.937" });
  });

  it("other committed fixtures parse", () => {
    expect(parseTxt(fixture("cs-2026-10-02.txt"))).toMatchObject({ date: "2026-10-02", sequence: 190 });
    expect(parseTxt(fixture("cs-2026-09-25.txt"))).toMatchObject({ date: "2026-09-25", sequence: 186 });
    expect(parseTxt(fixture("cs-2025-12-31.txt"))).toMatchObject({ date: "2025-12-31", sequence: 251 });
  });
});

describe("format variants", () => {
  const body = "země|měna|množství|kód|kurz\nUSA|dolar|1|USD|21,745\n";

  it("accepts CRLF, BOM and the FAQ's DD.Mon.YYYY header", () => {
    expect(parseTxt("\uFEFF09.10.2026 #195\r\n" + body.replace(/\n/g, "\r\n")).rates).toHaveLength(1);
    expect(parseTxt("03.Jan.2000 #1\n" + body).date).toBe("2000-01-03");
  });

  it("computes perUnit exactly for any amount", () => {
    const head = "09.10.2026 #195\nzemě|měna|množství|kód|kurz\n";
    const per = (amount: string, rate: string) => parseTxt(`${head}X|y|${amount}|XYZ|${rate}\n`).rates[0]!.perUnit;
    expect(per("10", "2,5")).toBe("0.25");
    expect(per("1000000", "123,456")).toBe("0.000123456");
    expect(per("1", "21,745")).toBe("21.745");
    // Not a power of ten: exact long division, truncated to 20 places.
    expect(per("4", "1")).toBe("0.25");
    expect(per("3", "1")).toBe("0.33333333333333333333");
    expect(per("101", "10,1")).toBe("0.1");
  });

  it("stops at the first blank line (1999-2001 calculated-rates section)", () => {
    const text = "04.01.1999 #1\n" + body + "\nCountry|Currency|Amount|Code|Rate\nBelgium|frank|100|BEF|89.762\n";
    const list = parseTxt(text);
    expect(list.rates.map((r) => r.code)).toEqual(["USD"]);
  });
});

describe("parse errors", () => {
  const good = "09.10.2026 #195\nzemě|měna|množství|kód|kurz\n";
  const cases: Array<[string, string]> = [
    ["empty input", ""],
    ["bad header", "hello\n"],
    ["impossible header date", "31.02.2026 #1\nzemě|měna|množství|kód|kurz\nUSA|dolar|1|USD|21,745"],
    ["bad month name", "09 Foo 2026 #1\nzemě|měna|množství|kód|kurz\nUSA|dolar|1|USD|21,745"],
    ["bad column header", "09.10.2026 #195\na|b|c|d|e\nUSA|dolar|1|USD|21,745"],
    ["no rates", good],
    ["wrong column count", good + "USA|dolar|1|USD\n"],
    ["bad amount", good + "USA|dolar|0|USD|21,745\n"],
    ["bad code", good + "USA|dolar|1|usd|21,745\n"],
    ["bad rate", good + "USA|dolar|1|USD|21.7.45\n"],
    ["zero rate", good + "USA|dolar|1|USD|0,000\n"],
    ["duplicate code", good + "USA|dolar|1|USD|21,745\nUSA|dolar|1|USD|21,745\n"],
  ];
  it.each(cases)("rejects %s", (_n, text) => {
    expect(codeOf(() => parseTxt(text))).toBe("ParseError");
    expect(tryParseTxt(text).ok).toBe(false);
  });

  it("rejects non-string TXT input", () => {
    expect(codeOf(() => parseTxt(42 as never))).toBe("ParseError");
  });

  const row = { validFor: "2026-10-09", order: 195, country: "USA", currency: "dollar", amount: 1, currencyCode: "USD", rate: 21.745 };
  const jsonCases: Array<[string, unknown]> = [
    ["invalid JSON", "{"],
    ["missing rates", { foo: 1 }],
    ["empty rates", { rates: [] }],
    ["null row", { rates: [null] }],
    ["bad validFor", { rates: [{ ...row, validFor: "09.10.2026" }] }],
    ["impossible validFor", { rates: [{ ...row, validFor: "2026-02-31" }] }],
    ["bad order", { rates: [{ ...row, order: "x" }] }],
    ["mixed lists", { rates: [row, { ...row, currencyCode: "EUR", order: 194 }] }],
    ["bad rate", { rates: [{ ...row, rate: "21.745" }] }],
    ["API error body", { description: "ValidationErrorCode: typeMismatch", errorCode: "VALIDATION_ERROR" }],
  ];
  it.each(jsonCases)("parseJson rejects %s", (_n, input) => {
    expect(codeOf(() => parseJson(input))).toBe("ParseError");
    expect(tryParseJson(input).ok).toBe(false);
  });
});
