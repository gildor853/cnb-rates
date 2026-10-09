import { describe, expect, it } from "vitest";
import { pragueDate } from "../src/index.js";
import { codeOf } from "./helpers.js";

describe("pragueDate (Europe/Prague calendar day)", () => {
  it.each([
    ["2026-10-09T21:59:59Z", "2026-10-09", "CEST: 23:59:59 Prague"],
    ["2026-10-09T22:00:00Z", "2026-10-10", "CEST: midnight Prague"],
    ["2026-01-01T22:59:59Z", "2026-01-01", "CET: 23:59:59 Prague"],
    ["2026-01-01T23:00:00Z", "2026-01-02", "CET: midnight Prague"],
    ["2025-12-31T23:00:00Z", "2026-01-01", "New Year in Prague, still 2025 in UTC"],
    ["2026-03-28T22:59:59Z", "2026-03-28", "night before DST starts (CET)"],
    ["2026-03-28T23:00:00Z", "2026-03-29", "DST start day, 00:00 CET"],
    ["2026-03-29T01:00:00Z", "2026-03-29", "03:00 CEST right after the switch"],
    ["2026-10-24T21:59:59Z", "2026-10-24", "night before DST ends (CEST)"],
    ["2026-10-24T22:00:00Z", "2026-10-25", "DST end day, 00:00 CEST"],
    ["2026-10-25T22:59:59Z", "2026-10-25", "after DST end, 23:59:59 CET"],
    ["2026-10-25T23:00:00Z", "2026-10-26", "00:00 CET"],
  ])("%s -> %s (%s)", (instant, expected) => {
    expect(pragueDate(new Date(instant))).toBe(expected);
  });

  it("rejects invalid dates", () => {
    expect(codeOf(() => pragueDate(new Date("nope")))).toBe("InvalidDate");
    expect(codeOf(() => pragueDate("2026-01-01" as never))).toBe("InvalidDate");
  });

  it("defaults to now", () => {
    expect(pragueDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
