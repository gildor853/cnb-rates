import { describe, expect, it, vi } from "vitest";
import { CNB_ENDPOINTS, convert, createCnbClient, getRates, tryGetRates, type FetchLike } from "../src/index.js";
import { asyncCodeOf, fixture } from "./helpers.js";

// Mocked ČNB: maps the requested DD.MM.YYYY to the fixture ČNB actually
// returned for it (observed live on 2026-10-09; see test/fixtures/README.md).
const OBSERVED: Record<string, string> = {
  "09.10.2026": "cs-2026-10-09.txt",
  "10.10.2026": "cs-2026-10-09.txt",
  "02.10.2026": "cs-2026-10-02.txt",
  "03.10.2026": "cs-2026-10-02.txt",
  "04.10.2026": "cs-2026-10-02.txt",
  "25.09.2026": "cs-2026-09-25.txt",
  "28.09.2026": "cs-2026-09-25.txt",
  "31.12.2025": "cs-2025-12-31.txt",
  "01.01.2026": "cs-2025-12-31.txt",
};

function mockFetch(): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.origin + u.pathname === CNB_ENDPOINTS.json) {
      return { ok: true, status: 200, text: async () => fixture("api-2026-10-09.json") };
    }
    const date = u.searchParams.get("date")!;
    const file = OBSERVED[date];
    if (!file) return { ok: false, status: 404, text: async () => "" };
    const name = u.pathname.endsWith("daily.txt") ? file.replace("cs-", "en-") : file;
    return { ok: true, status: 200, text: async () => fixture(name) };
  });
}

// Friday 2026-10-09, 21:30 Prague (CEST = UTC+2), after the 14:30 publication.
const FRI_EVENING = () => new Date("2026-10-09T19:30:00Z");
// Saturday 2026-10-10, 10:00 Prague.
const SAT_MORNING = () => new Date("2026-10-10T08:00:00Z");

describe("date resolution (mocked fetch)", () => {
  it.each([
    ["2026-10-03", "2026-10-02", 190, "Saturday -> Friday's list"],
    ["2026-10-04", "2026-10-02", 190, "Sunday -> Friday's list"],
    ["2026-09-28", "2026-09-25", 186, "St. Wenceslas Day (Mon) -> previous Friday"],
    ["2026-01-01", "2025-12-31", 251, "New Year's Day -> 31 Dec"],
    ["2026-10-09", "2026-10-09", 195, "working day -> same day"],
  ])("%s -> %s #%i (%s)", async (requested, published, sequence) => {
    const fetch = mockFetch();
    const list = await getRates(requested, { fetch, now: FRI_EVENING });
    expect(list.requestedDate).toBe(requested);
    expect(list.date).toBe(published);
    expect(list.sequence).toBe(sequence);
    expect(list.cached).toBe(false);
    const [y, m, d] = requested.split("-");
    expect(fetch).toHaveBeenCalledWith(`${CNB_ENDPOINTS.txtCs}?date=${d}.${m}.${y}`, undefined);
  });

  it("defaults to today in Prague", async () => {
    const fetch = mockFetch();
    const list = await getRates(undefined, { fetch, now: SAT_MORNING });
    expect(list.requestedDate).toBe("2026-10-10");
    expect(list.date).toBe("2026-10-09");
  });

  it("interprets Date inputs in Europe/Prague", async () => {
    const fetch = mockFetch();
    // 2026-10-09T23:30Z is already Saturday 01:30 in Prague.
    const list = await getRates(new Date("2026-10-09T23:30:00Z"), { fetch, now: SAT_MORNING });
    expect(list.requestedDate).toBe("2026-10-10");
  });

  it("rejects future dates (relative to Prague today)", async () => {
    const fetch = mockFetch();
    const err = await asyncCodeOf(() => getRates("2026-10-10", { fetch, now: FRI_EVENING }));
    expect(err?.code).toBe("InvalidDate");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid and too-early dates without fetching", async () => {
    const fetch = mockFetch();
    for (const d of ["2026-02-31", "09.10.2026", "2026-1-1", "", "1990-12-31", new Date("nope"), 5 as never]) {
      const err = await asyncCodeOf(() => getRates(d, { fetch, now: FRI_EVENING }));
      expect(err?.code).toBe("InvalidDate");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a list newer than the requested date", async () => {
    const fetch: FetchLike = async () => ({ ok: true, status: 200, text: async () => fixture("cs-2026-10-09.txt") });
    const err = await asyncCodeOf(() => getRates("2026-10-02", { fetch, now: FRI_EVENING }));
    expect(err?.code).toBe("ParseError");
  });
});

describe("sources and languages", () => {
  it("English TXT", async () => {
    const fetch = mockFetch();
    const list = await getRates("2026-10-09", { fetch, lang: "en", now: FRI_EVENING });
    expect(list.url).toBe(`${CNB_ENDPOINTS.txtEn}?date=09.10.2026`);
    expect(list.rates.find((r) => r.code === "USD")?.currency).toBe("dollar");
  });

  it("JSON API", async () => {
    const fetch = mockFetch();
    const list = await getRates("2026-10-09", { fetch, source: "json", lang: "en", now: FRI_EVENING });
    expect(list.url).toBe(`${CNB_ENDPOINTS.json}?date=2026-10-09&lang=EN`);
    expect(list.source).toBe("json");
    expect(convert(100, "EUR", "CZK", list)).toBe("2436.50");
    const cz = await getRates("2026-10-09", { fetch, source: "json", now: FRI_EVENING });
    expect(cz.url).toBe(`${CNB_ENDPOINTS.json}?date=2026-10-09&lang=CZ`);
  });

  it("passes the abort signal through", async () => {
    const fetch = mockFetch();
    const signal = new AbortController().signal;
    await getRates("2026-10-09", { fetch, now: FRI_EVENING, signal });
    expect(fetch).toHaveBeenCalledWith(expect.any(String), { signal });
  });

  it("uses global fetch by default", async () => {
    const fetch = mockFetch();
    vi.stubGlobal("fetch", fetch);
    try {
      expect((await getRates("2026-10-09", { now: FRI_EVENING })).sequence).toBe(195);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("cache", () => {
  it("caches past requests and lists by publication date", async () => {
    const fetch = mockFetch();
    const client = createCnbClient({ fetch, now: FRI_EVENING });
    const a = await client.getRates("2026-10-03");
    const b = await client.getRates("2026-10-03");
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(b.date).toBe("2026-10-02");
    // The Friday list was stored under its publication date.
    const c = await client.getRates("2026-10-02");
    expect(c.cached).toBe(true);
    expect(c.requestedDate).toBe("2026-10-02");
    // A different weekend day still needs one request to learn its mapping.
    await client.getRates("2026-10-04");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not remember today's request mapping (a new list may appear at 14:30)", async () => {
    const fetch = mockFetch();
    const client = createCnbClient({ fetch, now: SAT_MORNING });
    await client.getRates(); // Saturday -> Friday's list
    await client.getRates();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("serves today from cache once today's list is known", async () => {
    const fetch = mockFetch();
    const client = createCnbClient({ fetch, now: FRI_EVENING });
    await client.getRates();
    expect((await client.getRates()).cached).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("can be disabled or injected", async () => {
    const fetch = mockFetch();
    const off = createCnbClient({ fetch, now: FRI_EVENING, cache: false });
    await off.getRates("2026-10-03");
    await off.getRates("2026-10-03");
    expect(fetch).toHaveBeenCalledTimes(2);

    const store = new Map();
    const shared1 = createCnbClient({ fetch, now: FRI_EVENING, cache: store });
    const shared2 = createCnbClient({ fetch, now: FRI_EVENING, cache: store });
    await shared1.getRates("2026-09-28");
    expect((await shared2.getRates("2026-09-28")).cached).toBe(true);
    expect([...store.keys()]).toEqual(["txt:cs:list:2026-09-25", "txt:cs:req:2026-09-28"]);
  });

  it("keeps languages/sources apart", async () => {
    const fetch = mockFetch();
    const store = new Map();
    await createCnbClient({ fetch, now: FRI_EVENING, cache: store }).getRates("2026-10-09");
    const en = await createCnbClient({ fetch, now: FRI_EVENING, cache: store, lang: "en" }).getRates("2026-10-09");
    expect(en.cached).toBe(false);
  });

  it("one-shot getRates does not cache by default", async () => {
    const fetch = mockFetch();
    await getRates("2026-10-03", { fetch, now: FRI_EVENING });
    await getRates("2026-10-03", { fetch, now: FRI_EVENING });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("fetch errors", () => {
  it("HTTP errors carry the status", async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 503, text: async () => "down" });
    const err = await asyncCodeOf(() => getRates("2026-10-09", { fetch, now: FRI_EVENING }));
    expect(err?.code).toBe("FetchError");
    expect(err?.status).toBe(503);
  });

  it("network failures have no status and keep the cause", async () => {
    const boom = new TypeError("fetch failed");
    const fetch: FetchLike = async () => {
      throw boom;
    };
    const err = await asyncCodeOf(() => getRates("2026-10-09", { fetch, now: FRI_EVENING }));
    expect(err?.code).toBe("FetchError");
    expect(err?.status).toBeUndefined();
    expect((err as { cause?: unknown }).cause).toBe(boom);
  });

  it("garbage bodies are ParseErrors", async () => {
    const fetch: FetchLike = async () => ({ ok: true, status: 200, text: async () => "<html>maintenance</html>" });
    expect((await asyncCodeOf(() => getRates("2026-10-09", { fetch, now: FRI_EVENING })))?.code).toBe("ParseError");
  });

  it("missing fetch implementation", async () => {
    vi.stubGlobal("fetch", undefined);
    try {
      expect((await asyncCodeOf(() => getRates("2026-10-09", { now: FRI_EVENING })))?.code).toBe("FetchError");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("invalid client options", async () => {
    expect((await asyncCodeOf(() => getRates("2026-10-09", { source: "xml" as never })))?.code).toBe("FetchError");
    expect((await asyncCodeOf(() => getRates("2026-10-09", { lang: "de" as never })))?.code).toBe("FetchError");
  });

  it("tryGetRates never throws", async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 500, text: async () => "" });
    const r = await tryGetRates("2026-10-09", { fetch, now: FRI_EVENING });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.status).toBe(500);
    const ok = await createCnbClient({ fetch: mockFetch(), now: FRI_EVENING }).tryGetRates("2026-10-09");
    expect(ok.ok && ok.value.sequence).toBe(195);
  });
});
