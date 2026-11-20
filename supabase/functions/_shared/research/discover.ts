/**
 * One discovery run: check each due source, keep relevant new publications,
 * record everything about the run. Idempotent: running it again stores
 * nothing twice (deduplication happens in the database). It never creates
 * proposals; that is the analysis step's job.
 */
import { fetchPublications } from "./adapters.ts";
import { contentHash, doiFromUrl, normalizeUrl } from "./normalize.ts";
import { assessRelevance } from "./relevance.ts";
import type { DiscoveredItem, DiscoveryStore, Fetcher, ResearchSource, RunError, RunResult, RunTrigger } from "./types.ts";

export interface DiscoveryOptions {
  trigger: RunTrigger;
  retryOf?: string | null;
  fetcher: Fetcher;
  now?: Date;
  contactEmail?: string | null;
  openAlexApiKey?: string | null;
  sleep?: (ms: number) => Promise<void>;
}

const DAY = 86_400_000;
/** First check of a source looks back this far; later checks overlap the previous one by a few days. */
const FIRST_LOOKBACK_DAYS = 30;
const OVERLAP_DAYS = 3;

/** Postgres interval text ("3 days", "3 days 12:00:00", "84:00:00") → milliseconds. */
export function intervalMs(interval: string): number {
  const days = Number(interval.match(/(\d+)\s+days?/)?.[1] ?? 0);
  const [h, m, s] = (interval.match(/(\d+):(\d{2}):(\d{2})/)?.slice(1) ?? ["0", "0", "0"]).map(Number);
  return days * DAY + ((h * 60 + m) * 60 + s) * 1000;
}

/** Scheduled runs check sources whose interval has elapsed; manual runs check every active source. */
export function isDue(source: ResearchSource, trigger: RunTrigger, now: Date): boolean {
  if (!source.is_active) return false;
  if (trigger !== "scheduled" || !source.last_checked_at) return true;
  // One hour of slack so a twice-weekly cron is not skipped by a few minutes of drift.
  return Date.parse(source.last_checked_at) + intervalMs(source.check_frequency) <= now.getTime() + 3_600_000;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function runDiscovery(store: DiscoveryStore, opts: DiscoveryOptions): Promise<RunResult | null> {
  const now = opts.now ?? new Date();
  const runId = await store.startRun(opts.trigger, opts.retryOf ?? null);
  if (!runId) return null; // another run is in progress

  const errors: RunError[] = [];
  let sourcesChecked = 0;
  let discovered = 0;
  let candidates = 0;
  try {
    const sources = (await store.activeSources()).filter((s) => isDue(s, opts.trigger, now));
    for (const source of sources) {
      try {
        const lastChecked = source.last_checked_at ? new Date(source.last_checked_at) : null;
        const since = lastChecked ? new Date(lastChecked.getTime() - OVERLAP_DAYS * DAY) : new Date(now.getTime() - FIRST_LOOKBACK_DAYS * DAY);
        const publications = await fetchPublications(source, {
          fetcher: opts.fetcher,
          since: ymd(since),
          until: ymd(now),
          contactEmail: opts.contactEmail,
          openAlexApiKey: opts.openAlexApiKey,
          sleep: opts.sleep,
        });
        for (const p of publications) {
          const { relevant, matchedTerms } = assessRelevance(p.title, p.abstract);
          if (!relevant) continue;
          candidates++;
          const doi = p.doi ?? doiFromUrl(p.url);
          const item: DiscoveredItem = {
            ...p,
            doi,
            normalizedUrl: normalizeUrl(doi ? `https://doi.org/${doi}` : p.url),
            contentHash: await contentHash(p.title, doi),
            metadata: { ...p.metadata, matchedTerms, sourceName: source.name },
          };
          if (await store.recordUpdate(source.id, runId, item)) discovered++;
        }
        await store.markChecked(source.id);
        sourcesChecked++;
      } catch (e) {
        errors.push({ source: source.name, message: e instanceof Error ? e.message : String(e) });
      }
    }
    const status: RunResult["status"] = errors.length === 0 ? "succeeded" : sourcesChecked > 0 ? "partial" : sources.length ? "failed" : "succeeded";
    const summary =
      `${sourcesChecked}/${sources.length} sources checked, ${candidates} relevant candidates, ${discovered} new publications` +
      (errors.length ? `, ${errors.length} source error(s)` : "");
    const result = { status, sourcesChecked, publicationsDiscovered: discovered, errors, summary };
    await store.finishRun(runId, result);
    return { runId, candidatesSeen: candidates, ...result };
  } catch (e) {
    // Store or programming error: close the run so the next one is not blocked.
    errors.push({ message: e instanceof Error ? e.message : String(e) });
    const result = { status: "failed" as const, sourcesChecked, publicationsDiscovered: discovered, errors, summary: "run aborted" };
    await store.finishRun(runId, result).catch(() => undefined);
    return { runId, candidatesSeen: candidates, ...result };
  }
}
