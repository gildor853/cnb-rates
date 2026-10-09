import { attempt, fail, type Result } from "./errors.js";
import { formatDecimal, parseDecimal } from "./decimal.js";

/** One currency line of the ČNB fixing. */
export interface Rate {
  /** Country name as published (Czech or English, depending on the source). */
  readonly country: string;
  /** Currency name as published. */
  readonly currency: string;
  /** Number of currency units the rate refers to (e.g. 100 for JPY, 1000 for IDR). */
  readonly amount: number;
  /** ISO 4217 code, uppercase. */
  readonly code: string;
  /** CZK per `amount` units, as an exact decimal string with a `.` separator (e.g. `"13.744"`). */
  readonly rate: string;
  /** CZK per 1 unit, exact decimal string (e.g. `"0.13744"` for JPY). */
  readonly perUnit: string;
}

/** A complete daily rate list ("kurzovní lístek"). */
export interface RateList {
  /** Publication date of the list, `YYYY-MM-DD` (the date in the list header). */
  readonly date: string;
  /** Sequence number of the list within the year (the `#195` in the header). */
  readonly sequence: number;
  /** Rates in published order. */
  readonly rates: readonly Rate[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const HEADER_CS = ["země", "měna", "množství", "kód", "kurz"];
const HEADER_EN = ["country", "currency", "amount", "code", "rate"];

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** @internal `true` if y-m-d is a real calendar date. */
export function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= dim[m - 1]!;
}

function parseHeaderDate(line: string): { date: string; sequence: number } {
  // "09.10.2026 #195" (Czech), "09 Oct 2026 #195" (English), "03.Jan.2000 #1" (format documented in the ČNB FAQ)
  const m = /^(\d{1,2})[. ]\s*(\d{1,2}|[A-Za-z]{3})[. ]\s*(\d{4})\s+#(\d+)\s*$/.exec(line.trim());
  if (!m) return fail("ParseError", `Invalid header line: ${JSON.stringify(line)}`);
  const day = Number(m[1]);
  const month = /^\d+$/.test(m[2]!) ? Number(m[2]) : MONTHS[m[2]!.toLowerCase()];
  const year = Number(m[3]);
  if (month === undefined || !isRealDate(year, month, day)) {
    fail("ParseError", `Invalid date in header line: ${JSON.stringify(line)}`);
  }
  return { date: `${year}-${pad(month)}-${pad(day)}`, sequence: Number(m[4]) };
}

function perUnit(rate: string, amount: number): string {
  const d = parseDecimal(rate, "ParseError", "Rate");
  // ČNB amounts are powers of ten (1, 100, 1000, ...), so the division is exact.
  // Any other amount falls back to exact long division up to 20 places.
  const log = Math.log10(amount);
  if (Number.isInteger(log)) return formatDecimal({ units: d.units, scale: d.scale + log });
  const num = d.units * 10n ** 20n;
  const den = BigInt(amount) * 10n ** BigInt(d.scale);
  return formatDecimal({ units: num / den, scale: 20 });
}

function makeRate(country: string, currency: string, amountRaw: string, codeRaw: string, rateRaw: string, where: string): Rate {
  if (!/^\d+$/.test(amountRaw) || Number(amountRaw) <= 0 || !Number.isSafeInteger(Number(amountRaw))) {
    fail("ParseError", `${where}: invalid amount ${JSON.stringify(amountRaw)}`);
  }
  const code = codeRaw.trim();
  if (!/^[A-Z]{3}$/.test(code)) fail("ParseError", `${where}: invalid currency code ${JSON.stringify(codeRaw)}`);
  const normalized = rateRaw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) fail("ParseError", `${where}: invalid rate ${JSON.stringify(rateRaw)}`);
  const dec = parseDecimal(normalized, "ParseError", "Rate");
  if (dec.units <= 0n) fail("ParseError", `${where}: rate must be positive`);
  const amount = Number(amountRaw);
  const rate = formatDecimal(dec);
  return { country: country.trim(), currency: currency.trim(), amount, code, rate, perUnit: perUnit(rate, amount) };
}

function finish(date: string, sequence: number, rates: Rate[]): RateList {
  if (rates.length === 0) fail("ParseError", "Rate list contains no rates");
  const seen = new Set<string>();
  for (const r of rates) {
    if (seen.has(r.code)) fail("ParseError", `Duplicate currency ${r.code}`);
    seen.add(r.code);
  }
  return Object.freeze({ date, sequence, rates: Object.freeze(rates.map((r) => Object.freeze(r))) });
}

/**
 * Parses the ČNB daily TXT format (Czech `denni_kurz.txt` or English
 * `daily.txt`). Only the main fixing block is read; anything after the first
 * blank line (e.g. the 1999-2001 "calculated rates" section) is ignored.
 */
export function parseTxt(text: string): RateList {
  if (typeof text !== "string") fail("ParseError", "Input must be a string");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  if (i >= lines.length) fail("ParseError", "Empty input");
  const { date, sequence } = parseHeaderDate(lines[i++]!);

  const cols = (lines[i++] ?? "").split("|").map((c) => c.trim().toLowerCase());
  const okHeader = (h: string[]) => h.length === cols.length && h.every((c, k) => c === cols[k]);
  if (!okHeader(HEADER_CS) && !okHeader(HEADER_EN)) {
    fail("ParseError", `Unexpected column header: ${JSON.stringify(lines[i - 1] ?? "")}`);
  }

  const rates: Rate[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") break;
    const f = line.split("|");
    if (f.length !== 5) fail("ParseError", `Line ${i + 1}: expected 5 columns, got ${f.length}`);
    rates.push(makeRate(f[0]!, f[1]!, f[2]!.trim(), f[3]!, f[4]!, `Line ${i + 1}`));
  }
  return finish(date, sequence, rates);
}

/** Non-throwing variant of {@link parseTxt}. */
export function tryParseTxt(text: string): Result<RateList> {
  return attempt(() => parseTxt(text));
}

/**
 * Parses a response of the ČNB JSON API
 * (`https://api.cnb.cz/cnbapi/exrates/daily`), given as a string or an
 * already-parsed object.
 */
export function parseJson(input: unknown): RateList {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch (cause) {
      return fail("ParseError", "Invalid JSON", { cause });
    }
  }
  const list = (data as { rates?: unknown } | null)?.rates;
  if (!Array.isArray(list)) fail("ParseError", "JSON has no 'rates' array");
  let date: string | undefined;
  let sequence: number | undefined;
  const rates = list.map((item: unknown, k) => {
    const r = item as Record<string, unknown>;
    const where = `rates[${k}]`;
    if (r === null || typeof r !== "object") fail("ParseError", `${where} is not an object`);
    const { validFor, order, country, currency, amount, currencyCode, rate } = r;
    if (typeof validFor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(validFor)) {
      fail("ParseError", `${where}.validFor is invalid`);
    }
    if (typeof order !== "number" || !Number.isInteger(order)) fail("ParseError", `${where}.order is invalid`);
    if (date !== undefined && (validFor !== date || order !== sequence)) {
      fail("ParseError", `${where} belongs to a different list`);
    }
    date = validFor;
    sequence = order;
    if (typeof rate !== "number" || !Number.isFinite(rate)) fail("ParseError", `${where}.rate is invalid`);
    // JSON numbers with <= 3 decimals round-trip exactly through String().
    return makeRate(String(country ?? ""), String(currency ?? ""), String(amount), String(currencyCode ?? ""), String(rate), where);
  });
  if (date === undefined || sequence === undefined) return fail("ParseError", "Rate list contains no rates");
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (!isRealDate(y, m, d)) fail("ParseError", `Invalid validFor date ${date}`);
  return finish(date, sequence, rates);
}

/** Non-throwing variant of {@link parseJson}. */
export function tryParseJson(input: unknown): Result<RateList> {
  return attempt(() => parseJson(input));
}
