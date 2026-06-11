'use server';

// =============================================================================
// HSIN Phase 17 — Public Trust, Recalibration & Governance server actions.
// 'use server'.
//
// THIN wrappers over the Phase-17 DAL (lib/trust/persistence.ts). They return
// DbResult and revalidate the relevant dashboards. They NEVER throw (the DAL
// already returns DbResult).
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-17 UI (trust history,
// public trust, proposals + detail, drift) is built against exactly these names.
//
// SERVER-ONLY: imports next/headers (transitively via the DAL); never import from
// a client component — reachable only via these actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  createRecalibrationProposal,
  decideRecalibrationProposal,
  getPublicTrust,
  getRecalibrationProposal,
  getRecalibrationQueue,
  getTrustDriftDashboard,
  getTrustGovernanceHighlights,
  getTrustHistoryDashboard,
  getTrustHistoryFor,
  publishTrust,
  recordTrustHistory,
  type CreateProposalResult,
  type DbResult,
  type DecisionResult,
  type PublishTrustResult,
  type RecordTrustHistorySummary,
} from './persistence';
import type { RecalibrationTrigger } from '@hsi/recalibration-engine';
import type {
  ProposalStatus,
  PublicTrustData,
  RecalibrationProposalView,
  RecalibrationQueueData,
  TrustDriftDashboardData,
  TrustEntityType,
  TrustGovernanceHighlights,
  TrustHistoryDashboardData,
  TrustHistoryView,
  TrustReportType,
} from '@hsi/shared-types';

const HISTORY_ROUTE = '/dashboard/trust/history';
const PUBLIC_ROUTE = '/dashboard/trust/public';
const PROPOSALS_ROUTE = '/dashboard/trust/proposals';
const DRIFT_ROUTE = '/dashboard/trust/drift';
const TRUST_ROUTE = '/dashboard/trust';

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

/** The trust-history dashboard: per-entity rows + drift timeline. */
export async function getTrustHistoryDashboardAction(): Promise<
  DbResult<TrustHistoryDashboardData>
> {
  return getTrustHistoryDashboard();
}

/** A single entity's trust-history view: snapshots + trend + drift + provenance. */
export async function getTrustHistoryForAction(
  entityType: TrustEntityType,
  entityId: string,
): Promise<DbResult<TrustHistoryView>> {
  return getTrustHistoryFor(entityType, entityId, { now: new Date().toISOString() });
}

/** The trust-drift dashboard: drift events + severity/kind breakdowns. */
export async function getTrustDriftDashboardAction(): Promise<
  DbResult<TrustDriftDashboardData>
> {
  return getTrustDriftDashboard();
}

/** The recalibration proposal queue (optionally filtered by status). */
export async function getRecalibrationQueueAction(
  status?: ProposalStatus,
): Promise<DbResult<RecalibrationQueueData>> {
  return getRecalibrationQueue(status);
}

/** A single recalibration proposal + review summary + decision history. */
export async function getRecalibrationProposalAction(
  id: string,
): Promise<DbResult<RecalibrationProposalView>> {
  return getRecalibrationProposal(id, { now: new Date().toISOString() });
}

/** The public trust surface: every entity, transparently. */
export async function getPublicTrustAction(): Promise<DbResult<PublicTrustData>> {
  return getPublicTrust({ now: new Date().toISOString() });
}

/** Headline Phase-17 governance callouts. */
export async function getTrustGovernanceHighlightsAction(): Promise<
  DbResult<TrustGovernanceHighlights>
> {
  return getTrustGovernanceHighlights();
}

// =============================================================================
// WRITES
// =============================================================================

/**
 * Record trust-history snapshots from the current Phase-16 trust tables
 * (curator/admin). APPEND-ONLY. Revalidates the history + public routes.
 */
export async function recordTrustHistoryAction(): Promise<
  DbResult<RecordTrustHistorySummary>
> {
  const result = await recordTrustHistory(new Date().toISOString());
  if (result.ok) revalidate(HISTORY_ROUTE, PUBLIC_ROUTE, TRUST_ROUTE);
  return result;
}

/** Create a recalibration proposal (curator/admin). Proposal only — never applies. */
export async function createRecalibrationProposalAction(input: {
  entityType: TrustEntityType;
  entityId: string;
  trigger: RecalibrationTrigger;
  currentConfidence: number;
  recommendedConfidence: number;
  currentTrust?: number;
  recommendedTrust?: number;
  reason?: string;
  supportingEvidence?: string[];
}): Promise<DbResult<CreateProposalResult>> {
  const result = await createRecalibrationProposal(input, new Date().toISOString());
  if (result.ok) revalidate(PROPOSALS_ROUTE, DRIFT_ROUTE);
  return result;
}

/**
 * APPROVE or REJECT a recalibration proposal through governance (curator/admin;
 * REQUIRES a non-blank reason). On approval the change is applied (reversible,
 * audited) and a trust_override_applied alert is raised. Revalidates proposals +
 * history + public routes.
 */
export async function decideRecalibrationProposalAction(
  id: string,
  decision: 'approved' | 'rejected',
  reason: string,
): Promise<DbResult<DecisionResult>> {
  const result = await decideRecalibrationProposal(
    id,
    decision,
    reason,
    new Date().toISOString(),
  );
  if (result.ok) revalidate(PROPOSALS_ROUTE, HISTORY_ROUTE, PUBLIC_ROUTE, TRUST_ROUTE);
  return result;
}

/** Publish trust alongside an intelligence report (curator/admin). */
export async function publishTrustAction(input: {
  entityType: TrustEntityType;
  entityId: string;
  reportType: TrustReportType;
  confidence: number;
  calibratedReliability: number;
  trustScore: number;
}): Promise<DbResult<PublishTrustResult>> {
  const result = await publishTrust(input, new Date().toISOString());
  if (result.ok) revalidate(PUBLIC_ROUTE);
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-17 view-model / record types.
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  CreateProposalResult,
  DecisionResult,
  PublishTrustResult,
  RecordTrustHistorySummary,
} from './persistence';
export type {
  HsinTrustHistoryRecord,
  HsinTrustDriftRecord,
  HsinRecalibrationProposalRecord,
  HsinRecalibrationReviewRecord,
  HsinTrustOverrideRecord,
  HsinTrustPublicationRecord,
  TrustHistoryDashboardData,
  TrustHistoryView,
  TrustHistoryRow,
  TrustDriftDashboardData,
  RecalibrationQueueData,
  RecalibrationProposalView,
  PublicTrustData,
  PublicTrustEntry,
  TrustProvenanceView,
  TrustGovernanceHighlights,
  TrustTrend,
  TrustDriftKind,
  TrustSeverity,
  ProposalStatus,
  RecalibrationDirection,
  RecalibrationTrigger,
  TrustReportType,
  TrustEntityType,
  TrustBand,
} from '@hsi/shared-types';
