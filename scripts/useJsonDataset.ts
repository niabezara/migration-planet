/** Side-effect import for scripts: installs the JSON files as the current dataset in @/data. */
import { buildDataset, installDataset } from "@/data";
import { readRawDataset } from "./db/readRawDataset";

installDataset(buildDataset(readRawDataset()), "json-files");
