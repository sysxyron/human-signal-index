'use server';

// =============================================================================
// HSIN Phase 16 — Calibration & Trust server actions. 'use server'.
//
// THIN wrappers over the Phase-16 DAL (lib/calibration/persistence.ts). They
// return DbResult and revalidate the relevant dashboards. They NEVER throw (the
// DAL already returns DbResult).
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-16 UI (the calibration
// dashboard + detail view, the trust dashboard + detail view, and the decisions
// widgets) is built against exactly these names — do not rename them.
//
// SERVER-ONLY: this module imports next/headers (transitively via the DAL) and
// must never be imported by a client component — it is reachable only via these
// actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  confidenceMeaningFor,
  demoCalibration,
  demoTrust,
  getBrierScores,
  getCalibration,
  getCalibrationDashboard,
  getCalibrationHighlights,
  getTrust,
  getTrustDashboard,
  listCalibrationSnapshots,
  overrideTrust,
  recomputeCalibration,
  recomputeTrust,
  type CalibrationDemoViews,
  type ConfidenceMeaning,
  type DbResult,
  type OverrideTrustResult,
  type RecomputeCalibrationSummary,
  type RecomputeTrustSummary,
  type TrustDemoViews,
} from './persistence';
import type {
  CalibrationDashboardData,
  CalibrationHighlights,
  CalibrationView,
  HsinBrierScoreRecord,
  HsinCalibrationSnapshotRecord,
  TrustDashboardData,
  TrustEntityType,
  TrustView,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Routes revalidated after a write (best-effort; safe if absent).
// -----------------------------------------------------------------------------
const CALIBRATION_ROUTE = '/calibration';
const TRUST_ROUTE = '/trust';
const DECISIONS_ROUTE = '/decisions';

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

/** The calibration dashboard: latest snapshot + curves + Brier + drift + trend. */
export async function getCalibrationDashboardAction(): Promise<
  DbResult<CalibrationDashboardData>
> {
  return getCalibrationDashboard();
}

/** A single calibration view: one snapshot + its curves + Brier + drift. */
export async function getCalibrationAction(
  id: string,
): Promise<DbResult<CalibrationView>> {
  return getCalibration(id);
}

/** List calibration snapshots (most recent first). */
export async function listCalibrationSnapshotsAction(): Promise<
  DbResult<HsinCalibrationSnapshotRecord[]>
> {
  return listCalibrationSnapshots();
}

/** The standalone Brier scores (most recent first). */
export async function getBrierScoresAction(): Promise<
  DbResult<HsinBrierScoreRecord[]>
> {
  return getBrierScores();
}

/** Headline calibration/trust callouts (ECE / Brier / drift kind / avg trust). */
export async function getCalibrationHighlightsAction(): Promise<
  DbResult<CalibrationHighlights>
> {
  return getCalibrationHighlights();
}

/** The trust dashboard: trust rows across sources / narratives / forecasts / decisions. */
export async function getTrustDashboardAction(): Promise<
  DbResult<TrustDashboardData>
> {
  return getTrustDashboard();
}

/** A single trust view for one entity (its score/band/history/explanation/override). */
export async function getTrustAction(
  entityType: TrustEntityType,
  entityId: string,
): Promise<DbResult<TrustView>> {
  return getTrust(entityType, entityId);
}

/** "What does X% confidence actually mean?" — grounded in the latest curve. */
export async function confidenceMeaningForAction(
  confidence: number,
): Promise<DbResult<ConfidenceMeaning>> {
  return confidenceMeaningFor(confidence);
}

/** Labeled, non-persisted CALIBRATION demo view-models (empty-env / showcase). */
export async function demoCalibrationAction(): Promise<
  DbResult<CalibrationDemoViews>
> {
  return demoCalibration();
}

/** Labeled, non-persisted TRUST demo view-models (empty-env / showcase). */
export async function demoTrustAction(): Promise<DbResult<TrustDemoViews>> {
  return demoTrust();
}

// =============================================================================
// WRITES
// =============================================================================

/**
 * Recompute the overall calibration (curator/admin): loadPredictions → calibrate
 * + Brier + drift → persist a new snapshot + curves + Brier + drift rows.
 * Revalidates the calibration + decisions routes. NEVER throws.
 */
export async function recomputeCalibrationAction(): Promise<
  DbResult<RecomputeCalibrationSummary>
> {
  const result = await recomputeCalibration(new Date().toISOString());
  if (result.ok) {
    revalidate(CALIBRATION_ROUTE, DECISIONS_ROUTE);
  }
  return result;
}

/**
 * Recompute the trust scores across sources / narratives / forecasts / decisions
 * (curator/admin). Preserves manual overrides. Revalidates the trust + decisions
 * routes. NEVER throws.
 */
export async function recomputeTrustAction(): Promise<
  DbResult<RecomputeTrustSummary>
> {
  const result = await recomputeTrust(new Date().toISOString());
  if (result.ok) {
    revalidate(TRUST_ROUTE, DECISIONS_ROUTE);
  }
  return result;
}

/**
 * Apply a human OVERRIDE to a trust score (curator/admin; REQUIRES a non-blank
 * reason). Revalidates the trust + decisions routes. NEVER throws.
 */
export async function overrideTrustAction(
  entityType: TrustEntityType,
  entityId: string,
  newScore: number,
  reason: string,
): Promise<DbResult<OverrideTrustResult>> {
  const result = await overrideTrust(entityType, entityId, newScore, reason);
  if (result.ok) {
    revalidate(TRUST_ROUTE, DECISIONS_ROUTE);
  }
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-16 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  RecomputeCalibrationSummary,
  RecomputeTrustSummary,
  OverrideTrustResult,
  CalibrationDemoViews,
  TrustDemoViews,
  ConfidenceMeaning,
} from './persistence';
export type {
  // Records.
  HsinCalibrationSnapshotRecord,
  HsinReliabilityCurveRecord,
  HsinBrierScoreRecord,
  HsinConfidenceDriftRecord,
  HsinSourceTrustRecord,
  HsinNarrativeTrustRecord,
  HsinDecisionTrustRecord,
  HsinForecastTrustRecord,
  // View-models.
  CalibrationDashboardData,
  CalibrationView,
  TrustDashboardData,
  TrustView,
  CalibrationHighlights,
  // Unions.
  ConfidenceDriftKind,
  CalibrationQuality,
  TrustBand,
  TrustEntityType,
} from '@hsi/shared-types';
