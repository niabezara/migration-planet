import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAW_DATASET_FILES, type RawDataset } from "@/data/db/rawDataset";

export const DATA_DIR = join(import.meta.dirname, "../../src/data");

/** Reads the six JSON files of the authored dataset. */
export function readRawDataset(dir = DATA_DIR): RawDataset {
  return Object.fromEntries(
    Object.entries(RAW_DATASET_FILES).map(([key, file]) => [key, JSON.parse(readFileSync(join(dir, file), "utf8"))]),
  ) as unknown as RawDataset;
}
