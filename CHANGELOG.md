# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-10

- Fetch the Czech National Bank daily exchange-rate fixing (TXT or JSON) with an injectable `fetch`.
- Exact decimal rates and currency conversion through CZK with configurable rounding.
- Correct Europe/Prague date resolution for weekends, holidays and publication time.
- Zero runtime dependencies; typed errors and non-throwing `try*` variants.

[Unreleased]: https://github.com/gildor853/cnb-rates/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gildor853/cnb-rates/releases/tag/v1.0.0
