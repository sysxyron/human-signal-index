'use server';

// =============================================================================
// HSIN Phase 15 — Outcome Tracking & Learning server actions. 'use server'.
//
// THIN wrappers over the Phase-15 DAL (lib/outcome/persistence.ts). They return
// DbResult and revalidate the relevant dashboards. They NEVER throw (the DAL
// already returns DbResult).
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-15 UI (the outcome
// dashboard, the outcome detail view, the governance queue, and the decisions /
// compare widgets) is built against exactly these names — do not rename them.
//
// SERVER-ONLY: this module imports next/headers (transitively via the DAL) and
// must never be imported by a client component — it is reachable only via these
// actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  addFeedback,
  demoOutcome,
  getDecisionOutcomeWidget,
  getGovernanceQueue,
  getOutcome,
  getOutcomeAlerts,
  getOutcomeHighlights,
  getOutcomesDashboard,
  learnFromOutcomesRun,
  listOutcomes,
  recordOutcome,
  reviewOutcome,
  type AddFeedbackResult,
  type DbResult,
  type DecisionOutcomeWidget,
  type LearnFromOutcomesSummary,
  type OutcomeDemoViews,
  type RecordOutcomeResult,
  type ReviewOutcomeResult,
} from './persistence';
import type { ObservedData } from '@hsi/outcome-intelligence';
import type {
  DecisionAlertStatus,
  DecisionPerformanceData,
  GovernanceDecision,
  GovernanceQueueData,
  HsinDecisionAlertRecord,
  HsinRecommendationOutcomeRecord,
  OutcomeAlertType,
  OutcomeDashboardHighlights,
  OutcomeStatus,
  OutcomeView,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Routes revalidated after a write (best-effort; safe if absent).
// -----------------------------------------------------------------------------
const OUTCOMES_ROUTE = '/outcomes';
const GOVERNANCE_ROUTE = '/governance';
const DECISION_ROUTE = '/decision';

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

/** Decision-performance dashboard (success/accuracy/ROI, distribution, learning). */
export async function getOutcomesDashboardAction(): Promise<
  DbResult<DecisionPerformanceData>
> {
  return getOutcomesDashboard();
}

/** A single outcome + measurements + governance reviews + audit trail + run. */
export async function getOutcomeAction(id: string): Promise<DbResult<OutcomeView>> {
  return getOutcome(id);
}

/** List outcomes, optionally filtered by status and/or decision run. */
export async function listOutcomesAction(filters?: {
  status?: OutcomeStatus;
  decisionRunId?: string;
}): Promise<DbResult<HsinRecommendationOutcomeRecord[]>> {
  return listOutcomes(filters);
}

/** The governance queue: pending outcomes + reviews + open alerts. */
export async function getGovernanceQueueAction(): Promise<
  DbResult<GovernanceQueueData>
> {
  return getGovernanceQueue();
}

/** The decision-intelligence alert feed, optionally filtered. */
export async function getOutcomeAlertsAction(filters?: {
  alertType?: OutcomeAlertType;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status?: DecisionAlertStatus;
  decisionRunId?: string;
}): Promise<DbResult<HsinDecisionAlertRecord[]>> {
  return getOutcomeAlerts(filters);
}

/** Headline outcome callouts for the dashboard. */
export async function getOutcomeHighlightsAction(): Promise<
  DbResult<OutcomeDashboardHighlights>
> {
  return getOutcomeHighlights();
}

/** Outcomes + learning for one decision run (for the decisions/compare widgets). */
export async function getDecisionOutcomeWidgetAction(
  decisionRunId: string,
): Promise<DbResult<DecisionOutcomeWidget>> {
  return getDecisionOutcomeWidget(decisionRunId);
}

/** Labeled, non-persisted demo view-models for the empty-env / showcase path. */
export async function demoOutcomeAction(): Promise<DbResult<OutcomeDemoViews>> {
  return demoOutcome();
}

// =============================================================================
// WRITES
// =============================================================================

/**
 * Record the observed OUTCOME of a Phase-13 recommendation (reviewer+) and run
 * the evaluate → measure → learn → governance pipeline. Revalidates the outcomes
 * + governance + decision routes. NEVER throws.
 */
export async function recordOutcomeAction(
  decisionRunId: string,
  recommendationId: string,
  observed: ObservedData,
): Promise<DbResult<RecordOutcomeResult>> {
  const result = await recordOutcome(decisionRunId, recommendationId, observed);
  if (result.ok) {
    revalidate(OUTCOMES_ROUTE, GOVERNANCE_ROUTE, DECISION_ROUTE);
  }
  return result;
}

/**
 * Apply a governance decision to an outcome (reviewer+). Revalidates the
 * governance + outcomes routes. NEVER throws.
 */
export async function reviewOutcomeAction(
  outcomeId: string,
  decision: GovernanceDecision,
  notes?: string,
): Promise<DbResult<ReviewOutcomeResult>> {
  const result = await reviewOutcome(outcomeId, decision, notes);
  if (result.ok) {
    revalidate(GOVERNANCE_ROUTE, OUTCOMES_ROUTE);
  }
  return result;
}

/**
 * Recompute ALL confidence learning from the stored outcomes (reviewer+).
 * Revalidates the outcomes + decision routes. NEVER throws.
 */
export async function learnFromOutcomesAction(): Promise<
  DbResult<LearnFromOutcomesSummary>
> {
  const result = await learnFromOutcomesRun();
  if (result.ok) {
    revalidate(OUTCOMES_ROUTE, DECISION_ROUTE);
  }
  return result;
}

/**
 * Add per-user feedback (1..5 rating + free text) on an outcome (authenticated).
 * Revalidates the outcomes route. NEVER throws.
 */
export async function addOutcomeFeedbackAction(
  outcomeId: string,
  rating: number,
  feedback?: string,
): Promise<DbResult<AddFeedbackResult>> {
  const result = await addFeedback(outcomeId, rating, feedback);
  if (result.ok) {
    revalidate(OUTCOMES_ROUTE);
  }
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-15 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  RecordOutcomeResult,
  ReviewOutcomeResult,
  LearnFromOutcomesSummary,
  AddFeedbackResult,
  DecisionOutcomeWidget,
  OutcomeDemoViews,
} from './persistence';
export type {
  // Records.
  HsinRecommendationOutcomeRecord,
  HsinOutcomeMeasurementRecord,
  HsinConfidenceLearningRecord,
  HsinDecisionAlertRecord,
  HsinGovernanceReviewRecord,
  HsinRecommendationFeedbackRecord,
  // View-models.
  DecisionPerformanceData,
  OutcomeView,
  GovernanceQueueData,
  OutcomeDashboardHighlights,
  // Unions.
  OutcomeStatus,
  OutcomeAlertType,
  DecisionAlertStatus,
  GovernanceDecision,
} from '@hsi/shared-types';
