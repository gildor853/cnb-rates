import { fail } from "./errors.js";
import { isRealDate } from "./parse.js";

/** A calendar date: `"YYYY-MM-DD"` or a `Date` (taken as its Prague calendar day). */
export type DateInput = string | Date;

/** First date with ČNB fixing data (data are available from 1991). */
export const FIRST_DATE = "1991-01-01";

let formatter: Intl.DateTimeFormat | undefined;

/**
 * The calendar date (`YYYY-MM-DD`) of `instant` in the Europe/Prague time zone,
 * using `Intl` (CET/CEST handled by the runtime's time zone data).
 */
export function pragueDate(instant: Date = new Date()): string {
  const t = instant instanceof Date ? instant.getTime() : Number.NaN;
  if (!Number.isFinite(t)) fail("InvalidDate", "Invalid Date");
  formatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(instant)) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** @internal Validates and normalises a date input to `YYYY-MM-DD`. */
export function normalizeDate(input: DateInput, now: Date): string {
  let iso: string;
  if (input instanceof Date) {
    iso = pragueDate(input);
  } else if (typeof input === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
      fail("InvalidDate", `Expected a real date as YYYY-MM-DD, got ${JSON.stringify(input)}`);
    }
    iso = input;
  } else {
    return fail("InvalidDate", "Date must be a YYYY-MM-DD string or a Date");
  }
  if (iso < FIRST_DATE) fail("InvalidDate", `ČNB data start on ${FIRST_DATE}, got ${iso}`);
  const today = pragueDate(now);
  if (iso > today) fail("InvalidDate", `${iso} is in the future (today in Prague is ${today})`);
  return iso;
}
