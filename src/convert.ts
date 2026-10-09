import { attempt, fail, type Result } from "./errors.js";
import { parseDecimal, roundRatio, type Decimal, type RoundingMode } from "./decimal.js";
import type { Rate, RateList } from "./parse.js";

/** An amount: a decimal string (`"1234.56"`), a finite number or a bigint. */
export type AmountInput = string | number | bigint;

/** Options for {@link convert}. */
export interface ConvertOptions {
  /** Decimal places of the result. Default `2`. */
  readonly decimals?: number;
  /** Rounding mode applied once, at the end. Default `"half-up"`. */
  readonly rounding?: RoundingMode;
}

function normCode(code: string): string {
  if (typeof code !== "string") return fail("UnknownCurrency", `Invalid currency code: ${String(code)}`);
  return code.trim().toUpperCase();
}

/**
 * Returns the rate for `code` (case-insensitive). CZK is not part of the list
 * and throws `UnknownCurrency`; {@link convert} handles CZK itself.
 */
export function getRate(code: string, rates: RateList): Rate {
  const c = normCode(code);
  const found = rates.rates.find((r) => r.code === c);
  if (!found) return fail("UnknownCurrency", `Currency ${c} is not in the ČNB list of ${rates.date}`);
  return found;
}

/** Currency codes in the list, in published order (CZK not included). */
export function listCurrencies(rates: RateList): string[] {
  return rates.rates.map((r) => r.code);
}

function toDecimal(amount: AmountInput): Decimal {
  if (typeof amount === "bigint") return { units: amount, scale: 0 };
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) fail("InvalidAmount", `Amount must be finite, got ${amount}`);
    return parseDecimal(String(amount), "InvalidAmount", "Amount");
  }
  if (typeof amount !== "string") return fail("InvalidAmount", "Amount must be a string, number or bigint");
  if (!/^[+-]?\d+(\.\d+)?$/.test(amount.trim())) {
    fail("InvalidAmount", `Amount must be a plain decimal like "1234.56", got ${JSON.stringify(amount)}`);
  }
  return parseDecimal(amount, "InvalidAmount", "Amount");
}

/** CZK per `amount` units as exact (units, scale, amount). */
function czkPer(code: string, rates: RateList): { rate: Decimal; amount: bigint } {
  if (code === "CZK") return { rate: { units: 1n, scale: 0 }, amount: 1n };
  const r = getRate(code, rates);
  return { rate: parseDecimal(r.rate, "ParseError", "Rate"), amount: BigInt(r.amount) };
}

/**
 * Converts `amount` from one currency to another through CZK, using exact
 * rational arithmetic, rounding once at the end.
 *
 * result = amount × (rateFrom / amountFrom) ÷ (rateTo / amountTo)
 *
 * @returns the result as a decimal string with exactly `decimals` places.
 * @example convert("100", "EUR", "CZK", list) // "2436.50"
 */
export function convert(
  amount: AmountInput,
  from: string,
  to: string,
  rates: RateList,
  options: ConvertOptions = {},
): string {
  const decimals = options.decimals ?? 2;
  const rounding = options.rounding ?? "half-up";
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
    fail("InvalidAmount", `decimals must be an integer between 0 and 20, got ${decimals}`);
  }
  if (rounding !== "half-up" && rounding !== "half-even" && rounding !== "trunc") {
    fail("InvalidAmount", `Unknown rounding mode ${String(rounding)}`);
  }
  const x = toDecimal(amount);
  const f = czkPer(normCode(from), rates);
  const t = czkPer(normCode(to), rates);
  const p10 = (n: number) => 10n ** BigInt(n);
  const num = x.units * f.rate.units * t.amount * p10(t.rate.scale);
  const den = p10(x.scale) * p10(f.rate.scale) * f.amount * t.rate.units;
  return roundRatio(num, den, decimals, rounding);
}

/** Non-throwing variant of {@link convert}. */
export function tryConvert(
  amount: AmountInput,
  from: string,
  to: string,
  rates: RateList,
  options: ConvertOptions = {},
): Result<string> {
  return attempt(() => convert(amount, from, to, rates, options));
}
