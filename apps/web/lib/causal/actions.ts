'use server';

// =============================================================================
// HSIN Phase 11 — Causal Intelligence & Narrative Replay server actions.
// 'use server'.
//
// THIN wrappers over the Phase-11 DAL (lib/causal/persistence.ts). They return
// DbResult and revalidate the relevant dashboards. They NEVER throw (the DAL
// already returns DbResult).
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-11 UI (the causal /
// replay / milestone consoles + the signal-detail causal integration + the
// WorldForge timeline bridge) is built against exactly these names — do not
// rename them.
//
// SERVER-ONLY: this module imports next/headers (transitively via the DAL) and
// must never be imported by a client component — it is reachable only via these
// actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  demoCausal,
  explainNarrativeChange,
  getCausal,
  getCausalHighlights,
  getMilestones,
  getNarrativeCausal,
  getReplay,
  getWorldforgeTimeline,
  rebuildCausal,
  type CausalFilters,
  type DbResult,
  type RebuildCausalSummary,
} from './persistence';

// -----------------------------------------------------------------------------
// Routes revalidated after a rebuild (best-effort; safe if absent).
// -----------------------------------------------------------------------------
const CAUSAL_ROUTE = '/causal';
const REPLAY_ROUTE = '/causal/replay';
const MILESTONES_ROUTE = '/causal/milestones';
const INTELLIGENCE_ROUTE = '/intelligence';
const TEMPORAL_ROUTE = '/temporal';
const OPERATIONS_ROUTE = '/operations';
const GRAPH_ROUTE = '/operations/graph';

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

/** Causal view (events + chains over narratives), optionally filtered. */
export async function getCausalAction(filters?: CausalFilters) {
  return getCausal(filters);
}

/** Derived (non-persisted) natural-language explanation of a narrative's change. */
export async function explainNarrativeChangeAction(narrativeId: string) {
  return explainNarrativeChange(narrativeId);
}

/** Replay view (ordered frames + milestones) for one narrative. */
export async function getReplayAction(narrativeId: string) {
  return getReplay(narrativeId);
}

/** Milestones view (life-cycle markers), optionally scoped to one narrative. */
export async function getMilestonesAction(narrativeId?: string) {
  return getMilestones(narrativeId);
}

/** Headline causal callouts for the dashboard. */
export async function getCausalHighlightsAction() {
  return getCausalHighlights();
}

/** The full causal bundle for one narrative (signal-detail / WorldForge bridge). */
export async function getNarrativeCausalAction(narrativeId: string) {
  return getNarrativeCausal(narrativeId);
}

/** The WorldForge narrative timeline (epochs + turning points + counterfactuals). */
export async function getWorldforgeTimelineAction(narrativeId: string) {
  return getWorldforgeTimeline(narrativeId);
}

/** Labeled, non-persisted demo view-models for the empty-env / showcase path. */
export async function demoCausalAction() {
  return demoCausal();
}

// =============================================================================
// REBUILD (researcher+)
// =============================================================================

/**
 * Rebuild the entire causal + replay layer (researcher+). Passes a SERVER
 * timestamp into the deterministic engine (the engine never calls Date.now()),
 * runs the end-to-end events → chains → replay frames → milestones chain, and
 * persists the results. Revalidates the causal + intelligence/operations routes.
 * NEVER throws.
 */
export async function rebuildCausalAction(): Promise<
  DbResult<RebuildCausalSummary>
> {
  const now = new Date().toISOString();
  const result = await rebuildCausal(now);
  if (result.ok) {
    revalidate(
      CAUSAL_ROUTE,
      REPLAY_ROUTE,
      MILESTONES_ROUTE,
      INTELLIGENCE_ROUTE,
      TEMPORAL_ROUTE,
      OPERATIONS_ROUTE,
      GRAPH_ROUTE,
    );
  }
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-11 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  CausalFilters,
  RebuildCausalSummary,
  NarrativeCausalBundle,
  CausalDemoViews,
} from './persistence';
export type {
  // Records.
  HsinCausalEventRecord,
  HsinCausalChainRecord,
  HsinCausalChainEventRecord,
  HsinReplayFrameRecord,
  HsinNarrativeMilestoneRecord,
  HsinNarrativeRecord,
  // View-models.
  CausalView,
  ReplayView,
  MilestonesView,
  CausalExplanation,
  CausalHighlights,
  WorldforgeTimeline,
  // Unions.
  CausalEventType,
  MilestoneType,
} from '@hsi/shared-types';
