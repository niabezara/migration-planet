/**
 * Feed and API response parsers → Publication. Dependency-free (Deno Edge
 * Functions have no DOMParser), tolerant of RSS 1.0 (RDF), RSS 2.0 and Atom.
 */
import { doiFromUrl, isoDate, normalizeDoi } from "./normalize.ts";
import type { Publication } from "./types.ts";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text content of an XML fragment: CDATA unwrapped, tags stripped, entities decoded, whitespace collapsed. */
export function textContent(s: string): string {
  const unwrapped = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Entities first decoded once (escaped HTML inside RSS), then tags stripped, then decoded again.
  return decodeEntities(decodeEntities(unwrapped).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** All text values of `<tag>` / `<prefix:tag>` inside an XML fragment. */
function fields(xml: string, tag: string): string[] {
  const re = new RegExp(`<(${escape(tag)})(?:\\s[^>]*)?>([\\s\\S]*?)</\\1>`, "gi");
  return [...xml.matchAll(re)].map((m) => textContent(m[2])).filter(Boolean);
}
const field = (xml: string, ...tags: string[]) => tags.map((t) => fields(xml, t)[0]).find(Boolean) ?? null;

/** RSS 1.0/2.0 items or Atom entries. */
export function parseFeed(xml: string, journal: string | null): Publication[] {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  return blocks
    .map((b): Publication | null => {
      const title = field(b, "dc:title", "title");
      if (!title) return null;
      const atomLink = b.match(/<link\b[^>]*href="([^"]+)"/i)?.[1];
      const url = field(b, "prism:url", "link") ?? (atomLink ? decodeEntities(atomLink) : null);
      const guid = field(b, "guid", "id") ?? b.match(/rdf:about="([^"]+)"/)?.[1] ?? null;
      const doi = normalizeDoi(field(b, "prism:doi")) ?? normalizeDoi(field(b, "dc:identifier")) ?? doiFromUrl(url) ?? doiFromUrl(guid);
      const creators = fields(b, "dc:creator").concat(fields(b, "author").map((a) => field(a, "name") ?? a));
      const description = field(b, "description", "content:encoded", "summary", "content");
      const type = field(b, "dc:type");
      return {
        externalId: guid,
        doi,
        title,
        url,
        authors: creators.length ? creators.join(", ") : null,
        journal: field(b, "prism:publicationName") ?? journal,
        abstract: description,
        publicationDate: isoDate(field(b, "dc:date", "pubDate", "prism:coverDate", "published", "updated")),
        isPeerReviewed: null,
        metadata: type ? { articleType: type } : {},
      };
    })
    .filter((p): p is Publication => p !== null);
}

/** OpenAlex stores abstracts as an inverted index: word → positions. */
export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  const text = words.filter((w) => w !== undefined).join(" ").trim();
  return text || null;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped API JSON, narrowed field by field below
type Json = any;

export function parseOpenAlex(body: Json): Publication[] {
  return (body?.results ?? [])
    .filter((w: Json) => w?.title && !w.is_retracted)
    .map((w: Json): Publication => {
      const source = w.primary_location?.source;
      const sourceType: string | undefined = source?.type;
      return {
        externalId: w.id ?? null,
        doi: normalizeDoi(w.doi),
        title: textContent(w.title),
        url: w.primary_location?.landing_page_url ?? w.doi ?? null,
        authors:
          (w.authorships ?? [])
            .map((a: Json) => a?.author?.display_name)
            .filter(Boolean)
            .slice(0, 12)
            .join(", ") || null,
        journal: source?.display_name ?? null,
        abstract: abstractFromInvertedIndex(w.abstract_inverted_index),
        publicationDate: isoDate(w.publication_date),
        // A journal is not proof of peer review, but a repository (preprint server, Zenodo) is proof of its absence.
        isPeerReviewed: sourceType === "journal" ? true : sourceType === "repository" ? false : null,
        metadata: { openalexId: w.id, sourceType: sourceType ?? null, workType: w.type ?? null },
      };
    });
}

export function parseCrossref(body: Json): Publication[] {
  return (body?.message?.items ?? [])
    .filter((it: Json) => it?.title?.[0])
    .map((it: Json): Publication => {
      const parts: number[] | undefined = (it.published ?? it["published-online"] ?? it["published-print"] ?? it.issued)?.["date-parts"]?.[0];
      const date = parts?.length ? [parts[0], parts[1] ?? 1, parts[2] ?? 1].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-") : null;
      return {
        externalId: it.DOI ?? null,
        doi: normalizeDoi(it.DOI),
        title: textContent(it.title[0]),
        url: it.URL ?? null,
        authors:
          (it.author ?? [])
            .map((a: Json) => [a.given, a.family].filter(Boolean).join(" ") || a.name)
            .filter(Boolean)
            .slice(0, 12)
            .join(", ") || null,
        journal: it["container-title"]?.[0] ?? null,
        abstract: it.abstract ? textContent(it.abstract) : null,
        publicationDate: date,
        isPeerReviewed: it.type === "posted-content" ? false : null,
        metadata: { crossrefType: it.type ?? null },
      };
    });
}
