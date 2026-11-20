/**
 * research-discover: one discovery run over the monitored sources.
 *
 * Called by pg_cron (twice a week) and, later, by the admin dashboard
 * ("Run research now"). Authenticated with a shared secret header, because
 * it is deployed with --no-verify-jwt (cron has no user JWT).
 *
 * Responds immediately (202) and keeps working in the background, so the
 * caller's short HTTP timeout never cuts a run short.
 *
 * Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
 * RESEARCH_CRON_SECRET, RESEARCH_CONTACT_EMAIL, optional OPENALEX_API_KEY.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { runDiscovery } from "../_shared/research/discover.ts";
import type { DiscoveryStore, RunTrigger } from "../_shared/research/types.ts";

function supabaseStore(db: SupabaseClient): DiscoveryStore {
  const check = <T>({ data, error }: { data: T; error: { message: string } | null }, what: string): T => {
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
  };
  /** Like check, for queries that must return rows. */
  const rows = <T>(result: { data: T[] | null; error: { message: string } | null }, what: string): T[] => check(result, what) ?? [];
  return {
    async startRun(trigger, retryOf) {
      return check(await db.rpc("start_research_run", { p_trigger: trigger, p_retry_of: retryOf ?? null }), "start run");
    },
    async finishRun(runId, r) {
      check(
        await db.rpc("finish_research_run", {
          p_run: runId,
          p_status: r.status,
          p_sources_checked: r.sourcesChecked,
          p_publications_discovered: r.publicationsDiscovered,
          p_errors: r.errors,
          p_summary: r.summary,
        }),
        "finish run",
      );
    },
    async activeSources() {
      return rows(await db.from("research_sources").select("*").eq("is_active", true).order("name"), "load sources");
    },
    async recordUpdate(sourceId, runId, item) {
      const id = check(await db.rpc("record_research_update", { p_source: sourceId, p_run: runId, p_item: item }), "record publication");
      return id !== null;
    },
    async markChecked(sourceId) {
      check(await db.rpc("mark_research_source_checked", { p_source: sourceId }), "mark source checked");
    },
  };
}

/** Constant-time comparison of two strings. */
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

  const body = await req.json().catch(() => ({}));
  const trigger: RunTrigger = ["scheduled", "manual", "retry"].includes(body?.trigger) ? body.trigger : "manual";
  const retryOf = typeof body?.retryOf === "string" ? body.retryOf : null;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const run = runDiscovery(supabaseStore(db), {
    trigger,
    retryOf,
    fetcher: fetch,
    contactEmail: Deno.env.get("RESEARCH_CONTACT_EMAIL") ?? null,
    openAlexApiKey: Deno.env.get("OPENALEX_API_KEY") ?? null,
  }).then(
    (r) => console.log(JSON.stringify({ event: "research-run", result: r })),
    (e) => console.error(JSON.stringify({ event: "research-run-error", message: String(e) })),
  );
  EdgeRuntime.waitUntil(run);
  return json({ accepted: true, trigger }, 202);
});
