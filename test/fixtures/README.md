# Fixtures

Real responses downloaded from the Czech National Bank on 2026-10-09
(Source: the CNB). Files are stored byte-for-byte as received.

| File | URL |
| --- | --- |
| `cs-2026-10-09.txt` | https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt?date=09.10.2026 |
| `en-2026-10-09.txt` | https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt?date=09.10.2026 |
| `api-2026-10-09.json` | https://api.cnb.cz/cnbapi/exrates/daily?date=2026-10-09&lang=EN |
| `cs-2026-10-02.txt` | `denni_kurz.txt?date=02.10.2026` (Friday; also returned for 03.10. and 04.10.) |
| `cs-2026-09-25.txt` | `denni_kurz.txt?date=25.09.2026` (Friday; also returned for Monday 28.09., a public holiday) |
| `cs-2025-12-31.txt` | `denni_kurz.txt?date=31.12.2025` (also returned for 01.01.2026) |
| `cs-2000-01-03.txt` | `denni_kurz.txt?date=03.01.2000` (historical list, first of the year) |

Observed date resolution (live, 2026-10-09), used by the mocked-fetch tests:

| Requested | Returned list |
| --- | --- |
| 03.10.2026 (Sat), 04.10.2026 (Sun) | 02.10.2026 #190 |
| 28.09.2026 (Mon, St. Wenceslas Day) | 25.09.2026 #186 |
| 01.01.2026 (New Year's Day) | 31.12.2025 #251 |
| 24.12.2025 (Christmas Eve) | 23.12.2025 #248 |
| 10.10.2026, 15.10.2026 (future) | 09.10.2026 #195 (latest) |
| 31.02.2026 (invalid) | 03.03.2026 #43 (silently rolled over, hence client-side validation) |
