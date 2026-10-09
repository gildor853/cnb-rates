# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-09

### Added

- `getRates` / `createCnbClient` fetching the ČNB daily fixing from the
  official TXT files (Czech or English) or the ČNB JSON API, with injectable
  `fetch`, abort signal support and an optional in-memory cache.
- Date handling in Europe/Prague via `Intl` (`pragueDate`), strict date
  validation, and exposure of the publication date and sequence number.
- `parseTxt` / `parseJson` with exact decimal rates and per-unit rates for
  multiplier currencies (JPY, HUF, IDR, ...).
- `convert` via CZK using exact rational arithmetic with configurable decimals
  and rounding (`half-up`, `half-even`, `trunc`); `getRate`, `listCurrencies`.
- Typed errors (`CnbRatesError` with a `code` and HTTP `status`) and
  non-throwing `try*` variants.
- Tests on real ČNB responses committed as fixtures.

[Unreleased]: https://github.com/gildor853/cnb-rates/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gildor853/cnb-rates/releases/tag/v0.1.0
