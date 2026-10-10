// Preloaded by scripts/check-readme.mjs: replaces global fetch with recorded
// CNB responses (test/fixtures) so README examples run offline and
// deterministically. Mirrors the date resolution observed live on 2026-10-09
// (see test/fixtures/README.md).
import { readFileSync } from "node:fs";

const fixture = (name) => readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), "utf8");

const BY_DATE = {
  "2026-10-02": "2026-10-02",
  "2026-10-03": "2026-10-02",
  "2026-10-04": "2026-10-02",
  "2026-09-25": "2026-09-25",
  "2026-09-28": "2026-09-25",
};

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const raw = url.searchParams.get("date") ?? "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : raw;
  const list = BY_DATE[iso] ?? "2026-10-09";
  const lang = url.pathname.startsWith("/en/") && list === "2026-10-09" ? "en" : "cs";
  if (url.hostname !== "www.cnb.cz") return new Response("not recorded", { status: 404 });
  return new Response(fixture(`${lang}-${list}.txt`), { status: 200, headers: { "content-type": "text/plain" } });
};
