// Runtime smoke test of the built package (CJS entry). See smoke.mjs.
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { convert, parseTxt, tryConvert, CnbRatesError } = require("cnb-rates");

const list = parseTxt(readFileSync(path.join(__dirname, "../test/fixtures/cs-2026-10-09.txt"), "utf8"));
assert.equal(convert(1000, "CZK", "EUR", list), "41.04");
assert.equal(convert(1, "GBP", "JPY", list), "209.15");
const bad = tryConvert(1, "XYZ", "CZK", list);
assert.equal(bad.ok, false);
assert.ok(bad.error instanceof CnbRatesError);
assert.equal(bad.error.code, "UnknownCurrency");

console.log(`CJS smoke test passed on Node ${process.version}`);
