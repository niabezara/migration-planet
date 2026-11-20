/* Phase 5: AI analysis pipeline with a fake model (no real API calls, no cost). */
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { analyzePending } from "../../supabase/functions/_shared/research/analysis/analyze.ts";
import { ENTITY_TABLE, toEntityRecord } from "../../supabase/functions/_shared/research/analysis/entities.ts";
import { systemPrompt } from "../../supabase/functions/_shared/research/analysis/prompts.ts";
import { validateAnalysis, type ValidationContext } from "../../supabase/functions/_shared/research/analysis/validate.ts";
import { titleSimilarity, verifyDoi } from "../../supabase/functions/_shared/research/analysis/verify.ts";
import type {
  AnalysisLlm, AnalysisOutput, AnalysisStore, Catalog, EntityRecord, ModelProposal, PublicationRow, TriageOutput,
} from "../../supabase/functions/_shared/research/analysis/types.ts";
import type { Fetcher } from "../../supabase/functions/_shared/research/types.ts";
import { toSeedSql } from "@/data/db/toSeedSql";
import { exportDataset, sqlTableReader } from "@/data/db/exportDataset";
import { readRawDataset } from "../../scripts/db/readRawDataset";
import { createTestDb } from "../db/testDb.ts";

// ---------------------------------------------------------------------------------
// Fixtures

const ABSTRACT =
  "Proteins extracted from a molar at Tam Ngu Hao 2 confirm it belonged to a Denisovan child. " +
  "New luminescence dates place the deposit between 170,000 and 125,000 years ago, extending the known range of the site.";

const publication = (over: Partial<PublicationRow> = {}): PublicationRow => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  doi: "10.1038/s41586-026-00001-x",
  title: "A Denisovan child from Tam Ngu Hao 2",
  abstract: ABSTRACT,
  authors: "A. Researcher",
  journal: "Nature",
  publication_date: "2026-11-12",
  original_url: "https://www.nature.com/articles/s41586-026-00001-x",
  is_peer_reviewed: true,
  raw_metadata: {},
  ...over,
});

const siteRecord: EntityRecord = {
  ref: { entity_type: "archaeological_site", entity_id: "tam-ngu-hao" },
  version: 4,
  row: { id: "tam-ngu-hao", name: "Tam Ngu Hao 2 (Cobra Cave)", older_bp: 164000, younger_bp: 131000, description: "A Denisovan child's molar.", confidence: "medium", region: "Laos" },
};

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  publication: publication(),
  verification: { status: "verified", crossrefTitle: "A Denisovan child from Tam Ngu Hao 2", crossrefJournal: "Nature" },
  records: [siteRecord],
  existingIds: {
    species: new Set(["denisovans", "homo-sapiens"]),
    archaeological_site: new Set(["tam-ngu-hao"]),
    migration_route: new Set(),
    milestone: new Set(),
  },
  model: "claude-opus-5-5",
  ...over,
});

const QUOTE = "place the deposit between 170,000 and 125,000 years ago";
const proposal = (over: Partial<ModelProposal> = {}): ModelProposal => ({
  entity_type: "archaeological_site",
  entity_id: "tam-ngu-hao",
  proposal_type: "update",
  changes: [
    { field: "older_bp", value_json: "170000", evidence_quote: QUOTE },
    { field: "younger_bp", value_json: "125000", evidence_quote: QUOTE },
  ],
  reasoning: "New luminescence dates widen the range.",
  confidence: "medium",
  uncertainty_notes: "Single study.",
  ...over,
});

const analysis = (proposals: ModelProposal[], over: Partial<AnalysisOutput> = {}): AnalysisOutput => ({
  finding_summary: "New dates for the Tam Ngu Hao 2 deposit.",
  evidence_kind: "chronological",
  publication_status: "peer_reviewed_research",
  challenges_existing_interpretation: false,
  scientific_limitations: "Luminescence dating of cave sediments.",
  competing_interpretations: "",
  decision: proposals.length ? "propose" : "no_change",
  no_change_reason: proposals.length ? "" : "nothing new",
  proposals,
  ...over,
});

// ---------------------------------------------------------------------------------

describe("validation of Claude's proposals", () => {
  test("a well-supported date change becomes a pending proposal with its evidence", () => {
    const { proposals, rejected } = validateAnalysis(analysis([proposal()]), ctx());
    assert.deepEqual(rejected, []);
    const [p] = proposals;
    assert.deepEqual(p.proposed_data, { older_bp: 170000, younger_bp: 125000 });
    assert.deepEqual(p.current_data, { older_bp: 164000, younger_bp: 131000 });
    assert.equal(p.base_version, 4);
    assert.equal(p.confidence_score, 0.6);
    assert.equal(p.evidence_quotes.length, 2);
    assert.equal(p.supporting_sources.length, 1, "the only source is the publication itself");
    assert.equal(p.supporting_sources[0].doi, "10.1038/s41586-026-00001-x");
    assert.equal(p.supporting_sources[0].doi_verified, true);
  });

  test("a quote that is not in the publication is rejected (no fabricated support)", () => {
    const bad = proposal({ changes: [{ field: "older_bp", value_json: "200000", evidence_quote: "dated to about 200,000 years ago" }] });
    const { proposals, rejected } = validateAnalysis(analysis([bad]), ctx());
    assert.equal(proposals.length, 0);
    assert.match(rejected[0].reason, /does not occur in the publication/);
  });

  test("quotes survive typographic differences but not paraphrase", () => {
    const curly = proposal({ changes: [{ field: "older_bp", value_json: "170000", evidence_quote: "PLACE the deposit  between 170,000 and 125,000 years ago" }] });
    assert.equal(validateAnalysis(analysis([curly]), ctx()).proposals.length, 1);
    const paraphrase = proposal({ changes: [{ field: "older_bp", value_json: "170000", evidence_quote: "the deposit dates to 170-125 ka" }] });
    assert.equal(validateAnalysis(analysis([paraphrase]), ctx()).proposals.length, 0);
  });

  test("fields outside the whitelist, unknown records and broken date order are rejected", () => {
    const reasons = (p: ModelProposal) => validateAnalysis(analysis([p]), ctx()).rejected.map((r) => r.reason).join();
    assert.match(reasons(proposal({ changes: [{ field: "lat", value_json: "20", evidence_quote: QUOTE }] })), /may not be changed/);
    assert.match(reasons(proposal({ entity_id: "no-such-site" })), /does not exist/);
    assert.match(reasons(proposal({ changes: [{ field: "younger_bp", value_json: "190000", evidence_quote: QUOTE }] })), /must be older/);
    assert.match(reasons(proposal({ changes: [{ field: "older_bp", value_json: "\"old\"", evidence_quote: QUOTE }] })), /whole number/);
  });

  test("changes identical to the current values are dropped", () => {
    const same = proposal({ changes: [{ field: "older_bp", value_json: "164000", evidence_quote: QUOTE }] });
    assert.match(validateAnalysis(analysis([same]), ctx()).rejected[0].reason, /no change/);
  });

  test("preprints cannot raise confidence and are scored low", () => {
    const raise = proposal({ changes: [{ field: "confidence", value_json: "\"high\"", evidence_quote: QUOTE }] });
    const pre = ctx({ publication: publication({ is_peer_reviewed: false }) });
    assert.match(validateAnalysis(analysis([raise]), pre).rejected[0].reason, /preprint cannot raise confidence/);
    const [p] = validateAnalysis(analysis([proposal({ confidence: "high" })]), pre).proposals;
    assert.equal(p.confidence_score, 0.3);
    assert.match(p.uncertainty_notes, /preprint/);
  });

  test("news and commentary never change the dataset", () => {
    const r = validateAnalysis(analysis([proposal()], { publication_status: "news_or_commentary" }), ctx());
    assert.equal(r.proposals.length, 0);
    assert.match(r.rejected[0].reason, /commentary/);
  });

  test("an unverified DOI blocks every proposal", () => {
    const r = validateAnalysis(analysis([proposal()]), ctx({ verification: { status: "mismatch", crossrefTitle: "Something else" } }));
    assert.equal(r.proposals.length, 0);
    assert.match(r.rejected[0].reason, /not verified \(mismatch\)/);
  });

  test("a new site without coordinates asks the administrator for them", () => {
    const create = proposal({
      proposal_type: "create",
      entity_id: "new-cave",
      changes: [
        { field: "name", value_json: "\"New Cave\"", evidence_quote: "Tam Ngu Hao 2 confirm it belonged" },
        { field: "region", value_json: "\"Laos\"", evidence_quote: "Tam Ngu Hao 2 confirm it belonged" },
        { field: "older_bp", value_json: "170000", evidence_quote: QUOTE },
        { field: "younger_bp", value_json: "125000", evidence_quote: QUOTE },
        { field: "description", value_json: "\"Denisovan molar site.\"", evidence_quote: "belonged to a Denisovan child" },
        { field: "confidence", value_json: "\"medium\"", evidence_quote: "belonged to a Denisovan child" },
        { field: "species_ids", value_json: "[\"denisovans\"]", evidence_quote: "belonged to a Denisovan child" },
      ],
    });
    const [p] = validateAnalysis(analysis([create]), ctx()).proposals;
    assert.deepEqual(p.requires_admin_input, ["lat", "lng"]);
    assert.equal(p.proposed_data.id, "new-cave");
    assert.equal(p.base_version, null);
    const taken = validateAnalysis(analysis([{ ...create, entity_id: "tam-ngu-hao" }]), ctx());
    assert.match(taken.rejected[0].reason, /already exists/);
    const species = validateAnalysis(analysis([{ ...create, entity_type: "species" }]), ctx());
    assert.match(species.rejected[0].reason, /only new archaeological sites/);
  });

  test("additional evidence attaches the publication without changing values", () => {
    const add = proposal({ proposal_type: "additional_evidence", changes: [{ field: "evidence_note", value_json: "\"Confirms the Denisovan attribution with proteins.\"", evidence_quote: "confirm it belonged to a Denisovan child" }] });
    const [p] = validateAnalysis(analysis([add]), ctx()).proposals;
    assert.equal((p.proposed_data.add_source as { doi: string }).doi, "10.1038/s41586-026-00001-x");
    assert.equal(p.proposed_data.evidence_note, "Confirms the Denisovan attribution with proteins.");
  });

  test("at most five proposals per publication", () => {
    const many = Array.from({ length: 7 }, () => proposal());
    const r = validateAnalysis(analysis(many), ctx());
    assert.equal(r.proposals.length, 5);
    assert.equal(r.rejected.length, 2);
  });
});

describe("DOI verification", () => {
  const crossref = (title: string | null, status = 200): Fetcher => async () =>
    status === 200 ? Response.json({ message: { title: title ? [title] : [], "container-title": ["Nature"], type: "journal-article" } }) : new Response("", { status });

  test("title similarity tolerates punctuation and case", () => {
    assert.equal(titleSimilarity("A Denisovan child from Tam Ngu Hao 2", "A denisovan child from Tam Ngu Hao 2."), 1);
    assert.ok(titleSimilarity("A Denisovan child", "Battery chemistry at scale") < 0.3);
  });

  test("verified, mismatched, unknown and missing DOIs", async () => {
    assert.equal((await verifyDoi("10.1/x", "A Denisovan child from Tam Ngu Hao 2", crossref("A Denisovan child from Tam Ngu Hao 2"))).status, "verified");
    assert.equal((await verifyDoi("10.1/x", "A Denisovan child from Tam Ngu Hao 2", crossref("Battery chemistry at scale"))).status, "mismatch");
    assert.equal((await verifyDoi("10.1/x", "t", crossref(null, 404))).status, "not_found");
    assert.equal((await verifyDoi(null, "t", crossref("t"))).status, "no_doi");
    const thrown: Fetcher = async () => {
      throw new Error("network down");
    };
    assert.equal((await verifyDoi("10.1/x", "t", thrown)).status, "error");
  });
});

// ---------------------------------------------------------------------------------
// End to end on PGlite: claim → (fake) Claude → validation → stored proposals

let db: PGlite;

function pgliteStore(pg: PGlite): AnalysisStore {
  const q = async <T,>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
  return {
    claim: (limit) => q<PublicationRow>("select * from public.claim_research_updates($1)", [limit]),
    async loadCatalog(): Promise<Catalog> {
      return {
        species: await q("select id, name, older_bp, younger_bp, confidence from public.species order by sort_order"),
        sites: await q(`select s.id, s.name, s.region, s.older_bp, s.younger_bp, s.confidence,
                          coalesce(array(select species_id from public.site_species x where x.site_id = s.id order by position), '{}') as species_ids
                        from public.archaeological_sites s order by sort_order`),
        routes: await q("select id, name, species_id, older_bp, younger_bp, origin, destination, confidence from public.migration_routes order by sort_order"),
        milestones: await q(`select m.id, m.title, m.category, m.approximate_start_bp, m.approximate_end_bp,
                               coalesce(array(select species_id from public.milestone_species x where x.milestone_id = m.id order by position), '{}') as species_ids
                             from public.milestones m order by sort_order`),
        sourceDois: (await q<{ doi: string }>("select doi from public.sources where doi is not null")).map((r) => r.doi),
      };
    },
    async loadRecords(refs) {
      const out: EntityRecord[] = [];
      for (const ref of refs) {
        const [row] = await q<Record<string, unknown>>(`select * from public.${ENTITY_TABLE[ref.entity_type]} where id = $1`, [ref.entity_id]);
        if (row) out.push(toEntityRecord(ref.entity_type, row));
      }
      return out;
    },
    async complete(id, status, a, proposals) {
      await q("select public.complete_research_analysis($1, $2, $3, $4)", [id, status, JSON.stringify(a), JSON.stringify(proposals)]);
    },
    async fail(id, error) {
      await q("select public.fail_research_analysis($1, $2)", [id, error]);
    },
  };
}

/** A scripted model: answers by publication title. Records the prompts it receives. */
function fakeLlm(script: Record<string, { triage: TriageOutput; analysis?: AnalysisOutput } | Error>) {
  const prompts: { system: string; user: string }[] = [];
  const pick = (user: string) => {
    const key = Object.keys(script).find((t) => user.includes(`Title: ${t}`));
    if (!key) throw new Error("unscripted publication");
    const entry = script[key];
    if (entry instanceof Error) throw entry;
    return entry;
  };
  const llm: AnalysisLlm = {
    async triage(system, user) {
      prompts.push({ system, user });
      return { output: pick(user).triage, model: "fake-model", usage: { input_tokens: 1 } };
    },
    async analyze(system, user) {
      prompts.push({ system, user });
      return { output: pick(user).analysis!, model: "fake-model", usage: { input_tokens: 1 } };
    },
  };
  return { llm, prompts };
}

const crossrefOk: Fetcher = async (url) => {
  const doi = decodeURIComponent(new URL(url).pathname.replace("/works/", ""));
  const titles: Record<string, string> = { "10.1038/s41586-026-00001-x": "A Denisovan child from Tam Ngu Hao 2" };
  return titles[doi] ? Response.json({ message: { title: [titles[doi]], "container-title": ["Nature"] } }) : new Response("", { status: 404 });
};

async function addPublication(over: Partial<PublicationRow>) {
  const p = publication(over);
  await db.query(
    `insert into public.research_updates (id, source_id, doi, title, abstract, journal, publication_date, original_url, is_peer_reviewed, content_hash)
     select $1, id, $2, $3, $4, $5, $6, $7, $8, md5($3) from public.research_sources where name = 'Nature'`,
    [p.id, p.doi, p.title, p.abstract, p.journal, p.publication_date, p.original_url, p.is_peer_reviewed],
  );
}

const status = async (id: string) =>
  (await db.query<{ analysis_status: string; analysis_attempts: number; analysis_error: string | null }>(
    "select analysis_status, analysis_attempts, analysis_error from public.research_updates where id = $1", [id],
  )).rows[0];

beforeEach(async () => {
  await db?.close();
  ({ db } = await createTestDb());
  await db.exec(toSeedSql(readRawDataset()));
});
after(() => db.close());

const ID = { relevant: "00000000-0000-4000-8000-000000000001", irrelevant: "00000000-0000-4000-8000-000000000002", broken: "00000000-0000-4000-8000-000000000003" };

describe("analysis run (fake model, real database functions)", () => {
  test("irrelevant, no-change and proposed outcomes are stored; public data is untouched", async () => {
    await addPublication({ id: ID.relevant });
    await addPublication({ id: ID.irrelevant, doi: "10.1/battery", title: "Battery chemistry at scale", abstract: "Lithium." });
    const before = await exportDataset(sqlTableReader(async (sql) => (await db.query(sql)).rows as never));

    const { llm } = fakeLlm({
      "A Denisovan child from Tam Ngu Hao 2": {
        triage: { relevant: true, reason: "Denisovan site dates", candidates: [{ entity_type: "archaeological_site", entity_id: "tam-ngu-hao" }], may_warrant_new_site: false },
        analysis: analysis([proposal()]),
      },
      "Battery chemistry at scale": { triage: { relevant: false, reason: "not about human evolution", candidates: [], may_warrant_new_site: false } },
    });
    const outcomes = await analyzePending(pgliteStore(db), llm, { limit: 5, fetcher: crossrefOk });
    assert.deepEqual(outcomes.map((o) => o.status).sort(), ["irrelevant", "proposed"]);

    assert.equal((await status(ID.irrelevant)).analysis_status, "irrelevant");
    assert.equal((await status(ID.relevant)).analysis_status, "proposed");
    const proposals = (await db.query<{ entity_id: string; review_status: string; proposed_data: Record<string, number>; base_version: number }>(
      "select entity_id, review_status, proposed_data, base_version from public.update_proposals",
    )).rows;
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].review_status, "pending");
    assert.deepEqual(proposals[0].proposed_data, { older_bp: 170000, younger_bp: 125000 });

    const after = await exportDataset(sqlTableReader(async (sql) => (await db.query(sql)).rows as never));
    assert.deepStrictEqual(after, before, "analysis never changes the public dataset");
  });

  test("the system prompt is identical for every publication (cacheable) and carries the integrity rules", async () => {
    await addPublication({ id: ID.relevant });
    await addPublication({ id: ID.irrelevant, doi: "10.1/battery", title: "Battery chemistry at scale", abstract: "Lithium." });
    const { llm, prompts } = fakeLlm({
      "A Denisovan child from Tam Ngu Hao 2": { triage: { relevant: false, reason: "-", candidates: [], may_warrant_new_site: false } },
      "Battery chemistry at scale": { triage: { relevant: false, reason: "-", candidates: [], may_warrant_new_site: false } },
    });
    await analyzePending(pgliteStore(db), llm, { limit: 5, fetcher: crossrefOk });
    assert.equal(new Set(prompts.map((p) => p.system)).size, 1);
    assert.match(prompts[0].system, /Never invent citations/);
    assert.match(prompts[0].system, /tam-ngu-hao \| Tam Ngu Hao 2/);
    assert.ok(!prompts[0].system.includes("Battery"), "publication text stays out of the cached system prompt");
    assert.equal(systemPrompt(await pgliteStore(db).loadCatalog()), prompts[0].system, "deterministic");
  });

  test("an unverifiable DOI ends as no_change with the reason recorded, without asking for proposals", async () => {
    await addPublication({ id: ID.relevant, doi: "10.9999/unknown" });
    const { llm, prompts } = fakeLlm({
      "A Denisovan child from Tam Ngu Hao 2": {
        triage: { relevant: true, reason: "x", candidates: [{ entity_type: "archaeological_site", entity_id: "tam-ngu-hao" }], may_warrant_new_site: false },
        analysis: analysis([proposal()]),
      },
    });
    await analyzePending(pgliteStore(db), llm, { limit: 5, fetcher: crossrefOk });
    assert.equal((await status(ID.relevant)).analysis_status, "no_change");
    assert.equal(prompts.length, 1, "the analysis call is never made");
    const a = (await db.query<{ analysis: { reason: string } }>("select analysis from public.research_updates where id = $1", [ID.relevant])).rows[0].analysis;
    assert.match(a.reason, /could not be verified \(not_found\)/);
  });

  test("triage candidates that are not in the catalog are ignored", async () => {
    await addPublication({ id: ID.relevant });
    const { llm } = fakeLlm({
      "A Denisovan child from Tam Ngu Hao 2": {
        triage: { relevant: true, reason: "x", candidates: [{ entity_type: "archaeological_site", entity_id: "invented-site" }], may_warrant_new_site: false },
      },
    });
    const [o] = await analyzePending(pgliteStore(db), llm, { limit: 5, fetcher: crossrefOk });
    assert.equal(o.status, "no_change");
  });

  test("model errors are retried up to three times, then the publication is marked failed", async () => {
    await addPublication({ id: ID.broken });
    const { llm } = fakeLlm({ "A Denisovan child from Tam Ngu Hao 2": new Error("Claude declined to analyse this publication (cyber)") });
    for (let i = 1; i <= 3; i++) {
      await analyzePending(pgliteStore(db), llm, { limit: 5, fetcher: crossrefOk });
      const s = await status(ID.broken);
      assert.equal(s.analysis_attempts, i);
      assert.equal(s.analysis_status, i < 3 ? "pending" : "failed");
      assert.match(s.analysis_error ?? "", /declined/);
    }
    assert.deepEqual(await analyzePending(pgliteStore(db), llm, { limit: 5, fetcher: crossrefOk }), [], "no fourth attempt");
  });

  test("concurrent claims never hand out the same publication", async () => {
    await addPublication({ id: ID.relevant });
    await addPublication({ id: ID.irrelevant, doi: "10.1/battery", title: "Battery chemistry at scale" });
    const store = pgliteStore(db);
    const a = await store.claim(1);
    const b = await store.claim(5);
    assert.equal(a.length + b.length, 2);
    assert.ok(!b.some((x) => x.id === a[0].id));
    assert.deepEqual(await store.claim(5), []);
  });

  test("results can only be stored for a publication being analysed, with consistent status", async () => {
    await addPublication({ id: ID.relevant });
    await assert.rejects(db.query("select public.complete_research_analysis($1, 'no_change', '{}', '[]')", [ID.relevant]), /not being analysed/);
    await pgliteStore(db).claim(1);
    await assert.rejects(db.query("select public.complete_research_analysis($1, 'proposed', '{}', '[]')", [ID.relevant]), /requires proposals/);
    await assert.rejects(db.query("select public.complete_research_analysis($1, 'pending', '{}', '[]')", [ID.relevant]), /invalid final analysis status/);
  });

  test("API roles cannot call the analysis functions", async () => {
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select public.claim_research_updates(1)"), /permission denied/);
    await assert.rejects(db.query("select public.complete_research_analysis(gen_random_uuid(), 'no_change', '{}', '[]')"), /permission denied/);
    await db.exec("reset role");
  });
});
