/* Manual live check (not part of npm test): fetches every seeded source once and prints what the pre-filter keeps. */
import { fetchPublications } from "../../supabase/functions/_shared/research/adapters.ts";
import { assessRelevance } from "../../supabase/functions/_shared/research/relevance.ts";
import type { ResearchSource } from "../../supabase/functions/_shared/research/types.ts";
import { createTestDb } from "../db/testDb.ts";

const { db } = await createTestDb();
const sources = (await db.query<ResearchSource>("select * from public.research_sources order by name")).rows;
const day = 86_400_000;
const now = new Date();
for (const s of sources) {
  try {
    const pubs = await fetchPublications(s, {
      fetcher: fetch,
      since: new Date(now.getTime() - 30 * day).toISOString().slice(0, 10),
      until: now.toISOString().slice(0, 10),
      contactEmail: process.env.RESEARCH_CONTACT_EMAIL ?? null,
      openAlexApiKey: process.env.OPENALEX_API_KEY ?? null,
    });
    const kept = pubs.filter((p) => assessRelevance(p.title, p.abstract).relevant);
    const withDoi = pubs.filter((p) => p.doi).length;
    console.log(`${s.name.padEnd(28)} ${String(pubs.length).padStart(4)} items, ${String(withDoi).padStart(4)} with DOI, ${String(kept.length).padStart(3)} kept`);
    for (const p of kept.slice(0, 4)) console.log(`    - ${p.title.slice(0, 100)}`);
  } catch (e) {
    console.log(`${s.name.padEnd(28)} ERROR ${(e as Error).message}`);
  }
}
await db.close();
