/* Phase 3: the public app's data source (database first, bundled files as fallback). */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { buildDataset } from "@/data/buildDataset";
import { toSeedSql } from "@/data/db/toSeedSql";
import { sqlTableReader, type TableReader } from "@/data/db/exportDataset";
import { loadPublicDataset } from "@/data/server/loadPublicDataset";
import { readRawDataset } from "../../scripts/db/readRawDataset";
import { createTestDb } from "./testDb";

const files = readRawDataset();
let db: PGlite;
let reader: TableReader;

before(async () => {
  const t = await createTestDb();
  db = t.db;
  await db.exec(toSeedSql(files));
  reader = sqlTableReader(t.query);
});
after(() => db.close());

describe("public dataset loading", () => {
  test("serves the database when it is valid", async () => {
    const result = await loadPublicDataset(reader);
    assert.equal(result.origin, "supabase");
    assert.deepStrictEqual(result.raw, files);
  });

  test("the database and the files build the same app dataset", async () => {
    const { raw } = await loadPublicDataset(reader);
    assert.deepStrictEqual(buildDataset(raw), buildDataset(files));
  });

  test("the version is a content hash", async () => {
    const a = await loadPublicDataset(reader);
    const b = await loadPublicDataset(null);
    assert.equal(a.version, b.version, "same content, same version");
    const changed: TableReader = async (table, order) => {
      const rows = await reader(table, order);
      return table === "species" ? rows.map((r) => (r.id === "denisovans" ? { ...r, distribution: "changed" } : r)) : rows;
    };
    assert.notEqual((await loadPublicDataset(changed)).version, a.version);
  });

  test("falls back to the bundled files when the database is unreachable", async () => {
    const failing: TableReader = async () => {
      throw new Error("fetch failed");
    };
    const result = await loadPublicDataset(failing);
    assert.equal(result.origin, "bundled");
    assert.match(result.fallbackReason ?? "", /fetch failed/);
    assert.deepStrictEqual(result.raw, files);
  });

  test("falls back when the database returns data that fails validation", async () => {
    const broken: TableReader = async (table, order) => {
      const rows = await reader(table, order);
      return table === "route_sites" ? [...rows, { route_id: "levant-europe", site_id: "no-such-site", position: 99 }] : rows;
    };
    const result = await loadPublicDataset(broken);
    assert.equal(result.origin, "bundled");
    assert.match(result.fallbackReason ?? "", /unknown site no-such-site/);
  });

  test("falls back when the database is empty or not configured", async () => {
    const empty: TableReader = async () => [];
    assert.equal((await loadPublicDataset(empty)).origin, "bundled");
    assert.equal((await loadPublicDataset(null)).origin, "bundled");
  });
});
