// Runtime smoke test of the built package (ESM entry), run by CI on Node
// versions the test runner no longer supports. No dependencies, no network.
// The bare specifier resolves to ./dist through the package's "exports" map.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convert, getRate, getRates, parseTxt, pragueDate } from "cnb-rates";

const list = parseTxt(readFileSync(new URL("../test/fixtures/cs-2026-10-09.txt", import.meta.url), "utf8"));
assert.equal(list.date, "2026-10-09");
assert.equal(list.sequence, 195);
assert.equal(getRate("JPY", list).perUnit, "0.13744");
assert.equal(convert(100, "EUR", "CZK", list), "2436.50");
assert.equal(convert("0.1", "EUR", "CZK", list, { decimals: 3, rounding: "half-even" }), "2.436");
assert.equal(pragueDate(new Date("2026-10-09T22:00:00Z")), "2026-10-10");

const fetched = await getRates("2026-10-03", {
  now: () => new Date("2026-10-09T19:30:00Z"),
  fetch: async () => ({ ok: true, status: 200, text: async () => readFileSync(new URL("../test/fixtures/cs-2026-10-02.txt", import.meta.url), "utf8") }),
});
assert.equal(fetched.date, "2026-10-02");

console.log(`ESM smoke test passed on Node ${process.version}`);
