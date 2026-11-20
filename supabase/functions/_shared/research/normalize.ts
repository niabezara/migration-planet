/** Identifiers used for deduplication. */

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

/** Lower-case bare DOI ("10.1038/..."), or null if `input` does not contain a valid one. */
export function normalizeDoi(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // keep as is
  }
  s = s.replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i, "").replace(/[.,;)\]]+$/, "").toLowerCase();
  return DOI_PATTERN.test(s) ? s : null;
}

/** DOI embedded in a publisher URL (".../doi/abs/10.1126/science.x?af=R"). */
export function doiFromUrl(url: string | null | undefined): string | null {
  const m = url?.match(/(?:doi\.org\/|\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?)(10\.\d{4,9}\/[^?#\s]+)/i);
  return m ? normalizeDoi(m[1]) : null;
}

/**
 * Comparable URL: https, lower-case host without "www.", no query string,
 * fragment or trailing slash. Feed tracking parameters (?af=R, utm_*) vanish.
 */
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `https://${host}${path}`;
  } catch {
    return null;
  }
}

/** Stable hash of what identifies a publication's content (SHA-256, hex). */
export async function contentHash(title: string, doi: string | null): Promise<string> {
  const text = `${doi ?? ""}|${title.toLowerCase().replace(/\s+/g, " ").trim()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** YYYY-MM-DD from common feed date formats, or null. */
export function isoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
