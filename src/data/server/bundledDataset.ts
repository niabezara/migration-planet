/**
 * The JSON files, bundled into the server build only, as the fallback when
 * the database cannot be used. Client code must never import this module.
 */
import type { RawDataset } from "../db/rawDataset";
import species from "../species.json";
import migrations from "../migrations.json";
import events from "../events.json";
import populations from "../populations.json";
import milestones from "../milestones.json";
import sources from "../sources.json";

export function bundledDataset(): RawDataset {
  return { species, migrations, events, populations, milestones, sources } as unknown as RawDataset;
}
