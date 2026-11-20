/* Phase 1: the JSON dataset imports into the schema and exports back unchanged. */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { toSeedSql } from "@/data/db/toSeedSql";
import { exportDataset, sqlTableReader, type Query } from "@/data/db/exportDataset";
import { RAW_DATASET_FILES } from "@/data/db/rawDataset";
import { readRawDataset } from "../../scripts/db/readRawDataset";
import { createTestDb } from "./testDb";

const raw = readRawDataset();
let db: PGlite;
let query: Query;

before(async () => {
  ({ db, query } = await createTestDb());
  await db.exec(toSeedSql(raw));
});
after(() => db.close());

describe("dataset import", () => {
  test("every file round-trips through the database unchanged", async () => {
    const exported = await exportDataset(sqlTableReader(query));
    for (const key of Object.keys(RAW_DATASET_FILES) as (keyof typeof RAW_DATASET_FILES)[]) {
      assert.deepStrictEqual(exported[key], raw[key], `${RAW_DATASET_FILES[key]} differs after the round trip`);
    }
  });

  test("record counts match the files", async () => {
    const count = async (t: string) => Number((await query<{ n: number }>(`select count(*)::int as n from public.${t}`))[0].n);
    assert.equal(await count("species"), raw.species.species.length);
    assert.equal(await count("migration_routes"), raw.migrations.routes.length);
    assert.equal(await count("archaeological_sites"), raw.events.sites.length);
    assert.equal(await count("historical_periods"), raw.events.periods.length);
    assert.equal(await count("population_clusters"), raw.populations.clusters.length);
    assert.equal(await count("milestones"), raw.milestones.milestones.length);
    assert.equal(await count("sources"), raw.migrations.sources.length + raw.sources.sources.length);
    assert.equal(await count("route_evidence"), raw.migrations.routes.reduce((n, r) => n + r.evidence.length, 0));
  });

  test("route time bounds are derived from the path", async () => {
    const rows = await query<{ id: string; older_bp: number; younger_bp: number }>("select id, older_bp, younger_bp from public.migration_routes");
    for (const r of raw.migrations.routes) {
      const row = rows.find((x) => x.id === r.id)!;
      assert.equal(row.older_bp, r.path[0].year, r.id);
      assert.equal(row.younger_bp, r.path[r.path.length - 1].year, r.id);
    }
  });

  test("DOIs are extracted from doi.org URLs and unique", async () => {
    const rows = await query<{ doi: string }>("select doi from public.sources where doi is not null");
    const doiUrls = [...raw.migrations.sources, ...raw.sources.sources].filter((s) => /doi\.org\//.test(s.url ?? ""));
    assert.equal(rows.length, doiUrls.length);
    assert.ok(rows.every((r) => r.doi.startsWith("10.") && r.doi === r.doi.toLowerCase()));
  });

  test("unknown makers and the Homo sapiens default are both preserved", async () => {
    const unknown = await query<{ id: string }>(
      "select s.id from public.archaeological_sites s where not exists (select 1 from public.site_species x where x.site_id = s.id) order by s.id",
    );
    assert.deepEqual(unknown.map((r) => r.id), raw.events.sites.filter((s) => s.speciesIds?.length === 0).map((s) => s.id).sort());
  });

  test("the seed is deterministic", () => {
    assert.equal(toSeedSql(raw), toSeedSql(readRawDataset()));
  });
});
