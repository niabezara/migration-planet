# Research pipeline

Automated discovery of new research relevant to the dataset. Discovery only **stores publications**; it never creates proposals and never changes the public dataset. Analysis (phase 5) and administrator review (phase 6) come after it.

## Discovery (phase 4)

```
pg_cron (Mon + Thu 05:00 UTC)
  └─ pg_net POST → Edge Function research-discover   (x-research-secret header)
        └─ runDiscovery()
             ├─ start_research_run()        one run at a time; a run stuck > 30 min is closed as failed
             ├─ for each due source:
             │    fetch feed / API  →  parse  →  keyword pre-filter  →  record_research_update()
             │    mark_research_source_checked()
             └─ finish_research_run()       status, counts, per-source errors, summary
```

| Piece | Where |
|---|---|
| Source list (8: Nature, Nature Ecology & Evolution, Nature Communications, Science, Science Advances, PNAS, OpenAlex, Crossref) | `research_sources` (seeded by migration 4) |
| SQL functions (service role only) | `supabase/migrations/20261118000004_research_discovery.sql` |
| Schedule | `supabase/migrations/20261118000005_research_schedule.sql` |
| Edge Function | `supabase/functions/research-discover/index.ts` |
| Shared logic (Deno + Node) | `supabase/functions/_shared/research/` |
| Tests | `tests/research/` |

### Rules the code follows

- **Official feeds and documented APIs only.** RSS feeds of the journals; Crossref and OpenAlex APIs. No scraping.
- **Contact email only where asked.** `RESEARCH_CONTACT_EMAIL` goes only to Crossref and OpenAlex (their "polite pool"). Journal feeds get a generic client name. A test enforces this.
- **Rate limits respected.** 400 ms between requests to the same API (Crossref allows 3/s), and `429`/`503` responses are retried after `Retry-After` (at most 15 s, twice).
- **Deduplication in the database.** The same publication is stored once whether it is found by DOI, by source + external id, or by normalised URL, and whichever source finds it first.
- **Keyword pre-filter, not a decision.** A publication is stored when its title or abstract has a strong term (hominin, Neanderthal, ancient DNA, Palaeolithic, …) or two context terms plus a human/archaeological anchor. Stored items wait with `analysis_status = 'pending'` for the AI analysis, which can mark them irrelevant.
- **Preprints are flagged.** Repository sources (Zenodo, preprint servers) get `is_peer_reviewed = false`.
- **Failures are visible.** A failing source makes the run `partial` and is listed in `research_runs.errors`; the other sources still run. A response that is not a feed is an error, not an empty success.
- **Scheduled vs manual.** Scheduled runs check sources whose `check_frequency` (3 days) has elapsed; manual runs check every active source. The first check of a source looks back 30 days, later checks overlap the previous one by 3 days.

### Secrets

| Name | Where | Purpose |
|---|---|---|
| `RESEARCH_CRON_SECRET` | Edge Function secret **and** Vault (`research_cron_secret`) | cron → function authentication |
| `research_function_url` | Vault | URL the cron job calls |
| `RESEARCH_CONTACT_EMAIL` | Edge Function secret | Crossref / OpenAlex polite pool |
| `OPENALEX_API_KEY` | Edge Function secret (optional) | OpenAlex refuses most anonymous requests from shared IPs |

Set function secrets with `npx supabase secrets set --env-file <file>` and Vault secrets with `select vault.create_secret('<value>', '<name>', '<description>')`. Never commit either.

### Operating it

```bash
# Deploy after changing the function or its shared code (no Docker needed)
npx supabase functions deploy research-discover --use-api --no-verify-jwt

# Run once now (manual trigger; the admin dashboard will do this in phase 7)
curl -X POST https://<ref>.supabase.co/functions/v1/research-discover \
  -H "x-research-secret: <secret>" -H "Content-Type: application/json" -d '{"trigger":"manual"}'

# Check what the sources return right now, without touching the database
RESEARCH_CONTACT_EMAIL=<email> npm run research:live-check
```

Change the schedule: `select cron.alter_job((select jobid from cron.job where jobname = 'research-discovery'), schedule := '0 5 * * 1,4');`

## Analysis (phase 5)

Every 15 minutes, while publications are pending, pg_cron calls the `research-analyze` Edge Function. It claims two publications (`claim_research_updates`, never the same row twice) and for each:

1. **Triage** (Claude): relevant to the dataset? Which existing records could it affect? Irrelevant → `irrelevant`; nothing affected → `no_change`.
2. **DOI check** (Crossref): the DOI must be registered under the same title (≥ 70 % word overlap). Otherwise → `no_change`, reason recorded, and Claude is not asked for proposals.
3. **Analysis** (Claude): the finding, evidence type, limitations, competing interpretations, and either `no_change` or up to five proposals.
4. **Validation in code** (`analysis/validate.ts`), because model output is never trusted as a database instruction:
   - records exist; new records only as archaeological sites with a free kebab-case id;
   - only whitelisted fields (`analysis/entities.ts`), values of the right type and range, date ranges still ordered;
   - **every value needs an exact quote that occurs in the publication's title or abstract**, so values cannot be invented;
   - the only supporting source is the publication itself, with its verified DOI; Claude cannot add citations;
   - preprints never raise confidence and are scored low; news, reviews and commentary never change anything;
   - changes equal to the current value are dropped. Rejected proposals are kept in `research_updates.analysis.rejected` with the reason.
5. **Storage** (`complete_research_analysis`, one transaction): the publication's status and full analysis, and valid proposals as `update_proposals` with `review_status = 'pending'`. **Nothing reaches the public dataset**; approval is phase 6.

A failed attempt (API error, refusal, timeout) returns the publication to `pending`; after three attempts it is `failed` with the error shown.

### Model and cost

- `claude-opus-5-5`, effort `medium`, structured outputs (`output_config.format`, schemas in `analysis/schemas.ts`), server-side refusal fallback (`fallbacks: "default"`).
- The system prompt (integrity rules + a compact catalog of the dataset) is identical for every publication and cached for an hour; the publication goes in the user message and is treated as data, not instructions.
- Token usage of each call is stored in `research_updates.analysis.usage`.
- Rough cost: a few US cents per triaged publication, roughly 5–15 cents when the full analysis runs. The confidence score is an internal triage signal, not a measure of scientific certainty.

### Secrets

`ANTHROPIC_API_KEY` (Edge Function secret) in addition to the discovery secrets; Vault holds `research_analyze_url`. Without the key the function answers 503 and does nothing.

```bash
npx supabase functions deploy research-analyze --use-api --no-verify-jwt
```

### Tests

`tests/research/analysis.test.ts` runs the whole pipeline against the real SQL functions (PGlite) with a scripted fake model: no API key, no cost. It checks the validation rules, DOI verification, retries, concurrent claims, that the system prompt is cacheable, and that the public dataset is unchanged after analysis.
