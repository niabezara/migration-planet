/**
 * Analysis of claimed publications, one at a time per publication:
 *
 *   triage (Claude) ─ irrelevant ─────────────────────────────► 'irrelevant'
 *        │ no affected record and no new site ─────────────────► 'no_change'
 *        ▼
 *   verify DOI (Crossref) ─ not verified ──────────────────────► 'no_change' (reason recorded)
 *        ▼
 *   load affected records → analysis (Claude) → validate in code
 *        ├─ no valid proposal ─────────────────────────────────► 'no_change'
 *        └─ valid proposals (review_status 'pending') ─────────► 'proposed'
 *
 * Any error marks the attempt failed; the publication is retried later (at
 * most three attempts). Nothing here changes the public dataset.
 */
import type { Fetcher } from "../types.ts";
import { catalogIds } from "./catalog.ts";
import { ENTITY_TYPES } from "./entities.ts";
import { analysisPrompt, systemPrompt, triagePrompt } from "./prompts.ts";
import type { AnalysisLlm, AnalysisStore, Catalog, EntityRef, PublicationRow } from "./types.ts";
import { validateAnalysis } from "./validate.ts";
import { verifyDoi } from "./verify.ts";

export interface AnalysisOptions {
  limit: number;
  fetcher: Fetcher;
  contactEmail?: string | null;
}

export interface PublicationOutcome {
  id: string;
  title: string;
  status: "irrelevant" | "no_change" | "proposed" | "failed";
  proposals: number;
  rejected: number;
  error?: string;
}

const MAX_CANDIDATES = 8;

async function analyzeOne(
  p: PublicationRow,
  catalog: Catalog,
  system: string,
  store: AnalysisStore,
  llm: AnalysisLlm,
  opts: AnalysisOptions,
): Promise<PublicationOutcome> {
  const ids = catalogIds(catalog);
  const alreadyCited = !!p.doi && catalog.sourceDois.includes(p.doi);
  const outcome = (status: PublicationOutcome["status"], proposals = 0, rejected = 0): PublicationOutcome => ({ id: p.id, title: p.title, status, proposals, rejected });

  const triage = await llm.triage(system, triagePrompt(p, alreadyCited));
  const usage: Record<string, unknown> = { triage: triage.usage };
  const candidates: EntityRef[] = triage.output.candidates
    .filter((c) => ENTITY_TYPES.includes(c.entity_type) && ids[c.entity_type].has(c.entity_id))
    .slice(0, MAX_CANDIDATES);
  const base = { model: triage.model, triage: { ...triage.output, candidates }, alreadyCited, usage };

  if (!triage.output.relevant) {
    await store.complete(p.id, "irrelevant", { ...base, reason: triage.output.reason }, []);
    return outcome("irrelevant");
  }
  if (candidates.length === 0 && !triage.output.may_warrant_new_site) {
    await store.complete(p.id, "no_change", { ...base, reason: "relevant, but no record of the dataset is affected" }, []);
    return outcome("no_change");
  }

  const verification = await verifyDoi(p.doi, p.title, opts.fetcher, opts.contactEmail);
  if (verification.status !== "verified") {
    await store.complete(p.id, "no_change", { ...base, verification, reason: `publication identity could not be verified (${verification.status})` }, []);
    return outcome("no_change");
  }

  const records = await store.loadRecords(candidates);
  const analysis = await llm.analyze(system, analysisPrompt(p, alreadyCited, triage.output, records, verification));
  usage.analysis = analysis.usage;

  // Proposals may reference catalog records triage did not list: load those too before validating.
  const extra = analysis.output.proposals
    .filter((x) => x.proposal_type !== "create" && ENTITY_TYPES.includes(x.entity_type) && ids[x.entity_type].has(x.entity_id))
    .filter((x) => !records.some((r) => r.ref.entity_type === x.entity_type && r.ref.entity_id === x.entity_id))
    .map((x) => ({ entity_type: x.entity_type, entity_id: x.entity_id }));
  const allRecords = extra.length ? [...records, ...(await store.loadRecords(extra))] : records;

  const { proposals, rejected } = validateAnalysis(analysis.output, {
    publication: p,
    verification,
    records: allRecords,
    existingIds: ids,
    model: analysis.model,
  });
  const record = { ...base, model: analysis.model, verification, analysis: analysis.output, rejected };
  if (proposals.length === 0) {
    await store.complete(p.id, "no_change", { ...record, reason: analysis.output.decision === "no_change" ? analysis.output.no_change_reason : "no proposal passed validation" }, []);
    return outcome("no_change", 0, rejected.length);
  }
  await store.complete(p.id, "proposed", record, proposals);
  return outcome("proposed", proposals.length, rejected.length);
}

/** Claims up to `limit` pending publications and analyses them concurrently. */
export async function analyzePending(store: AnalysisStore, llm: AnalysisLlm, opts: AnalysisOptions): Promise<PublicationOutcome[]> {
  const claimed = await store.claim(opts.limit);
  if (claimed.length === 0) return [];
  const catalog = await store.loadCatalog();
  const system = systemPrompt(catalog); // identical for every publication: cached by the API
  return Promise.all(
    claimed.map(async (p) => {
      try {
        return await analyzeOne(p, catalog, system, store, llm, opts);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await store.fail(p.id, message).catch(() => undefined);
        return { id: p.id, title: p.title, status: "failed" as const, proposals: 0, rejected: 0, error: message };
      }
    }),
  );
}
