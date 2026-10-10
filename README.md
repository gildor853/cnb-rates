# cnb-rates

[![CI](https://github.com/gildor853/cnb-rates/actions/workflows/ci.yml/badge.svg)](https://github.com/gildor853/cnb-rates/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

Provided as is, without warranty — see [DISCLAIMER.md](./DISCLAIMER.md).

Zero-dependency TypeScript client for the **Czech National Bank (ČNB) daily
exchange rate fixing** (*kurzy devizového trhu*, the daily *kurzovní lístek*).
Exact decimal parsing, correct date resolution in Europe/Prague, and currency
conversion via CZK without floating-point errors.

> 🇨🇿 Knihovna pro stažení denního kurzovního lístku ČNB, přepočty měn přes CZK
> s přesnou desetinnou aritmetikou a správným určením platného kurzu pro daný
> den (víkendy, svátky, vyhlášení kolem 14:30).

## Why

- **Exact money math**: rates are kept as decimal strings and conversions use
  exact rational arithmetic with a single, explicit rounding step. No
  `0.1 * 24.365 = 2.4365000000000006`.
- **Multipliers handled**: JPY, HUF, PHP and others are quoted per 100 units,
  IDR per 1000; `perUnit` and `convert` take care of it.
- **The right list for a date**: weekends, public holidays and the ~14:30
  publication time are resolved the way ČNB does, and every result tells you
  which list (publication date and sequence number) it came from.
- **Prague time zone without dependencies**, using `Intl`.
- **Tiny and typed**: no runtime dependencies, typed errors, ESM + CJS.

## Install

Not published to npm yet. Install a tagged release from GitHub (npm builds
the package during installation):

```sh
npm install github:gildor853/cnb-rates#v1.0.0
```

Requires Node.js 18+ (global `fetch`). See [Browsers](#browsers) for web use.

The published package has no runtime dependencies and is verified on
Node.js 18 and 20 by a runtime smoke test in CI. Development (tests) needs
Node.js 22.12+, as required by vitest 5.

## Quick start

```ts
import { getRates, convert, getRate } from "cnb-rates";

const list = await getRates("2026-10-09");
list.date;     // "2026-10-09"  publication date of the list
list.sequence; // 195           "#195" in the header

getRate("EUR", list);  // { code: "EUR", amount: 1, rate: "24.365", perUnit: "24.365", ... }
getRate("JPY", list);  // { code: "JPY", amount: 100, rate: "13.744", perUnit: "0.13744", ... }

convert(100, "EUR", "CZK", list);       // "2436.50"
convert("1000", "CZK", "EUR", list);    // "41.04"
convert(100, "EUR", "USD", list);       // "112.05"   (cross rate via CZK)
convert(10_000, "JPY", "CZK", list);    // "1374.40"  (100 JPY = 13.744 CZK)

// Saturday: you get Friday's list
const sat = await getRates("2026-10-03");
sat.requestedDate; // "2026-10-03"
sat.date;          // "2026-10-02"

// Today in Prague (default)
await getRates();
```

For repeated lookups, create a client with a cache:

```ts
import { createCnbClient } from "cnb-rates";

const cnb = createCnbClient({ lang: "en" });
const a = await cnb.getRates("2026-09-28"); // fetched
const b = await cnb.getRates("2026-09-28"); // served from the cache
a.cached; // false
b.cached; // true
```

## API reference

### Fetching

| Function | Description |
| --- | --- |
| `getRates(date?, options?)` | Fetch the list valid for `date` (`"YYYY-MM-DD"` or a `Date`; default: today in Prague). No cache unless `options.cache` is set. |
| `tryGetRates(date?, options?)` | Same, resolving to a `Result` instead of rejecting. |
| `createCnbClient(options?)` | A client with `getRates` / `tryGetRates` and an in-memory cache by default. |
| `CNB_ENDPOINTS` | The endpoint URLs used (see [Data source](#data-source)). |
| `pragueDate(date?)` | Calendar date (`YYYY-MM-DD`) of an instant in Europe/Prague. |

Options (`ClientOptions`, plus `signal` per call):

| Option | Default | Description |
| --- | --- | --- |
| `fetch` | global `fetch` | Custom fetch implementation (proxy, retries, tests). |
| `source` | `"txt"` | `"txt"` (classic TXT file) or `"json"` (api.cnb.cz). |
| `lang` | `"cs"` | `"cs"` or `"en"` names for countries/currencies. Rates are identical. |
| `cache` | `Map` in clients, none in `getRates` | Any `{ get, set }` store (e.g. a `Map`), or `false`. |
| `now` | `() => new Date()` | Clock for "today", injectable for tests. |
| `signal` | | `AbortSignal` passed to fetch. |

The result (`FetchedRateList`) contains:

| Field | Description |
| --- | --- |
| `date` | Publication date of the list (`YYYY-MM-DD`). |
| `sequence` | Sequence number of the list within the year. |
| `rates` | `Rate[]` in published order. |
| `requestedDate` | The date you asked for. |
| `source`, `url`, `cached` | Where it came from. |

`Rate` = `{ country, currency, amount, code, rate, perUnit }`, where `rate` is
CZK per `amount` units and `perUnit` is CZK per 1 unit, both as exact decimal
strings with a `.` separator.

### Parsing

| Function | Description |
| --- | --- |
| `parseTxt(text)` | Parse the Czech (`09.10.2026 #195`, decimal commas) or English (`09 Oct 2026 #195`) TXT format. |
| `parseJson(jsonOrObject)` | Parse a response of the ČNB JSON API. |
| `tryParseTxt`, `tryParseJson` | Non-throwing variants. |

### Conversion

| Function | Description |
| --- | --- |
| `convert(amount, from, to, list, options?)` | Convert via CZK. `amount` is a decimal string (`"1234.56"`, at most 1000 characters), a number or a bigint. Returns a string with exactly `decimals` places. |
| `tryConvert(...)` | Non-throwing variant. |
| `getRate(code, list)` | The `Rate` for a code (case-insensitive). CZK is not in the list and throws `UnknownCurrency`. |
| `listCurrencies(list)` | Codes in published order (without CZK). |

## Rounding semantics

`convert` computes

```
result = amount × (rateFrom / amountFrom) ÷ (rateTo / amountTo)
```

as an exact fraction of big integers (CZK counts as rate 1 per 1 unit) and
rounds **once**, at the end, to `decimals` places (default `2`):

| `rounding` | Behaviour | `0.1 EUR → CZK` at 3 places (exact 2.4365) |
| --- | --- | --- |
| `"half-up"` (default) | Ties away from zero ("commercial" rounding) | `"2.437"` |
| `"half-even"` | Ties to the even digit (banker's rounding) | `"2.436"` |
| `"trunc"` | Toward zero | `"2.436"` |

Negative amounts are rounded symmetrically (`-0.1 EUR → "-2.437"` with half-up).
Results are strings so no precision is lost; call `Number()` yourself if you
need a number for display.

Numbers passed as `amount` go through `String(n)`, so `0.1` means exactly
`0.1`. Strings must be plain decimals with a `.` separator (`"1234.56"`, no
thousands separators or decimal commas).

## Data source

- **TXT (default)**, documented in the ČNB FAQ
  [Format of the foreign exchange market rates](https://www.cnb.cz/en/faq/Format-of-the-foreign-exchange-market-rates/):
  - Czech: `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt?date=DD.MM.YYYY`
  - English: `https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt?date=DD.MM.YYYY`
- **JSON**: the ČNB API `https://api.cnb.cz/cnbapi/exrates/daily?date=YYYY-MM-DD&lang=EN|CZ`
  ([Swagger UI](https://api.cnb.cz/cnbapi/swagger-ui.html)). It returns the same
  data; rates arrive as JSON numbers with at most three decimals, which convert
  to exact decimal strings.

The TXT format is the default because it is the long-standing, documented
format and carries rates as decimal text.

**Which list is valid for a date.** Per ČNB, rates are "declared every working
day at around 2.30 p.m. and are valid for the current working day and, where
relevant, the following Saturday, Sunday or public holiday"
([Central bank exchange rate fixing](https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/)).
Both endpoints return the last list declared on or before the requested date
(verified: 03.10.2026 → 02.10.2026 #190; 28.09.2026 → 25.09.2026 #186;
01.01.2026 → 31.12.2025 #251). Before ~14:30 on a working day, the previous
working day's list is returned for "today"; check `date` on the result.

This library validates dates itself because the TXT endpoint silently rolls
over invalid dates (`31.02.2026` returns the list of `03.03.2026`) and ignores
malformed ones. Future dates (after today in Prague) throw `InvalidDate`.

**Terms.** The rates are informative. Per the ČNB
[terms of use of its website](https://www.cnb.cz/en/privacy-statement-and-disclaimer/disclaimer-copyright/),
ČNB gives no warranty for the accuracy, correctness or completeness of the
information, asks users to verify it (especially for commercial purposes), and
requires the source to be stated ("Source: the CNB"). The FAQ also warns that
unwarranted and excessive access will be limited: lists change once a day, so
cache them (`createCnbClient`) rather than polling.

**Browsers.** At the time of writing, the ČNB endpoints do not send CORS
headers for third-party origins, so direct requests from web pages are blocked.
Use a server-side proxy and pass a `fetch` that rewrites the URL.

## Error handling

All throwing functions throw `CnbRatesError` with a `code`:

| Code | Meaning |
| --- | --- |
| `UnknownCurrency` | Currency not in the list (or `getRate("CZK")`). |
| `ParseError` | Malformed TXT/JSON, the response does not match the request, or the value passed as a rate list is not one. |
| `FetchError` | Network failure (`status` undefined) or HTTP error (`status` set); also invalid client options or no `fetch` available. |
| `InvalidDate` | Not a real `YYYY-MM-DD` date / valid `Date`, before 1991-01-01, or in the future. |
| `InvalidAmount` | Amount is not a plain decimal / finite number, an amount string over 1000 characters, or invalid `decimals` / `rounding`. |

```ts
import { getRates, tryConvert, isCnbRatesError } from "cnb-rates";

try {
  await getRates("2026-02-31");
} catch (err) {
  if (isCnbRatesError(err)) console.log(err.code, err.status);
}

const list = await getRates("2026-10-09");
const r = tryConvert("12.50", "EUR", "XYZ", list);
if (!r.ok) console.log(r.error.code); // "UnknownCurrency"
```

Convention: `x()` throws, `tryX()` returns `{ ok: true, value } | { ok: false, error }`.

## Limitations and assumptions

- Only the **daily fixing** of commonly traded currencies is supported, not
  the monthly "other currencies" rates (*kurzy ostatních měn*) or yearly files.
- Historical TXT lists of 1999–2001 contain an extra "calculated rates" block
  after a blank line; it is ignored.
- Results depend on ČNB's endpoints and formats; if ČNB changes them, the
  library needs an update.
- "Today" is determined from your system clock and the runtime's time zone
  data for Europe/Prague.

## Disclaimer

**Use at your own risk.** This software is provided as is, without warranty of any kind. It is not an official ČNB service and not financial, tax or accounting advice. Verify rates against the official ČNB publication. See the full legal text in [DISCLAIMER.md](./DISCLAIMER.md).

## Contributing

This repository is maintained by a single author and does not accept external
contributions; issues and pull requests are limited to collaborators.

Security problems can be reported privately, see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © 2026 Gildor
