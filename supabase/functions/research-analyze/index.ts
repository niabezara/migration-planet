/**
 * research-analyze: analyses the next few pending publications.
 *
 * Called every 15 minutes by pg_cron while publications are pending (and
 * later by the admin dashboard). Same shared-secret authentication as
 * research-discover. Responds 202 at once and works in the background; a
 * small batch keeps each invocation well inside the Edge Function time limit.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
 * RESEARCH_CRON_SECRET, ANTHROPIC_API_KEY, RESEARCH_CONTACT_EMAIL.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { analyzePending } from "../_shared/research/analysis/analyze.ts";
import { ENTITY_TABLE, toEntityRecord } from "../_shared/research/analysis/entities.ts";
import type { AnalysisStore, Catalog, EntityRecord, PublicationRow } from "../_shared/research/analysis/types.ts";
import { claudeAnalysisLlm } from "./claude.ts";

const DEFAULT_BATCH = 2;

function supabaseStore(db: SupabaseClient): AnalysisStore {
  const check = <T>({ data, error }: { data: T; error: { message: string } | null }, what: string): T => {
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
  };
  /** Like check, for queries that must return rows. */
  const rows = <T>(result: { data: T[] | null; error: { message: string } | null }, what: string): T[] => check(result, what) ?? [];
  return {
    async claim(limit) {
      return rows(await db.rpc("claim_research_updates", { p_limit: limit }), "claim publications") as PublicationRow[];
    },
    async loadCatalog(): Promise<Catalog> {
      const [species, sites, siteSpecies, routes, milestones, msSpecies, sources] = await Promise.all([
        db.from("species").select("id, name, older_bp, younger_bp, confidence").order("sort_order"),
        db.from("archaeological_sites").select("id, name, region, older_bp, younger_bp, confidence").order("sort_order"),
        db.from("site_species").select("site_id, species_id").order("position"),
        db.from("migration_routes").select("id, name, species_id, older_bp, younger_bp, origin, destination, confidence").order("sort_order"),
        db.from("milestones").select("id, title, category, approximate_start_bp, approximate_end_bp").order("sort_order"),
        db.from("milestone_species").select("milestone_id, species_id").order("position"),
        db.from("sources").select("doi").not("doi", "is", null),
      ]);
      const ss = rows(siteSpecies, "site species");
      const ms = rows(msSpecies, "milestone species");
      return {
        species: rows(species, "species"),
        sites: rows(sites, "sites").map((s) => ({ ...s, species_ids: ss.filter((x) => x.site_id === s.id).map((x) => x.species_id) })),
        routes: rows(routes, "routes"),
        milestones: rows(milestones, "milestones").map((m) => ({ ...m, species_ids: ms.filter((x) => x.milestone_id === m.id).map((x) => x.species_id) })),
        sourceDois: rows(sources, "sources").map((s) => s.doi as string),
      };
    },
    async loadRecords(refs) {
      const out: EntityRecord[] = [];
      for (const type of new Set(refs.map((r) => r.entity_type))) {
        const ids = refs.filter((r) => r.entity_type === type).map((r) => r.entity_id);
        const found = rows(await db.from(ENTITY_TABLE[type]).select("*").in("id", ids), `load ${type}`) as Record<string, unknown>[];
        for (const row of found) out.push(toEntityRecord(type, row));
      }
      return out;
    },
    async complete(updateId, status, analysis, proposals) {
      check(await db.rpc("complete_research_analysis", { p_update: updateId, p_status: status, p_analysis: analysis, p_proposals: proposals }), "store analysis");
    },
    async fail(updateId, error) {
      check(await db.rpc("fail_research_analysis", { p_update: updateId, p_error: error }), "record failure");
    },
  };
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secret = Deno.env.get("RESEARCH_CRON_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-research-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not set" }, 503);

  const body = await req.json().catch(() => ({}));
  const limit = Number.isInteger(body?.limit) ? Math.min(Math.max(body.limit, 1), 5) : DEFAULT_BATCH;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const work = analyzePending(supabaseStore(db), claudeAnalysisLlm(apiKey), {
    limit,
    fetcher: fetch,
    contactEmail: Deno.env.get("RESEARCH_CONTACT_EMAIL") ?? null,
  }).then(
    (outcomes) => console.log(JSON.stringify({ event: "research-analysis", outcomes })),
    (e) => console.error(JSON.stringify({ event: "research-analysis-error", message: String(e) })),
  );
  EdgeRuntime.waitUntil(work);
  return json({ accepted: true, limit }, 202);
});
