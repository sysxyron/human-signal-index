'use server';

// =============================================================================
// HSIN Phase 10 — Temporal Intelligence server actions ('use server').
//
// THIN wrappers over the Phase-10 DAL (lib/temporal/persistence.ts). They return
// DbResult and revalidate the relevant dashboards. They NEVER throw (the DAL
// already returns DbResult).
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-10 UI (the temporal
// intelligence consoles — evolution / genealogy / influence / forecast) is built
// against exactly these names — do not rename them.
//
// SERVER-ONLY: this module imports next/headers (transitively via the DAL) and
// must never be imported by a client component — it is reachable only via these
// actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  demoTemporal,
  getEvolution,
  getForecast,
  getGenealogy,
  getInfluence,
  getNarrativeHistory,
  getTemporalHighlights,
  rebuildTemporal,
  type DbResult,
  type EvolutionFilters,
  type RebuildTemporalSummary,
  type TemporalDemoViews,
} from './persistence';

// -----------------------------------------------------------------------------
// Routes revalidated after a rebuild (best-effort; safe if absent).
// -----------------------------------------------------------------------------
const TEMPORAL_ROUTE = '/temporal';
const EVOLUTION_ROUTE = '/temporal/evolution';
const GENEALOGY_ROUTE = '/temporal/genealogy';
const INFLUENCE_ROUTE = '/temporal/influence';
const FORECAST_ROUTE = '/temporal/forecast';
const OPERATIONS_ROUTE = '/operations';
const GRAPH_ROUTE = '/operations/graph';
const INTELLIGENCE_ROUTE = '/intelligence';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // revalidatePath throws outside a request scope — ignore (best-effort).
    }
  }
}

// =============================================================================
// READS
// =============================================================================

/** Evolution view (snapshots + typed changes), optionally filtered. */
export async function getEvolutionAction(filters?: EvolutionFilters) {
  return getEvolution(filters);
}

/** Genealogy view (narrative lineage edges). */
export async function getGenealogyAction() {
  return getGenealogy();
}

/** Influence view (directed influence network). */
export async function getInfluenceAction() {
  return getInfluence();
}

/** Forecast view (latest probabilistic forecast per narrative). */
export async function getForecastAction() {
  return getForecast();
}

/** Headline temporal callouts for the dashboard. */
export async function getTemporalHighlightsAction() {
  return getTemporalHighlights();
}

/** The full temporal history bundle for one narrative (WorldForge fusion bridge). */
export async function getNarrativeHistoryAction(narrativeId: string) {
  return getNarrativeHistory(narrativeId);
}

/** Labeled, non-persisted demo view-models for the empty-env / showcase path. */
export async function demoTemporalAction() {
  return demoTemporal();
}

// =============================================================================
// REBUILD (researcher+)
// =============================================================================

/**
 * Rebuild the entire temporal layer (researcher+). Passes a SERVER timestamp into
 * the deterministic engine (the engine never calls Date.now()), runs the end-to-end
 * snapshot → evolution → genealogy → influence → forecast chain, and persists the
 * results. Revalidates the temporal + intelligence/operations routes. NEVER throws.
 */
export async function rebuildTemporalAction(): Promise<
  DbResult<RebuildTemporalSummary>
> {
  const now = new Date().toISOString();
  const result = await rebuildTemporal(now);
  if (result.ok) {
    revalidate(
      TEMPORAL_ROUTE,
      EVOLUTION_ROUTE,
      GENEALOGY_ROUTE,
      INFLUENCE_ROUTE,
      FORECAST_ROUTE,
      INTELLIGENCE_ROUTE,
      OPERATIONS_ROUTE,
      GRAPH_ROUTE,
    );
  }
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-10 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  EvolutionFilters,
  RebuildTemporalSummary,
  TemporalDemoViews,
} from './persistence';
export type {
  // Records.
  HsinNarrativeSnapshotRecord,
  HsinNarrativeEvolutionRecord,
  HsinNarrativeGenealogyRecord,
  HsinNarrativeInfluenceRecord,
  HsinNarrativeForecastRecord,
  HsinNarrativeRecord,
  // View-models.
  EvolutionView,
  GenealogyView,
  InfluenceView,
  ForecastView,
  TemporalHighlights,
  NarrativeHistory,
  // Unions.
  NarrativeChangeType,
  NarrativeGenealogyRelationship,
  NarrativeForecastState,
  SnapshotCadence,
} from '@hsi/shared-types';
