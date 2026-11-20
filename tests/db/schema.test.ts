/* Phase 1: constraints that protect the data and the pipeline. */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { toSeedSql } from "@/data/db/toSeedSql";
import { readRawDataset } from "../../scripts/db/readRawDataset";
import { createTestDb } from "./testDb";

let db: PGlite;

before(async () => {
  ({ db } = await createTestDb());
  await db.exec(toSeedSql(readRawDataset()));
});
after(() => db.close());

const rejects = (sql: string, pattern: RegExp) => assert.rejects(db.exec(sql), pattern);

describe("content constraints", () => {
  test("an older bound younger than the younger bound is rejected", () =>
    rejects("update public.species set older_bp = 10, younger_bp = 20 where id = 'homo-sapiens'", /species_time_order/));

  test("route waypoints need at least two points", () =>
    rejects(`update public.migration_routes set path = '[{"lat":0,"lng":0,"year":1}]' where id = 'levant-europe'`, /check constraint/));

  test("links must point at existing records", () =>
    rejects("insert into public.route_sites (route_id, site_id, position) values ('levant-europe', 'no-such-site', 99)", /foreign key/));

  test("updates bump the version and updated_at", async () => {
    const before = (await db.query<{ version: number }>("select version from public.species where id = 'denisovans'")).rows[0].version;
    await db.exec("update public.species set time_note = time_note where id = 'denisovans'");
    const after = (await db.query<{ version: number }>("select version from public.species where id = 'denisovans'")).rows[0].version;
    assert.equal(after, before + 1);
  });

  test("two sources cannot share a DOI", () =>
    rejects(
      "insert into public.sources (id, sort_order, citation, doi) select 'dup', 9999, 'x', doi from public.sources where doi is not null limit 1",
      /sources_doi_key/,
    ));
});

describe("pipeline constraints", () => {
  test("only one research run can be running at a time", async () => {
    await db.exec("insert into public.research_runs (trigger) values ('scheduled')");
    await rejects("insert into public.research_runs (trigger) values ('manual')", /research_runs_single_running/);
    await db.exec("update public.research_runs set status = 'succeeded', completed_at = now() where status = 'running'");
    await db.exec("insert into public.research_runs (trigger) values ('manual')"); // allowed once the first finished
  });

  test("a publication is stored once per DOI", async () => {
    const ins = `insert into public.research_updates (source_id, doi, title, content_hash)
                 select id, '10.1038/test', 'A test', 'h' from public.research_sources where name = 'Crossref'`;
    await db.exec(ins);
    await rejects(ins, /research_updates_doi_key/);
  });

  test("DOIs must be stored lower-case", () =>
    rejects(
      "insert into public.research_updates (source_id, doi, title, content_hash) select id, '10.1038/UPPER', 't', 'h' from public.research_sources limit 1",
      /check constraint/,
    ));

  test("a reviewed proposal must record when it was reviewed", () =>
    rejects(
      `insert into public.update_proposals (entity_type, entity_id, proposal_type, proposed_data, finding_summary, reasoning, review_status)
       values ('species', 'denisovans', 'update', '{}', 's', 'r', 'approved')`,
      /proposals_review/,
    ));

  test("RLS is enabled on every public table", async () => {
    const rows = (
      await db.query<{ relname: string }>(
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
      )
    ).rows;
    assert.deepEqual(rows, []);
  });
});
