/**
 * An in-process Postgres (PGlite) with the project's migrations applied, so
 * schema and data tests run without Docker or a Supabase project.
 * Supabase-provided objects the migrations rely on (auth schema, API roles)
 * are stubbed minimally here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Query } from "@/data/db/exportDataset";

const MIGRATIONS = join(import.meta.dirname, "../../supabase/migrations");

const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase's defaults: API roles get every privilege on new public tables,
  -- so migrations must narrow them explicitly (as on the real platform).
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

/**
 * Runs `fn` as an API role inside a transaction that is rolled back, the way
 * PostgREST runs a request: `anon`, or `authenticated` with the user's id.
 */
export async function asRole<T>(db: PGlite, role: "anon" | "authenticated", userId: string | null, fn: (q: Query) => Promise<T>): Promise<T> {
  let result!: T;
  await db
    .transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
      result = await fn(async <R,>(sql: string) => (await tx.query<R>(sql)).rows);
      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });
  return result;
}
const ROLLBACK = Symbol("rollback");

export async function createTestDb(): Promise<{ db: PGlite; query: Query }> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  const query: Query = async <T,>(sql: string) => (await db.query<T>(sql)).rows;
  return { db, query };
}
