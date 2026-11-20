import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { envTableReader, loadPublicDataset, type PublicDataset } from "./loadPublicDataset";

/** Cache tag of the public dataset; approving a proposal invalidates it (phase 6). */
export const DATASET_CACHE_TAG = "dataset";

/**
 * The public dataset, cached on the server. Prerendered into the static shell
 * at build time and refreshed hourly, or immediately when the tag is
 * invalidated. A fallback to the bundled files is cached only briefly, so the
 * site returns to the database as soon as it is reachable again.
 */
export async function getPublicDataset(): Promise<PublicDataset> {
  "use cache";
  cacheTag(DATASET_CACHE_TAG);
  const result = await loadPublicDataset(envTableReader());
  if (result.origin === "bundled") {
    cacheLife("minutes");
    console.warn(`[dataset] using the bundled JSON files: ${result.fallbackReason}`);
  } else {
    cacheLife("hours");
  }
  return result;
}
