/**
 * Fetches publications from one monitored source. Only official feeds and
 * documented APIs; one request at a time per source, with timeouts.
 *
 * Contact details go only to the scholarly APIs that ask for them (Crossref,
 * OpenAlex "polite pool"); journal RSS feeds get a generic client name.
 */
import { parseCrossref, parseFeed, parseOpenAlex } from "./parsers.ts";
import type { Fetcher, Publication, ResearchSource } from "./types.ts";

export interface AdapterOptions {
  fetcher: Fetcher;
  /** Only publications from this date on (YYYY-MM-DD) are requested from APIs. */
  since: string;
  until: string;
  contactEmail?: string | null;
  openAlexApiKey?: string | null;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const CLIENT = "migration-planet-research/0.1";
const TIMEOUT_MS = 20_000;
/** Gap between consecutive requests to the same API (Crossref's polite pool allows 3 per second). */
const PACE_MS = 400;
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 15_000;

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET with a timeout; on 429/503 waits (Retry-After, capped) and retries a couple of times. */
async function get(opts: AdapterOptions, url: string, withContact: boolean): Promise<Response> {
  const sleep = opts.sleep ?? realSleep;
  const ua = withContact && opts.contactEmail ? `${CLIENT} (mailto:${opts.contactEmail})` : CLIENT;
  for (let attempt = 0; ; attempt++) {
    const res = await opts.fetcher(url, { headers: { "User-Agent": ua, Accept: "*/*" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return res;
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      await sleep(Math.min(MAX_RETRY_WAIT_MS, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  }
}

async function fromRss(source: ResearchSource, opts: AdapterOptions): Promise<Publication[]> {
  if (!source.feed_url) throw new Error("RSS source without feed_url");
  const xml = await (await get(opts, source.feed_url, false)).text();
  const items = parseFeed(xml, source.name);
  if (items.length === 0 && !/<(?:rss|rdf:RDF|feed)\b/i.test(xml)) throw new Error("response is not an RSS or Atom feed");
  return items;
}

async function fromOpenAlex(source: ResearchSource, opts: AdapterOptions): Promise<Publication[]> {
  const cfg = source.configuration as { search?: string; maxPages?: number };
  if (!source.api_endpoint || !cfg.search) throw new Error("OpenAlex source needs api_endpoint and configuration.search");
  const out: Publication[] = [];
  let cursor = "*";
  for (let page = 0; page < (cfg.maxPages ?? 3) && cursor; page++) {
    if (page > 0) await (opts.sleep ?? realSleep)(PACE_MS);
    const u = new URL(source.api_endpoint);
    u.searchParams.set("filter", `title_and_abstract.search:${cfg.search},from_publication_date:${opts.since},to_publication_date:${opts.until},type:article`);
    u.searchParams.set("per-page", "100");
    u.searchParams.set("cursor", cursor);
    if (opts.contactEmail) u.searchParams.set("mailto", opts.contactEmail);
    if (opts.openAlexApiKey) u.searchParams.set("api_key", opts.openAlexApiKey);
    const body = await (await get(opts, u.toString(), true)).json();
    out.push(...parseOpenAlex(body));
    cursor = body?.meta?.next_cursor ?? "";
  }
  return out;
}

async function fromCrossref(source: ResearchSource, opts: AdapterOptions): Promise<Publication[]> {
  const cfg = source.configuration as { queries?: string[]; rows?: number };
  if (!source.api_endpoint || !cfg.queries?.length) throw new Error("Crossref source needs api_endpoint and configuration.queries");
  const out: Publication[] = [];
  for (const [i, q] of cfg.queries.entries()) {
    if (i > 0) await (opts.sleep ?? realSleep)(PACE_MS);
    const u = new URL(source.api_endpoint);
    u.searchParams.set("query.bibliographic", q);
    // Publication date, not index date: re-indexed old articles would otherwise reappear.
    u.searchParams.set("filter", `from-pub-date:${opts.since},until-pub-date:${opts.until},type:journal-article`);
    u.searchParams.set("rows", String(cfg.rows ?? 40));
    u.searchParams.set("select", "DOI,title,URL,author,container-title,abstract,published,published-online,published-print,issued,type");
    if (opts.contactEmail) u.searchParams.set("mailto", opts.contactEmail);
    out.push(...parseCrossref(await (await get(opts, u.toString(), true)).json()));
  }
  return out;
}

export function fetchPublications(source: ResearchSource, opts: AdapterOptions): Promise<Publication[]> {
  if (source.source_type === "rss") return fromRss(source, opts);
  const adapter = (source.configuration as { adapter?: string }).adapter;
  if (source.source_type === "api" && adapter === "openalex") return fromOpenAlex(source, opts);
  if (source.source_type === "api" && adapter === "crossref") return fromCrossref(source, opts);
  return Promise.reject(new Error(`no adapter for ${source.source_type} source "${source.name}"`));
}
