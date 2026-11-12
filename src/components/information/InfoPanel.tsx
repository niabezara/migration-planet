"use client";

import { useHistoryStore } from "@/stores/useHistoryStore";
import { RoutePanel } from "./RoutePanel";
import { resolveEntity } from "./EntityPanels";

/** The right-side panel: one entity at a time (route, species, milestone, site, population, period). */
export function InfoPanel() {
  const selection = useHistoryStore((s) => s.selection);
  if (!selection) return null;
  if (selection.kind === "route") return <RoutePanel />;
  return resolveEntity(selection.kind, selection.id);
}
