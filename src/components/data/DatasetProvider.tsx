"use client";

import { Fragment, type ReactNode } from "react";
import { buildDataset, datasetVersion, installDataset } from "@/data";
import type { RawDataset } from "@/data/db/rawDataset";

/**
 * Installs the server-provided dataset into `@/data` before its children
 * render (on the server for SSR and in the browser). Idempotent per version;
 * a new version (an approved change) remounts the subtree so GPU buffers and
 * memoised lookups are rebuilt from the new data.
 */
export function DatasetProvider({ raw, version, children }: { raw: RawDataset; version: string; children: ReactNode }) {
  if (datasetVersion() !== version) installDataset(buildDataset(raw), version);
  return <Fragment key={version}>{children}</Fragment>;
}
