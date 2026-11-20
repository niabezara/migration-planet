/* Phase 4: a full discovery run against the real SQL functions (PGlite) with mocked sources. */
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { isDue, runDiscovery, intervalMs } from "../../supabase/functions/_shared/research/discover.ts";
import type { DiscoveryStore, Fetcher, ResearchSource } from "../../supabase/functions/_shared/research/types.ts";
import { createTestDb } from "../db/testDb.ts";

const noSleep = async () => {};
import { CROSSREF, NATURE_RSS, OPENALEX, SCIENCE_RSS } from "./fixtures.ts";

let db: PGlite;

/** The same operations the Edge Function performs, through the same SQL functions. */
function pgliteStore(pg: PGlite): DiscoveryStore {
  return {
    async startRun(trigger, retryOf) {
      return (await pg.query<{ id: string | null }>("select public.start_research_run($1, $2) as id", [trigger, retryOf ?? null])).rows[0].id;
    },
    async finishRun(runId, r) {
      await pg.query("select public.finish_research_run($1, $2, $3, $4, $5, $6)", [
        runId, r.status, r.sourcesChecked, r.publicationsDiscovered, JSON.stringify(r.errors), r.summary,
      ]);
    },
    async activeSources() {
      return (await pg.query<ResearchSource>("select *, check_frequency::text as check_frequency, last_checked_at::text as last_checked_at from public.research_sources where is_active order by name")).rows;
    },
    async recordUpdate(sourceId, runId, item) {
      return (await pg.query<{ id: string | null }>("select public.record_research_update($1, $2, $3) as id", [sourceId, runId, JSON.stringify(item)])).rows[0].id !== null;
    },
    async markChecked(sourceId) {
      await pg.query("select public.mark_research_source_checked($1)", [sourceId]);
    },
  };
}

/** Serves fixtures by host; records every request. */
function fakeFetcher(overrides: Record<string, () => Response> = {}) {
  const calls: { url: string; userAgent: string }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, userAgent: new Headers(init?.headers).get("User-Agent") ?? "" });
    const host = new URL(url).host;
    if (overrides[host]) return overrides[host]();
    if (host === "www.nature.com") return new Response(NATURE_RSS);
    if (host === "www.science.org" || host === "www.pnas.org") return new Response(SCIENCE_RSS);
    if (host === "api.openalex.org") return Response.json(OPENALEX);
    if (host === "api.crossref.org") return Response.json(CROSSREF);
    return new Response("not found", { status: 404 });
  };
  return { fetcher, calls };
}

const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

beforeEach(async () => {
  await db?.close();
  ({ db } = await createTestDb()); // a fresh database per test (migrations include the 8 seeded sources)
});
after(() => db.close());

describe("discovery run", () => {
  test("stores relevant publications once, whichever sources find them", async () => {
    const { fetcher } = fakeFetcher();
    const r = (await runDiscovery(pgliteStore(db), { trigger: "manual", sleep: noSleep, fetcher, contactEmail: "contact@example.test" }))!;
    assert.equal(r.status, "succeeded");
    assert.equal(r.sourcesChecked, 8);
    // Denisovan molar (Nature RSS ×3 feeds + OpenAlex), Caucasus farmers (Science ×3 feeds),
    // Zenodo Neanderthal preprint (OpenAlex), Armenian Highlands (Crossref ×7 queries).
    assert.equal(r.publicationsDiscovered, 4);
    assert.equal(await count("select count(*)::int n from public.research_updates"), 4);
    const titles = (await db.query<{ title: string }>("select title from public.research_updates order by title")).rows.map((x) => x.title);
    assert.ok(!titles.some((t) => /microbiome|Mysticism|Battery|retracted/i.test(t)), "irrelevant and retracted items are not stored");
  });

  test("keeps provenance: matched terms, peer-review flag, source name", async () => {
    const { fetcher } = fakeFetcher();
    await runDiscovery(pgliteStore(db), { trigger: "manual", sleep: noSleep, fetcher });
    const zenodo = (await db.query<{ is_peer_reviewed: boolean; raw_metadata: { matchedTerms: string[] } }>(
      "select is_peer_reviewed, raw_metadata from public.research_updates where doi = '10.5281/zenodo.1'",
    )).rows[0];
    assert.equal(zenodo.is_peer_reviewed, false);
    assert.deepEqual(zenodo.raw_metadata.matchedTerms, ["neanderthal"]);
    assert.equal(await count("select count(*)::int n from public.research_updates where analysis_status <> 'pending'"), 0);
  });

  test("is idempotent: a second run stores nothing new", async () => {
    const { fetcher } = fakeFetcher();
    await runDiscovery(pgliteStore(db), { trigger: "manual", sleep: noSleep, fetcher });
    const second = (await runDiscovery(pgliteStore(db), { trigger: "manual", sleep: noSleep, fetcher }))!;
    assert.equal(second.publicationsDiscovered, 0);
    assert.equal(await count("select count(*)::int n from public.research_updates"), 4);
    assert.equal(await count("select count(*)::int n from public.research_runs where status = 'succeeded'"), 2);
  });

  test("a failing source makes the run partial and is recorded; the others still run", async () => {
    const { fetcher } = fakeFetcher({ "api.openalex.org": () => new Response("budget exceeded", { status: 429 }) });
    const r = (await runDiscovery(pgliteStore(db), { trigger: "manual", sleep: noSleep, fetcher }))!;
    assert.equal(r.status, "partial");
    assert.equal(r.sourcesChecked, 7);
    assert.deepEqual(r.errors, [{ source: "OpenAlex", message: "HTTP 429 from api.openalex.org" }]);
    const run = (await db.query<{ status: string; errors: unknown[] }>("select status, errors from public.research_runs")).rows[0];
    assert.equal(run.status, "partial");
    assert.equal(run.errors.length, 1);
    assert.equal(await count("select count(*)::int n from public.research_sources where name = 'OpenAlex' and last_checked_at is null"), 1);
  });

  test("rate limits are retried after Retry-After, then succeed", async () => {
    let calls = 0;
    const waits: number[] = [];
    const { fetcher } = fakeFetcher({
      "api.crossref.org": () => (++calls === 1 ? new Response("slow down", { status: 429, headers: { "Retry-After": "3" } }) : Response.json(CROSSREF)),
    });
    const r = (await runDiscovery(pgliteStore(db), { trigger: "manual", fetcher, sleep: async (ms) => void waits.push(ms) }))!;
    assert.equal(r.status, "succeeded");
    assert.ok(waits.includes(3000), "waited the Retry-After time");
    assert.ok(waits.filter((w) => w === 400).length >= 6, "paced the seven Crossref queries");
  });

  test("an HTML page instead of a feed is an error, not an empty success", async () => {
    const { fetcher } = fakeFetcher({ "www.pnas.org": () => new Response("<html><body>Please enable JavaScript</body></html>") });
    const r = (await runDiscovery(pgliteStore(db), { trigger: "manual", sleep: noSleep, fetcher }))!;
    assert.deepEqual(r.errors, [{ source: "PNAS", message: "response is not an RSS or Atom feed" }]);
  });

  test("only one run at a time; a crashed run does not block forever", async () => {
    const store = pgliteStore(db);
    const first = await store.startRun("scheduled");
    assert.ok(first);
    assert.equal(await runDiscovery(store, { trigger: "manual", sleep: noSleep, fetcher: fakeFetcher().fetcher }), null);
    await db.exec("update public.research_runs set started_at = now() - interval '2 hours'");
    const r = await runDiscovery(store, { trigger: "manual", sleep: noSleep, fetcher: fakeFetcher().fetcher });
    assert.ok(r, "a stale run is closed and a new one starts");
    const stale = (await db.query<{ status: string }>(`select status from public.research_runs where id = '${first}'`)).rows[0];
    assert.equal(stale.status, "failed");
  });

  test("contact email goes only to Crossref and OpenAlex, never to journal sites", async () => {
    const { fetcher, calls } = fakeFetcher();
    await runDiscovery(pgliteStore(db), { trigger: "manual", sleep: noSleep, fetcher, contactEmail: "contact@example.test" });
    for (const c of calls) {
      const scholarlyApi = /api\.(openalex|crossref)\.org/.test(c.url);
      assert.equal(c.userAgent.includes("contact@example.test") || c.url.includes("contact%40example.test"), scholarlyApi, c.url);
    }
  });

  test("APIs are queried by publication date; first check looks back 30 days", async () => {
    const { fetcher, calls } = fakeFetcher();
    await runDiscovery(pgliteStore(db), { trigger: "manual", sleep: noSleep, fetcher, now: new Date("2026-11-18T05:00:00Z") });
    const crossref = new URL(calls.find((c) => c.url.includes("crossref"))!.url);
    assert.match(crossref.searchParams.get("filter")!, /from-pub-date:2026-10-19,until-pub-date:2026-11-18/);
    const openalex = new URL(calls.find((c) => c.url.includes("openalex"))!.url);
    assert.match(openalex.searchParams.get("filter")!, /from_publication_date:2026-10-19/);
  });
});

describe("scheduling", () => {
  const source = (last: string | null, active = true): ResearchSource => ({
    id: "s", name: "S", source_type: "rss", feed_url: "https://x", api_endpoint: null, is_active: active,
    check_frequency: "3 days", last_checked_at: last, configuration: {},
  });
  const now = new Date("2026-11-20T05:00:00Z");

  test("interval parsing", () => {
    assert.equal(intervalMs("3 days"), 3 * 86_400_000);
    assert.equal(intervalMs("3 days 12:00:00"), 3.5 * 86_400_000);
    assert.equal(intervalMs("84:00:00"), 3.5 * 86_400_000);
  });

  test("scheduled runs skip sources checked recently; manual runs check all active sources", () => {
    assert.equal(isDue(source("2026-11-19T05:00:00Z"), "scheduled", now), false);
    assert.equal(isDue(source("2026-11-17T05:30:00Z"), "scheduled", now), true, "within an hour of being due");
    assert.equal(isDue(source(null), "scheduled", now), true);
    assert.equal(isDue(source("2026-11-19T05:00:00Z"), "manual", now), true);
    assert.equal(isDue(source(null, false), "manual", now), false);
  });

  test("API roles cannot call the discovery functions", async () => {
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select public.start_research_run('manual')"), /permission denied/);
    await assert.rejects(db.query("select public.record_research_update(gen_random_uuid(), gen_random_uuid(), '{}')"), /permission denied/);
    await db.exec("reset role");
  });
});
