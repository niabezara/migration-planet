/**
 * Loads the public dataset: the approved records in Supabase, validated by
 * buildDataset(); the JSON files bundled with the server when the database is
 * unreachable, not configured, or returns data that fails validation.
 * Framework-free so it can be tested directly (see getPublicDataset.ts for the
 * cached Next.js entry point).
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildDataset } from "../buildDataset";
import { exportDataset, type TableReader } from "../db/exportDataset";
import type { RawDataset } from "../db/rawDataset";
import { bundledDataset } from "./bundledDataset";

export interface PublicDataset {
  raw: RawDataset;
  /** Content hash: changes exactly when the data changes. */
  version: string;
  origin: "supabase" | "bundled";
  /** Why the bundled copy was used (logged on the server, never shown publicly). */
  fallbackReason?: string;
}

/** PostgREST returns at most this many rows per request by default. */
const PAGE = 1000;

/** Reads content tables through the Supabase REST API as the anonymous role (RLS applies). */
export function supabaseTableReader(url: string, key: string): TableReader {
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (table, orderBy) => {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from(table).select("*");
      for (const col of orderBy) q = q.order(col, { ascending: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < PAGE) return rows;
    }
  };
}

/** JSON with object keys sorted, so equal content hashes equally whatever the key order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const versionOf = (raw: RawDataset) => createHash("sha256").update(canonicalJson(raw)).digest("hex").slice(0, 16);

/** `read` = null means "no database configured". */
export async function loadPublicDataset(read: TableReader | null): Promise<PublicDataset> {
  let reason = "Supabase is not configured";
  if (read) {
    try {
      const raw = await exportDataset(read);
      if (raw.species.species.length === 0 || raw.migrations.routes.length === 0) throw new Error("the database returned no species or routes");
      buildDataset(raw); // throws on broken references: never publish an invalid dataset
      return { raw, version: versionOf(raw), origin: "supabase" };
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
  }
  const raw = bundledDataset();
  return { raw, version: versionOf(raw), origin: "bundled", fallbackReason: reason };
}

/** Table reader from the public environment variables, or null when they are not set. */
export function envTableReader(): TableReader | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? supabaseTableReader(url, key) : null;
}
