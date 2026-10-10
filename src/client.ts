import { CnbRatesError, attemptAsync, fail, show, type Result } from "./errors.js";
import { normalizeDate, pragueDate, type DateInput } from "./date.js";
import { parseJson, parseTxt, type RateList } from "./parse.js";

/**
 * Official ČNB daily fixing endpoints.
 *
 * TXT format documented at
 * https://www.cnb.cz/en/faq/Format-of-the-foreign-exchange-market-rates/
 * JSON API documented at https://api.cnb.cz/cnbapi/swagger-ui.html
 */
export const CNB_ENDPOINTS = {
  txtCs:
    "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt",
  txtEn:
    "https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt",
  json: "https://api.cnb.cz/cnbapi/exrates/daily",
} as const;

/** Minimal `fetch` signature this library needs (compatible with global `fetch`). */
export type FetchLike = (
  url: string,
  // `any` keeps the global `fetch` (whose init is `RequestInit`) assignable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init?: { signal?: any },
) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

/** Cache store. A `Map<string, RateList>` works. */
export interface RatesCache {
  get(key: string): RateList | undefined;
  set(key: string, value: RateList): unknown;
}

/** Options for {@link createCnbClient} and {@link getRates}. */
export interface ClientOptions {
  /** Custom fetch (e.g. a proxy wrapper in browsers). Defaults to global `fetch`. */
  readonly fetch?: FetchLike;
  /** `"txt"` (default, the classic documented TXT file) or `"json"` (api.cnb.cz). */
  readonly source?: "txt" | "json";
  /** Language of country/currency names: `"cs"` (default) or `"en"`. Rates are identical. */
  readonly lang?: "cs" | "en";
  /**
   * Cache store, or `false` to disable. {@link createCnbClient} defaults to a
   * private in-memory `Map`; the one-shot {@link getRates} defaults to no cache.
   */
  readonly cache?: RatesCache | false;
  /** Clock used to determine "today" in Prague. Defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

/** Per-call options. */
export interface RequestOptions {
  /** An `AbortSignal` passed to fetch. */
  readonly signal?: unknown;
}

/** A rate list together with the request it answers. */
export interface FetchedRateList extends RateList {
  /** The date you asked for (`YYYY-MM-DD`, Prague calendar). */
  readonly requestedDate: string;
  /** Where the data came from. */
  readonly source: "txt" | "json";
  /** The URL fetched (or that would have been fetched, for cache hits). */
  readonly url: string;
  /** `true` when served from the cache. */
  readonly cached: boolean;
}

/** A client with its own options and cache. */
export interface CnbClient {
  /**
   * Returns the rate list valid for `date` (default: today in Prague).
   * See {@link getRates}.
   */
  getRates(date?: DateInput, options?: RequestOptions): Promise<FetchedRateList>;
  /** Non-throwing variant of {@link CnbClient.getRates}. */
  tryGetRates(date?: DateInput, options?: RequestOptions): Promise<Result<FetchedRateList>>;
}

function buildUrl(source: "txt" | "json", lang: "cs" | "en", iso: string): string {
  const [y, m, d] = iso.split("-");
  if (source === "json") return `${CNB_ENDPOINTS.json}?date=${iso}&lang=${lang === "en" ? "EN" : "CZ"}`;
  return `${lang === "en" ? CNB_ENDPOINTS.txtEn : CNB_ENDPOINTS.txtCs}?date=${d}.${m}.${y}`;
}

/**
 * Creates a client. Results are cached in memory by default: lists are stored
 * by publication date (they never change once published), and a requested
 * date is remembered only once it lies in the past, because "today" may still
 * switch to a new list after the ~14:30 publication.
 */
export function createCnbClient(options: ClientOptions = {}): CnbClient {
  const source = options?.source ?? "txt";
  const lang = options?.lang ?? "cs";
  if (source !== "txt" && source !== "json") fail("FetchError", `Unknown source ${show(source)}`);
  if (lang !== "cs" && lang !== "en") fail("FetchError", `Unknown lang ${show(lang)}`);
  const cache: RatesCache | undefined = options?.cache === false ? undefined : (options?.cache ?? new Map());
  const now = options?.now ?? (() => new Date());
  const prefix = `${source}:${lang}:`;

  async function getRates(date?: DateInput, req: RequestOptions = {}): Promise<FetchedRateList> {
    const current = now();
    const iso = normalizeDate(date ?? current, current);
    const url = buildUrl(source, lang, iso);
    const wrap = (list: RateList, cached: boolean): FetchedRateList =>
      Object.freeze({ ...list, requestedDate: iso, source, url, cached });

    if (cache) {
      const hit = cache.get(`${prefix}req:${iso}`) ?? cache.get(`${prefix}list:${iso}`);
      if (hit) return wrap(hit, true);
    }

    const fetchFn = options?.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (typeof fetchFn !== "function") fail("FetchError", "No fetch implementation available; pass options.fetch");

    let body: string;
    try {
      const res = await fetchFn(url, req?.signal === undefined ? undefined : { signal: req?.signal });
      if (!res.ok) fail("FetchError", `ČNB responded with HTTP ${res.status}`, { status: res.status });
      body = await res.text();
    } catch (cause) {
      if (cause instanceof CnbRatesError) throw cause;
      return fail("FetchError", `Request to ČNB failed: ${String((cause as Error)?.message ?? cause)}`, { cause });
    }

    const list = source === "json" ? parseJson(body) : parseTxt(body);
    if (list.date > iso) {
      fail("ParseError", `ČNB returned the list of ${list.date} for ${iso}; expected the last list on or before it`);
    }
    if (cache) {
      cache.set(`${prefix}list:${list.date}`, list);
      if (iso < pragueDate(current)) cache.set(`${prefix}req:${iso}`, list);
    }
    return wrap(list, false);
  }

  return {
    getRates,
    tryGetRates: (date, req) => attemptAsync(() => getRates(date, req)),
  };
}

/**
 * Fetches the ČNB rate list valid for `date` (a `YYYY-MM-DD` string or a
 * `Date`, interpreted in Europe/Prague; default: today in Prague).
 *
 * ČNB declares rates on working days at about 14:30 Prague time. A list is
 * valid for its own day and for the following weekend days and public
 * holidays. ČNB's endpoints already return "the last list declared on or
 * before the requested date", so on a Saturday you get Friday's list and,
 * before 14:30 on a working day, the previous working day's list. Check
 * `date` / `sequence` on the result to see which list you received.
 *
 * Future dates throw `InvalidDate`. No cache unless `options.cache` is given.
 */
export async function getRates(
  date?: DateInput,
  options: ClientOptions & RequestOptions = {},
): Promise<FetchedRateList> {
  return createCnbClient({ cache: false, ...options }).getRates(date, options);
}

/** Non-throwing variant of {@link getRates}. */
export function tryGetRates(
  date?: DateInput,
  options: ClientOptions & RequestOptions = {},
): Promise<Result<FetchedRateList>> {
  return attemptAsync(() => getRates(date, options));
}
