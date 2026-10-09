import { fail, type ErrorCode } from "./errors.js";

/**
 * Rounding modes for {@link convert}.
 *
 * - `"half-up"`: ties round away from zero (1.005 → 1.01, -1.005 → -1.01).
 *   The usual "commercial" rounding.
 * - `"half-even"`: ties round to the nearest even digit (banker's rounding;
 *   1.005 → 1.00, 1.015 → 1.02).
 * - `"trunc"`: drop extra digits (round toward zero).
 */
export type RoundingMode = "half-up" | "half-even" | "trunc";

/** An exact decimal: `units / 10^scale`. @internal */
export interface Decimal {
  readonly units: bigint;
  readonly scale: number;
}

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** @internal Parses a decimal string (`.` separator, optional exponent). */
export function parseDecimal(input: string, code: ErrorCode, what: string): Decimal {
  const m = DECIMAL_RE.exec(input.trim());
  if (!m) return fail(code, `${what} is not a valid decimal number: ${JSON.stringify(input)}`);
  const [, sign, int = "", frac = "", exp = "0"] = m;
  let units = BigInt(int + frac);
  let scale = frac.length - Number(exp);
  if (scale < 0) {
    units *= 10n ** BigInt(-scale);
    scale = 0;
  }
  if (scale > 1000) return fail(code, `${what} has too many decimal places`);
  return { units: sign === "-" ? -units : units, scale };
}

/** @internal Formats a decimal as a plain string, trimming trailing zeros. */
export function formatDecimal(d: Decimal): string {
  const neg = d.units < 0n;
  let digits = (neg ? -d.units : d.units).toString();
  if (d.scale === 0) return (neg ? "-" : "") + digits;
  digits = digits.padStart(d.scale + 1, "0");
  let int = digits.slice(0, -d.scale);
  let frac = digits.slice(-d.scale).replace(/0+$/, "");
  if (int === "") int = "0";
  return (neg ? "-" : "") + int + (frac ? "." + frac : "");
}

/** @internal Rounds `num / den` to `decimals` places and formats it. */
export function roundRatio(num: bigint, den: bigint, decimals: number, mode: RoundingMode): string {
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const scaled = num * 10n ** BigInt(decimals);
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  let q = abs / den;
  const r2 = (abs % den) * 2n;
  if (mode === "half-up" ? r2 >= den : mode === "half-even" ? r2 > den || (r2 === den && q % 2n === 1n) : false) {
    if (r2 !== 0n) q += 1n;
  }
  let digits = q.toString();
  const isZero = q === 0n;
  if (decimals > 0) {
    digits = digits.padStart(decimals + 1, "0");
    digits = digits.slice(0, -decimals) + "." + digits.slice(-decimals);
  }
  return (neg && !isZero ? "-" : "") + digits;
}
