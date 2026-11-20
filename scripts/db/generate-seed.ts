/* Writes supabase/seed.sql from src/data/*.json. Run: npm run db:seed */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { toSeedSql } from "@/data/db/toSeedSql";
import { readRawDataset } from "./readRawDataset";

const out = join(import.meta.dirname, "../../supabase/seed.sql");
const sql = toSeedSql(readRawDataset());
writeFileSync(out, sql);
console.log(`Wrote ${out} (${(sql.length / 1024).toFixed(0)} KB)`);
