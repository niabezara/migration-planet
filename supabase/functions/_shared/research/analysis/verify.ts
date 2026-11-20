/**
 * Checks that a publication's DOI is registered with Crossref under the title
 * we found it with, so a proposal never rests on a mislabelled or invented
 * identifier.
 */
import type { Fetcher } from "../types.ts";
import type { DoiVerification } from "./types.ts";

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

/** Share of the shorter title's words found in the other title (0..1). */
export function titleSimilarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  let hits = 0;
  for (const w of small) if (large.has(w)) hits++;
  return hits / small.size;
}

const MIN_SIMILARITY = 0.7;

export async function verifyDoi(
  doi: string | null,
  title: string,
  fetcher: Fetcher,
  contactEmail?: string | null,
): Promise<DoiVerification> {
  if (!doi) return { status: "no_doi" };
  const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (contactEmail) url.searchParams.set("mailto", contactEmail);
  try {
    const res = await fetcher(url.toString(), {
      headers: { "User-Agent": `migration-planet-research/0.1${contactEmail ? ` (mailto:${contactEmail})` : ""}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error", message: `HTTP ${res.status} from Crossref` };
    const work = (await res.json())?.message;
    const crossrefTitle: string | null = work?.title?.[0] ?? null;
    const similarity = crossrefTitle ? titleSimilarity(title, crossrefTitle) : 0;
    return {
      status: similarity >= MIN_SIMILARITY ? "verified" : "mismatch",
      crossrefTitle,
      crossrefJournal: work?.["container-title"]?.[0] ?? null,
      crossrefType: work?.type ?? null,
      similarity: Math.round(similarity * 100) / 100,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
