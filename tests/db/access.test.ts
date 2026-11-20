/* Phase 2: who can read and write what, through the API roles. */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { toSeedSql } from "@/data/db/toSeedSql";
import { readRawDataset } from "../../scripts/db/readRawDataset";
import { asRole, createTestDb } from "./testDb";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const VISITOR = "00000000-0000-4000-8000-000000000002";
let db: PGlite;

before(async () => {
  ({ db } = await createTestDb());
  await db.exec(toSeedSql(readRawDataset()));
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.test'), ('${VISITOR}', 'visitor@example.test');
    insert into public.admins (user_id) values ('${ADMIN}');
    insert into public.update_proposals (entity_type, entity_id, proposal_type, proposed_data, finding_summary, reasoning)
      values ('species', 'denisovans', 'update', '{"timeNote":"x"}', 'summary', 'reasoning');
    update public.milestones set is_published = false where id = 'fire';
  `);
});
after(() => db.close());

const anon = <T>(fn: Parameters<typeof asRole<T>>[3]) => asRole(db, "anon", null, fn);
const visitor = <T>(fn: Parameters<typeof asRole<T>>[3]) => asRole(db, "authenticated", VISITOR, fn);
const admin = <T>(fn: Parameters<typeof asRole<T>>[3]) => asRole(db, "authenticated", ADMIN, fn);
const count = (rows: unknown[]) => rows.length;

describe("public visitors (anon)", () => {
  test("read the approved dataset", async () => {
    assert.equal(count(await anon((q) => q("select id from public.species"))), 10);
    assert.ok(count(await anon((q) => q("select id from public.migration_routes"))) > 40);
    assert.ok(count(await anon((q) => q("select source_id from public.route_evidence_sources"))) > 0);
  });

  test("cannot write content", async () => {
    await assert.rejects(anon((q) => q("update public.species set name = 'x'")), /permission denied/);
    await assert.rejects(anon((q) => q("insert into public.sources (id, sort_order, citation) values ('x', 1, 'x')")), /permission denied/);
    await assert.rejects(anon((q) => q("delete from public.milestones")), /permission denied/);
  });

  test("cannot see the research pipeline at all", async () => {
    for (const t of ["admins", "research_sources", "research_runs", "research_updates", "update_proposals", "review_history", "data_versions"]) {
      await assert.rejects(anon((q) => q(`select * from public.${t}`)), /permission denied/, t);
    }
  });

  test("do not see unpublished milestones or their links", async () => {
    const ids = (await anon((q) => q<{ id: string }>("select id from public.milestones"))).map((r) => r.id);
    assert.ok(!ids.includes("fire"));
    assert.equal(count(await anon((q) => q("select * from public.milestone_sources where milestone_id = 'fire'"))), 0);
  });
});

describe("signed-in non-admin", () => {
  test("reads public data but no research records", async () => {
    assert.equal(count(await visitor((q) => q("select id from public.species"))), 10);
    assert.equal(count(await visitor((q) => q("select id from public.update_proposals"))), 0);
    assert.equal(count(await visitor((q) => q("select id from public.research_sources"))), 0);
    assert.equal(count(await visitor((q) => q("select user_id from public.admins"))), 0);
    assert.equal((await visitor((q) => q<{ a: boolean }>("select public.is_admin() as a")))[0].a, false);
  });

  test("cannot make themselves an administrator", async () => {
    await assert.rejects(visitor((q) => q(`insert into public.admins (user_id) values ('${VISITOR}')`)), /permission denied/);
  });
});

describe("administrator", () => {
  test("is recognised and reads the research pipeline", async () => {
    assert.equal((await admin((q) => q<{ a: boolean }>("select public.is_admin() as a")))[0].a, true);
    assert.equal(count(await admin((q) => q("select id from public.update_proposals"))), 1);
    assert.equal(count(await admin((q) => q("select id from public.research_sources"))), 8, "the seeded sources");
  });

  test("sees unpublished milestones", async () => {
    const ids = (await admin((q) => q<{ id: string }>("select id from public.milestones"))).map((r) => r.id);
    assert.ok(ids.includes("fire"));
  });

  test("still cannot change data directly through the API", async () => {
    await assert.rejects(admin((q) => q("update public.species set name = 'x'")), /permission denied/);
    await assert.rejects(admin((q) => q("update public.update_proposals set review_status = 'approved'")), /permission denied/);
  });
});
