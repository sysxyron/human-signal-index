// =============================================================================
// HSIN Phase 15 — Outcome Tracking & Learning data-access layer (DAL).
// SERVER-ONLY.
//
// "Did the recommendation actually work, and are recommendations getting better
// over time?" The persistence layer for the Phase-15 outcome-intelligence layer
// over the Phase-13 decision-intelligence graph (migration 0019):
//   * OUTCOMES      — hsin_recommendation_outcomes: the observed outcome of a
//                     Phase-13 decision run (status, expected vs observed,
//                     confidence_before vs after, success_score, explanation,
//                     limitations).
//   * MEASUREMENTS  — hsin_outcome_measurements: per-metric expected-vs-observed
//                     values (delta, within_expectation) behind an outcome.
//   * LEARNING      — hsin_confidence_learning: calibrated confidence per
//                     intervention type learned from outcome history; unique per
//                     intervention_type → idempotent upsert.
//   * ALERTS        — hsin_decision_alerts: the decision-intelligence alert feed
//                     (recommendation failures, drift, spikes, misses, …).
//   * GOVERNANCE    — hsin_governance_reviews: the validation workflow over
//                     outcomes (pending → approved/rejected/escalated/validated).
//   * FEEDBACK      — hsin_recommendation_feedback: per-user 1..5 rating + notes.
//
// The PURE, deterministic engine lives in '@hsi/outcome-intelligence'. This DAL
// loads a RecommendationRef from the Phase-13 hsin_decision_runs +
// hsin_intervention_rankings tables, feeds it (with the observed data) into the
// engine, and persists the results. Reads assemble the Phase-15 view-models the
// outcome / governance dashboards render.
//
// THE PIPELINE (recordOutcome): buildRecommendationRef → evaluateOutcome (score
// + status + confidence update) → persist outcome + measurements → recompute
// confidence learning (tagInterventionType + learnFromOutcomes) → upsert
// hsin_confidence_learning → buildGovernanceReview → insert a 'pending' review.
// NEVER auto-acts / publishes — alerts and reviews are AIDS for a human.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). `server-only` is not installed in this workspace, so
// this comment stands in for the import (mirrors lib/decision/persistence.ts).
//
// AUTHZ MODEL (migration 0019 RLS, mirrored here for clean DbResult errors):
//   * All 6 Phase-15 tables: authenticated READ.
//   * The 5 validation-bearing tables (outcomes, measurements, learning, alerts,
//     governance_reviews): reviewer+ INSERT/UPDATE/DELETE; admin all. We gate the
//     writes (recordOutcome / reviewOutcome / learnFromOutcomesRun) at reviewer
//     (RLS is the backstop).
//   * hsin_recommendation_feedback: ANY authenticated user may INSERT their OWN
//     feedback (user_id = auth.uid()).
//   NO service-role path — the background outcome worker uses service_role; the
//   app is RLS-scoped.
//
// DESIGN: every function returns DbResult<T> and NEVER throws. Empty Supabase env
// degrades gracefully (NOT_CONFIGURED) so `next build` passes.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  buildGovernanceReview,
  buildOutcomeAuditTrail,
  applyGovernanceDecision,
  canValidate,
  evaluateOutcome,
  learnFromOutcomes,
  outcomeDemo,
  tagInterventionType,
  type ConfidenceLearningEntry,
  type GovernanceDecision,
  type GovernanceReview,
  type ObservedData,
  type OutcomeEvaluation,
  type RecommendationRef,
} from '@hsi/outcome-intelligence';
import type {
  AppRole,
  DecisionAlertStatus,
  DecisionPerformanceData,
  GovernanceQueueData,
  HsinConfidenceLearningRecord,
  HsinDecisionAlertRecord,
  HsinDecisionRunRecord,
  HsinGovernanceReviewRecord,
  HsinInterventionRankingRecord,
  HsinOutcomeMeasurementRecord,
  HsinRecommendationFeedbackRecord,
  HsinRecommendationOutcomeRecord,
  OutcomeAlertType,
  OutcomeDashboardHighlights,
  OutcomeStatus,
  OutcomeView,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6–14).
// -----------------------------------------------------------------------------
export type DbResultCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_CONFIGURED'
  | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

const AUTH_REQUIRED = 'Sign in to continue.';

export function fail(error: unknown): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  logError('outcome/persistence', error);
  if (
    error instanceof Error &&
    /required|not configured|SUPABASE_/i.test(error.message) &&
    /key|url/i.test(error.message)
  ) {
    return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
  }
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}

function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}

export function forbidden(required: AppRole): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  return {
    ok: false,
    error: `Requires the ${required} role or higher.`,
    code: 'FORBIDDEN',
  };
}

// -----------------------------------------------------------------------------
// Client + identity + role helpers (mirror lib/decision/persistence.ts).
// -----------------------------------------------------------------------------

/** Per-request, cookie-backed, RLS-enforced client for reads AND writes. */
function db(): SupabaseClient {
  return createClient();
}

async function currentUser(client: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ?? null;
}

/** Ascending privilege ladder. viewer < researcher < reviewer < curator < admin. */
const ROLE_LEVEL: Record<AppRole, number> = {
  viewer: 1,
  researcher: 2,
  reviewer: 3,
  curator: 4,
  admin: 5,
};

async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  return loadHighestRole(client, user.id);
}

async function requireRole(
  client: SupabaseClient,
  min: AppRole,
): Promise<
  | { ok: true; user: User; role: AppRole }
  | { ok: false; error: string; code: DbResultCode }
> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  const role = (await sessionRole(client)) ?? 'viewer';
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) return forbidden(min);
  return { ok: true, user, role };
}

async function requireAuth(
  client: SupabaseClient,
): Promise<
  | { ok: true; user: User }
  | { ok: false; error: string; code: DbResultCode }
> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  return { ok: true, user };
}

// -----------------------------------------------------------------------------
// Typed JSON helpers — keep `any` out of signatures.
// -----------------------------------------------------------------------------
export type JsonRecord = Record<string, unknown>;

/** Cast an arbitrary engine value into the jsonb record shape (never `any`). */
function toJson(value: unknown): JsonRecord {
  return (value ?? {}) as JsonRecord;
}

/** A string[] wrapped into a jsonb record (explanation/limitations columns). */
function listJson(items: string[]): JsonRecord {
  return { items };
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, n) => a + n, 0) / nums.length) * 1e4) / 1e4;
}

function numbersOf(values: Array<number | null | undefined>): number[] {
  return values.filter((n): n is number => typeof n === 'number');
}

// -----------------------------------------------------------------------------
// Engine union → DB union guards. The engine + shared-types use identical string
// sets; these guards keep the persisted value inside the migration-0019 CHECK
// domains (status / alert_type / decision / alert status / severity).
// -----------------------------------------------------------------------------
const OUTCOME_STATUSES: OutcomeStatus[] = [
  'successful',
  'partially_successful',
  'neutral',
  'unsuccessful',
  'inconclusive',
];

const GOVERNANCE_DECISIONS: GovernanceDecision[] = [
  'pending',
  'approved',
  'rejected',
  'escalated',
  'validated',
];

const ALERT_TYPES: OutcomeAlertType[] = [
  'recommendation_failed',
  'confidence_drift',
  'narrative_spike',
  'forecast_miss',
  'resurgence',
  'security_anomaly',
];

const ALERT_STATUSES: DecisionAlertStatus[] = [
  'open',
  'acknowledged',
  'resolved',
  'escalated',
];

/** Guard an engine/string outcome status into the migration-0019 CHECK domain. */
function asOutcomeStatus(s: OutcomeStatus | string): OutcomeStatus {
  return (OUTCOME_STATUSES as string[]).includes(s)
    ? (s as OutcomeStatus)
    : 'inconclusive';
}

/** Guard a string governance decision into the migration-0019 CHECK domain. */
function asGovernanceDecision(d: GovernanceDecision | string): GovernanceDecision {
  return (GOVERNANCE_DECISIONS as string[]).includes(d)
    ? (d as GovernanceDecision)
    : 'pending';
}

/** Guard a string alert type into the migration-0019 CHECK domain. */
function asAlertType(t: string | undefined): OutcomeAlertType | undefined {
  if (t && (ALERT_TYPES as string[]).includes(t)) return t as OutcomeAlertType;
  return undefined;
}

/** Guard a string alert status into the migration-0019 CHECK domain. */
function asAlertStatus(s: string | undefined): DecisionAlertStatus {
  return s && (ALERT_STATUSES as string[]).includes(s)
    ? (s as DecisionAlertStatus)
    : 'open';
}

const SUCCESS_STATUSES: ReadonlySet<OutcomeStatus> = new Set<OutcomeStatus>([
  'successful',
  'partially_successful',
]);

// -----------------------------------------------------------------------------
// DB row → engine adapters.
// -----------------------------------------------------------------------------

interface RankingLite {
  intervention_type?: string | null;
  expected_effect?: number | null;
  confidence?: number | null;
  rank_position?: number | null;
}

/**
 * Build a RecommendationRef from a Phase-13 decision run + its intervention
 * ranking. `recommendationId` identifies the ranked candidate within the run —
 * it is matched against the ranking row's id, else falls back to the top-ranked
 * intervention for the run. interventionType / recommendedAction / expectedEffect
 * / confidenceBefore are read from the run + ranking. NEVER throws — returns null
 * when the run cannot be found.
 */
export async function buildRecommendationRef(
  decisionRunId: string,
  recommendationId: string,
  client: SupabaseClient,
): Promise<RecommendationRef | null> {
  const { data: runRow } = await client
    .from('hsin_decision_runs')
    .select('*')
    .eq('id', decisionRunId)
    .maybeSingle();
  if (!runRow) return null;
  const run = runRow as HsinDecisionRunRecord;

  // Resolve the ranking the recommendation refers to: prefer the ranking row
  // whose id == recommendationId, else the top-ranked intervention for the run.
  let ranking: HsinInterventionRankingRecord | null = null;
  const { data: byId } = await client
    .from('hsin_intervention_rankings')
    .select('*')
    .eq('id', recommendationId)
    .eq('decision_run_id', decisionRunId)
    .maybeSingle();
  ranking = (byId as HsinInterventionRankingRecord | null) ?? null;

  if (!ranking) {
    const { data: topRows } = await client
      .from('hsin_intervention_rankings')
      .select('*')
      .eq('decision_run_id', decisionRunId)
      .order('rank_position', { ascending: true, nullsFirst: false })
      .limit(1);
    ranking = ((topRows ?? []) as HsinInterventionRankingRecord[])[0] ?? null;
  }

  const r = (ranking ?? {}) as RankingLite;
  const interventionType =
    (typeof r.intervention_type === 'string' && r.intervention_type) ||
    'unknown';
  const expectedEffect = typeof r.expected_effect === 'number' ? r.expected_effect : 0;
  // confidenceBefore: prefer the ranking confidence, else the run confidence.
  const confidenceBefore =
    typeof r.confidence === 'number'
      ? r.confidence
      : typeof run.confidence === 'number'
        ? run.confidence
        : 0.5;

  return {
    recommendationId,
    decisionRunId,
    interventionType,
    recommendedAction: run.recommended_action ?? run.decision_name ?? interventionType,
    expectedEffect,
    confidenceBefore: Math.min(1, Math.max(0, confidenceBefore)),
  };
}

/** Convert a stored OutcomeEvaluation back from an outcome record for learning. */
function recordToEvaluation(
  outcome: HsinRecommendationOutcomeRecord,
): OutcomeEvaluation {
  return {
    recommendationId: outcome.recommendation_id ?? outcome.id,
    decisionRunId: outcome.decision_run_id ?? '',
    successScore: typeof outcome.success_score === 'number' ? outcome.success_score : 50,
    outcomeStatus: asOutcomeStatus(outcome.status ?? 'inconclusive'),
    confidenceBefore:
      typeof outcome.confidence_before === 'number' ? outcome.confidence_before : 0.5,
    confidenceAfter:
      typeof outcome.confidence_after === 'number' ? outcome.confidence_after : 0.5,
    confidenceAdjustment:
      (typeof outcome.confidence_after === 'number' ? outcome.confidence_after : 0.5) -
      (typeof outcome.confidence_before === 'number' ? outcome.confidence_before : 0.5),
    measurements: [],
    explanation: [],
    limitations: [],
    evaluatedAt: outcome.created_at,
  };
}

/** The intervention type behind a stored outcome (read from its decision run). */
async function interventionTypeForOutcome(
  client: SupabaseClient,
  outcome: HsinRecommendationOutcomeRecord,
): Promise<string> {
  if (!outcome.decision_run_id) return `run:${outcome.id}`;
  const { data: topRows } = await client
    .from('hsin_intervention_rankings')
    .select('intervention_type, rank_position')
    .eq('decision_run_id', outcome.decision_run_id)
    .order('rank_position', { ascending: true, nullsFirst: false })
    .limit(1);
  const top = ((topRows ?? []) as RankingLite[])[0];
  return (
    (typeof top?.intervention_type === 'string' && top.intervention_type) ||
    `run:${outcome.decision_run_id}`
  );
}

// =============================================================================
// READS (authenticated — RLS scopes visibility; anon/empty → empty lists)
// =============================================================================

/**
 * The decision-performance dashboard (DecisionPerformanceData):
 *   * successRate         — fraction of outcomes scored successful /
 *                           partially_successful (0..1).
 *   * confidenceAccuracy  — mean of how well the stated confidence_before tracked
 *                           the observed success: 1 − |confidence_before −
 *                           (success ? 1 : 0)| averaged over scored outcomes
 *                           (0..1). A DOCUMENTED Brier-style accuracy heuristic.
 *   * forecastAccuracy    — best-effort mean accuracy_score from
 *                           hsin_forecast_accuracy if present, else 0.
 *   * decisionRoi         — a DOCUMENTED heuristic: mean (successScore − 50) / 50
 *                           across outcomes, in [-1, 1] — net value over the
 *                           neutral baseline. 0 when no outcomes.
 *   * outcomeDistribution — counts by status.
 *   * learningTrends      — from hsin_confidence_learning.
 *   * top/worstInterventions — from confidence_learning avg_success_score.
 *   * recentOutcomes      — most-recent outcome rows.
 * RLS: any authenticated user reads. NEVER throws.
 */
export async function getOutcomesDashboard(): Promise<
  DbResult<DecisionPerformanceData>
> {
  try {
    const client = db();

    const { data: outcomeRows, error: oerr } = await client
      .from('hsin_recommendation_outcomes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (oerr) return fail(oerr);
    const outcomes = (outcomeRows ?? []) as HsinRecommendationOutcomeRecord[];

    const { data: learnRows, error: lerr } = await client
      .from('hsin_confidence_learning')
      .select('*')
      .order('avg_success_score', { ascending: false, nullsFirst: false })
      .limit(500);
    if (lerr) return fail(lerr);
    const learning = (learnRows ?? []) as HsinConfidenceLearningRecord[];

    // --- successRate: scored outcomes only (inconclusive excluded) -----------
    const scored = outcomes.filter(
      (o) => o.status && o.status !== 'inconclusive',
    );
    const successes = scored.filter(
      (o) => o.status && SUCCESS_STATUSES.has(o.status),
    ).length;
    const successRate = scored.length > 0 ? successes / scored.length : 0;

    // --- confidenceAccuracy: Brier-style 1 − |conf − actual| ----------------
    const accuracySamples = scored
      .filter((o) => typeof o.confidence_before === 'number')
      .map((o) => {
        const conf = o.confidence_before as number;
        const actual = o.status && SUCCESS_STATUSES.has(o.status) ? 1 : 0;
        return 1 - Math.abs(conf - actual);
      });
    const confidenceAccuracy = mean(accuracySamples);

    // --- forecastAccuracy: best-effort from hsin_forecast_accuracy ----------
    let forecastAccuracy = 0;
    try {
      const { data: accRows } = await client
        .from('hsin_forecast_accuracy')
        .select('accuracy_score')
        .limit(2000);
      forecastAccuracy = mean(
        numbersOf(
          ((accRows ?? []) as Array<{ accuracy_score?: number | null }>).map(
            (a) => a.accuracy_score,
          ),
        ),
      );
    } catch {
      // hsin_forecast_accuracy is owned by Phase 12; absence is non-fatal.
      forecastAccuracy = 0;
    }

    // --- decisionRoi: mean normalized value over the neutral (50) baseline ---
    const roiSamples = numbersOf(outcomes.map((o) => o.success_score)).map(
      (s) => (s - 50) / 50,
    );
    const decisionRoi = mean(roiSamples);

    // --- outcomeDistribution: counts by status ------------------------------
    const distCounts = new Map<OutcomeStatus, number>();
    for (const o of outcomes) {
      if (!o.status) continue;
      const s = asOutcomeStatus(o.status);
      distCounts.set(s, (distCounts.get(s) ?? 0) + 1);
    }
    const outcomeDistribution = OUTCOME_STATUSES.filter((s) =>
      distCounts.has(s),
    ).map((status) => ({ status, count: distCounts.get(status) ?? 0 }));

    // --- learningTrends + top/worst interventions ---------------------------
    const learningTrends = learning.map((l) => ({
      interventionType: l.intervention_type,
      calibratedConfidence:
        typeof l.calibrated_confidence === 'number' ? l.calibrated_confidence : 0,
      sampleCount: typeof l.sample_count === 'number' ? l.sample_count : 0,
    }));

    const byScore = [...learning]
      .filter((l) => typeof l.avg_success_score === 'number')
      .sort((a, b) => (b.avg_success_score ?? 0) - (a.avg_success_score ?? 0))
      .map((l) => ({
        interventionType: l.intervention_type,
        avgSuccessScore: l.avg_success_score ?? 0,
        sampleCount: typeof l.sample_count === 'number' ? l.sample_count : 0,
      }));
    const topInterventions = byScore.slice(0, 5);
    const worstInterventions = [...byScore].reverse().slice(0, 5);

    const recentOutcomes = outcomes.slice(0, 20);

    return {
      ok: true,
      data: {
        successRate: Math.round(successRate * 1e4) / 1e4,
        confidenceAccuracy,
        forecastAccuracy,
        decisionRoi: Math.round(decisionRoi * 1e4) / 1e4,
        outcomeDistribution,
        learningTrends,
        topInterventions,
        worstInterventions,
        recentOutcomes,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * A single outcome + its measurements + governance reviews + a full audit trail
 * (buildOutcomeAuditTrail) + the source decision run. RLS: any authenticated
 * user reads. NEVER throws.
 */
export async function getOutcome(id: string): Promise<DbResult<OutcomeView>> {
  try {
    const client = db();

    const { data: outcomeRow, error: oerr } = await client
      .from('hsin_recommendation_outcomes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (oerr) return fail(oerr);
    if (!outcomeRow) {
      return { ok: false, error: 'Outcome not found.', code: 'DB_ERROR' };
    }
    const outcome = outcomeRow as HsinRecommendationOutcomeRecord;

    const { data: measRows, error: merr } = await client
      .from('hsin_outcome_measurements')
      .select('*')
      .eq('outcome_id', id)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (merr) return fail(merr);
    const measurements = (measRows ?? []) as HsinOutcomeMeasurementRecord[];

    const { data: govRows, error: gerr } = await client
      .from('hsin_governance_reviews')
      .select('*')
      .eq('outcome_id', id)
      .order('created_at', { ascending: false })
      .limit(500);
    if (gerr) return fail(gerr);
    const governance = (govRows ?? []) as HsinGovernanceReviewRecord[];

    // Source decision run (best-effort).
    let decisionRun: HsinDecisionRunRecord | undefined;
    if (outcome.decision_run_id) {
      const { data: runRow } = await client
        .from('hsin_decision_runs')
        .select('*')
        .eq('id', outcome.decision_run_id)
        .maybeSingle();
      decisionRun = (runRow as HsinDecisionRunRecord | null) ?? undefined;
    }

    // Build the audit trail from the stored outcome (best-effort reconstruction
    // of the RecommendationRef from the run + its ranking).
    const auditTrail = await buildAuditTrailFor(client, outcome, measurements, governance);

    return {
      ok: true,
      data: { outcome, measurements, governance, auditTrail, decisionRun },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Reconstruct the engine audit trail for a stored outcome: rebuild a
 * RecommendationRef + OutcomeEvaluation (with its measurements) + the latest
 * confidence-learning entry for the intervention type + the latest governance
 * review, then call buildOutcomeAuditTrail. Best-effort; degrades to [] on a
 * missing run. NEVER throws.
 */
async function buildAuditTrailFor(
  client: SupabaseClient,
  outcome: HsinRecommendationOutcomeRecord,
  measurements: HsinOutcomeMeasurementRecord[],
  governance: HsinGovernanceReviewRecord[],
): Promise<{ step: string; detail: string; at?: string }[]> {
  try {
    const runId = outcome.decision_run_id ?? '';
    const recId = outcome.recommendation_id ?? outcome.id;
    const ref =
      runId.length > 0
        ? await buildRecommendationRef(runId, recId, client)
        : null;
    const interventionType = ref?.interventionType ?? 'unknown';

    const evaluation: OutcomeEvaluation = {
      ...recordToEvaluation(outcome),
      measurements: measurements.map((m) => ({
        metric: m.metric ?? '',
        expectedValue: typeof m.expected_value === 'number' ? m.expected_value : 0,
        observedValue: typeof m.observed_value === 'number' ? m.observed_value : 0,
        delta: typeof m.delta === 'number' ? m.delta : 0,
        withinExpectation: m.within_expectation === true,
      })),
    };

    const recommendation: RecommendationRef = ref ?? {
      recommendationId: recId,
      decisionRunId: runId,
      interventionType,
      recommendedAction: interventionType,
      expectedEffect: 0,
      confidenceBefore:
        typeof outcome.confidence_before === 'number'
          ? outcome.confidence_before
          : 0.5,
    };

    let learning: ConfidenceLearningEntry | undefined;
    const { data: learnRow } = await client
      .from('hsin_confidence_learning')
      .select('*')
      .eq('intervention_type', interventionType)
      .maybeSingle();
    if (learnRow) {
      const l = learnRow as HsinConfidenceLearningRecord;
      learning = {
        interventionType: l.intervention_type,
        sampleCount: typeof l.sample_count === 'number' ? l.sample_count : 0,
        successCount: typeof l.success_count === 'number' ? l.success_count : 0,
        avgSuccessScore:
          typeof l.avg_success_score === 'number' ? l.avg_success_score : 0,
        calibratedConfidence:
          typeof l.calibrated_confidence === 'number' ? l.calibrated_confidence : 0,
        adjustment: typeof l.adjustment === 'number' ? l.adjustment : 0,
        rationale: l.rationale ?? '',
      };
    }

    const latestReview = governance[0];
    const review: GovernanceReview | undefined = latestReview
      ? {
          outcomeId: latestReview.outcome_id,
          decisionRunId: latestReview.decision_run_id,
          decision: asGovernanceDecision(latestReview.decision ?? 'pending'),
          notes: latestReview.notes,
          reviewerId: latestReview.reviewer_id,
          createdAt: latestReview.created_at,
        }
      : undefined;

    return buildOutcomeAuditTrail(recommendation, evaluation, learning, review);
  } catch (e) {
    logError('outcome/persistence:audit-trail', e);
    return [];
  }
}

/**
 * List outcomes, optionally filtered by status and/or decision run. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function listOutcomes(filters?: {
  status?: OutcomeStatus;
  decisionRunId?: string;
}): Promise<DbResult<HsinRecommendationOutcomeRecord[]>> {
  try {
    const client = db();
    let q = client.from('hsin_recommendation_outcomes').select('*');
    if (filters?.status) q = q.eq('status', asOutcomeStatus(filters.status));
    if (filters?.decisionRunId) q = q.eq('decision_run_id', filters.decisionRunId);
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinRecommendationOutcomeRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/**
 * The governance queue (GovernanceQueueData): outcomes still pending governance
 * (no terminal review attached), the reviews over them, and the open decision
 * alerts. RLS: any authenticated user reads. NEVER throws.
 */
export async function getGovernanceQueue(): Promise<DbResult<GovernanceQueueData>> {
  try {
    const client = db();

    const { data: outcomeRows, error: oerr } = await client
      .from('hsin_recommendation_outcomes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (oerr) return fail(oerr);
    const outcomes = (outcomeRows ?? []) as HsinRecommendationOutcomeRecord[];

    const { data: reviewRows, error: rerr } = await client
      .from('hsin_governance_reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (rerr) return fail(rerr);
    const reviews = (reviewRows ?? []) as HsinGovernanceReviewRecord[];

    // An outcome is "pending governance" when it has no terminal review.
    const TERMINAL: ReadonlySet<GovernanceDecision> = new Set<GovernanceDecision>([
      'approved',
      'rejected',
      'validated',
    ]);
    const terminalByOutcome = new Set<string>();
    for (const r of reviews) {
      if (r.outcome_id && r.decision && TERMINAL.has(asGovernanceDecision(r.decision))) {
        terminalByOutcome.add(r.outcome_id);
      }
    }
    const pendingOutcomes = outcomes.filter((o) => !terminalByOutcome.has(o.id));

    const { data: alertRows, error: aerr } = await client
      .from('hsin_decision_alerts')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (aerr) return fail(aerr);
    const alerts = (alertRows ?? []) as HsinDecisionAlertRecord[];

    return { ok: true, data: { pendingOutcomes, reviews, alerts } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * The decision-intelligence alert feed, optionally filtered by alert type,
 * severity, status, or decision run. RLS: any authenticated user reads. NEVER
 * throws.
 */
export async function getOutcomeAlerts(filters?: {
  alertType?: OutcomeAlertType;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status?: DecisionAlertStatus;
  decisionRunId?: string;
}): Promise<DbResult<HsinDecisionAlertRecord[]>> {
  try {
    const client = db();
    let q = client.from('hsin_decision_alerts').select('*');
    if (filters?.alertType) q = q.eq('alert_type', filters.alertType);
    if (filters?.severity) q = q.eq('severity', filters.severity);
    if (filters?.status) q = q.eq('status', asAlertStatus(filters.status));
    if (filters?.decisionRunId) q = q.eq('decision_run_id', filters.decisionRunId);
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinDecisionAlertRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Headline outcome callouts for the dashboard (OutcomeDashboardHighlights):
 *   * successRate    — fraction of scored outcomes that succeeded;
 *   * openAlerts     — count of open decision alerts;
 *   * pendingReviews — count of pending governance reviews;
 *   * learningEntries— count of confidence-learning rows.
 * Best-effort: each callout degrades to undefined/0 on missing data. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getOutcomeHighlights(): Promise<
  DbResult<OutcomeDashboardHighlights>
> {
  try {
    const client = db();
    const highlights: OutcomeDashboardHighlights = {};

    const { data: statusRows } = await client
      .from('hsin_recommendation_outcomes')
      .select('status')
      .limit(5000);
    const statuses = ((statusRows ?? []) as Array<{ status?: string | null }>)
      .map((r) => r.status)
      .filter((s): s is OutcomeStatus =>
        typeof s === 'string' && (OUTCOME_STATUSES as string[]).includes(s),
      );
    const scored = statuses.filter((s) => s !== 'inconclusive');
    const successes = scored.filter((s) => SUCCESS_STATUSES.has(s)).length;
    highlights.successRate =
      scored.length > 0 ? Math.round((successes / scored.length) * 1e4) / 1e4 : 0;

    const { count: openAlerts } = await client
      .from('hsin_decision_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');
    highlights.openAlerts = openAlerts ?? 0;

    const { count: pendingReviews } = await client
      .from('hsin_governance_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('decision', 'pending');
    highlights.pendingReviews = pendingReviews ?? 0;

    const { count: learningEntries } = await client
      .from('hsin_confidence_learning')
      .select('id', { count: 'exact', head: true });
    highlights.learningEntries = learningEntries ?? 0;

    return { ok: true, data: highlights };
  } catch (e) {
    return fail(e);
  }
}

export interface DecisionOutcomeWidget {
  decisionRunId: string;
  outcomes: HsinRecommendationOutcomeRecord[];
  learning: HsinConfidenceLearningRecord[];
}

/**
 * The decisions/compare widget data for ONE decision run: the outcomes recorded
 * for the run + the confidence-learning rows for the intervention types behind
 * the run's rankings. RLS: any authenticated user reads. NEVER throws.
 */
export async function getDecisionOutcomeWidget(
  decisionRunId: string,
): Promise<DbResult<DecisionOutcomeWidget>> {
  try {
    const client = db();

    const { data: outcomeRows, error: oerr } = await client
      .from('hsin_recommendation_outcomes')
      .select('*')
      .eq('decision_run_id', decisionRunId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (oerr) return fail(oerr);
    const outcomes = (outcomeRows ?? []) as HsinRecommendationOutcomeRecord[];

    // Intervention types behind this run's rankings → their learning rows.
    const { data: rankRows } = await client
      .from('hsin_intervention_rankings')
      .select('intervention_type')
      .eq('decision_run_id', decisionRunId)
      .limit(1000);
    const types = Array.from(
      new Set(
        ((rankRows ?? []) as RankingLite[])
          .map((r) => r.intervention_type)
          .filter((t): t is string => typeof t === 'string' && t.length > 0),
      ),
    );

    let learning: HsinConfidenceLearningRecord[] = [];
    if (types.length > 0) {
      const { data: learnRows } = await client
        .from('hsin_confidence_learning')
        .select('*')
        .in('intervention_type', types)
        .limit(1000);
      learning = (learnRows ?? []) as HsinConfidenceLearningRecord[];
    }

    return { ok: true, data: { decisionRunId, outcomes, learning } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// WRITES (reviewer+) — run the engine + persist. RLS is the backstop; we gate at
// reviewer for clean DbResult errors. NEVER throw.
// =============================================================================

export interface RecordOutcomeResult {
  outcomeId: string;
  evaluation: OutcomeEvaluation;
}

/**
 * Record the observed OUTCOME of a Phase-13 recommendation (reviewer+) and run
 * the full Phase-15 pipeline:
 *   1. buildRecommendationRef(decisionRunId, recommendationId) from the run + its
 *      ranking.
 *   2. evaluateOutcome(ref, observed, now) → success score + status + bounded
 *      confidence update + per-metric measurements + explanation + limitations.
 *   3. INSERT hsin_recommendation_outcomes (status / expected / observed /
 *      confidence_before / confidence_after / success_score / explanation /
 *      limitations).
 *   4. INSERT one hsin_outcome_measurements row per evaluation.measurement.
 *   5. RECOMPUTE confidence learning for the intervention type: load the prior
 *      hsin_confidence_learning row + the recent stored outcomes for the same
 *      type, tagInterventionType + learnFromOutcomes, then UPSERT the unique
 *      hsin_confidence_learning row.
 *   6. buildGovernanceReview(evaluation, now) → INSERT a 'pending'
 *      hsin_governance_reviews row.
 * NEVER auto-acts / publishes. Returns the new outcome id + the engine
 * evaluation. NEVER throws.
 */
export async function recordOutcome(
  decisionRunId: string,
  recommendationId: string,
  observed: ObservedData,
): Promise<DbResult<RecordOutcomeResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'reviewer');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();

    // --- 1. RecommendationRef from the Phase-13 run + ranking ---------------
    const ref = await buildRecommendationRef(decisionRunId, recommendationId, client);
    if (!ref) {
      return {
        ok: false,
        error: 'Decision run not found for the outcome.',
        code: 'DB_ERROR',
      };
    }

    // --- 2. Evaluate the outcome against observed reality -------------------
    const evaluation = evaluateOutcome(ref, observed, now);

    // --- 3. Insert the outcome row -----------------------------------------
    const { data: outcomeRow, error: oerr } = await client
      .from('hsin_recommendation_outcomes')
      .insert({
        decision_run_id: decisionRunId,
        recommendation_id: recommendationId,
        status: asOutcomeStatus(evaluation.outcomeStatus),
        expected_outcome: toJson(ref.expectedOutcome ?? { expectedEffect: ref.expectedEffect }),
        observed_outcome: toJson(observed),
        confidence_before: evaluation.confidenceBefore,
        confidence_after: evaluation.confidenceAfter,
        success_score: evaluation.successScore,
        explanation: listJson(evaluation.explanation),
        limitations: listJson(evaluation.limitations),
        created_by: gate.user.id,
      })
      .select('id')
      .single();
    if (oerr || !outcomeRow?.id) {
      return fail(oerr ?? new Error('Outcome insert returned no id.'));
    }
    const outcomeId = outcomeRow.id as string;

    // --- 4. Insert per-metric measurements ---------------------------------
    for (const m of evaluation.measurements) {
      await client.from('hsin_outcome_measurements').insert({
        outcome_id: outcomeId,
        metric: m.metric,
        expected_value: m.expectedValue,
        observed_value: m.observedValue,
        delta: m.delta,
        within_expectation: m.withinExpectation,
      });
    }

    // --- 5. Recompute + upsert confidence learning for the type ------------
    await recomputeLearningForType(client, ref.interventionType, evaluation, now);

    // --- 6. Seed a pending governance review -------------------------------
    const review = buildGovernanceReview(evaluation, now);
    await client.from('hsin_governance_reviews').insert({
      outcome_id: outcomeId,
      decision_run_id: decisionRunId,
      decision: asGovernanceDecision(review.decision),
      notes: review.notes,
      status: 'pending',
    });

    return { ok: true, data: { outcomeId, evaluation } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Recompute the confidence learning for ONE intervention type by folding the new
 * evaluation onto the prior learning row + the recent stored outcomes for the
 * same type, then UPSERT the unique hsin_confidence_learning row. Best-effort;
 * NEVER throws.
 */
async function recomputeLearningForType(
  client: SupabaseClient,
  interventionType: string,
  freshEvaluation: OutcomeEvaluation,
  now: string,
): Promise<void> {
  try {
    // Prior learning row (seeds the Bayesian blend baseline + counts).
    const { data: priorRow } = await client
      .from('hsin_confidence_learning')
      .select('*')
      .eq('intervention_type', interventionType)
      .maybeSingle();
    const prior = priorRow as HsinConfidenceLearningRecord | null;

    // The engine groups by a module-level TYPE_TAG keyed on recommendationId;
    // tag the fresh evaluation so it groups under interventionType.
    tagInterventionType(freshEvaluation, interventionType);

    // Recompute incrementally: the prior row carries the accumulated counts, so
    // we fold ONLY the fresh evaluation on top (avoids double-counting history).
    const priorEntry: ConfidenceLearningEntry | undefined = prior
      ? {
          interventionType: prior.intervention_type,
          sampleCount: typeof prior.sample_count === 'number' ? prior.sample_count : 0,
          successCount:
            typeof prior.success_count === 'number' ? prior.success_count : 0,
          avgSuccessScore:
            typeof prior.avg_success_score === 'number' ? prior.avg_success_score : 0,
          calibratedConfidence:
            typeof prior.calibrated_confidence === 'number'
              ? prior.calibrated_confidence
              : 0.5,
          adjustment: typeof prior.adjustment === 'number' ? prior.adjustment : 0,
          rationale: prior.rationale ?? '',
        }
      : undefined;

    const learned = learnFromOutcomes([freshEvaluation], priorEntry ? [priorEntry] : undefined, now);
    const entry = learned.find((l) => l.interventionType === interventionType);
    if (!entry) return;

    await upsertLearning(client, entry);
  } catch (e) {
    logError('outcome/persistence:recompute-learning', e);
  }
}

/** UPSERT one confidence-learning entry on the unique intervention_type. NEVER throws. */
async function upsertLearning(
  client: SupabaseClient,
  entry: ConfidenceLearningEntry,
): Promise<boolean> {
  const payload = {
    sample_count: entry.sampleCount,
    success_count: entry.successCount,
    avg_success_score: entry.avgSuccessScore,
    calibrated_confidence: Math.min(1, Math.max(0, entry.calibratedConfidence)),
    adjustment: entry.adjustment,
    rationale: entry.rationale,
  };
  const { data: existing } = await client
    .from('hsin_confidence_learning')
    .select('id')
    .eq('intervention_type', entry.interventionType)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await client
      .from('hsin_confidence_learning')
      .update(payload)
      .eq('id', existing.id as string);
    return !error;
  }
  const { error } = await client.from('hsin_confidence_learning').insert({
    intervention_type: entry.interventionType,
    ...payload,
  });
  return !error;
}

export interface ReviewOutcomeResult {
  reviewId: string;
  decision: GovernanceDecision;
}

/**
 * Apply a governance decision to an outcome (reviewer+; canValidate). Loads the
 * latest review for the outcome (else seeds a pending base), runs
 * applyGovernanceDecision(review, decision, …) for the immutable transition +
 * note trail, and INSERTS a new hsin_governance_reviews row capturing the
 * decision + reviewer. When decision === 'validated' the outcome's governance
 * status is recorded (notes appended). Writes an audit_logs row. NEVER throws.
 */
export async function reviewOutcome(
  outcomeId: string,
  decision: GovernanceDecision,
  notes?: string,
): Promise<DbResult<ReviewOutcomeResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'reviewer');
    if (!gate.ok) return gate;

    // canValidate guards the 'validated' transition specifically (admin/curator/
    // reviewer). The role gate already ensures reviewer+, but check explicitly.
    if (decision === 'validated' && !canValidate(gate.role)) {
      return forbidden('reviewer');
    }

    const now = new Date().toISOString();
    const target = asGovernanceDecision(decision);

    // Confirm the outcome exists + carries its run link.
    const { data: outcomeRow, error: oerr } = await client
      .from('hsin_recommendation_outcomes')
      .select('id, decision_run_id, notes')
      .eq('id', outcomeId)
      .maybeSingle();
    if (oerr) return fail(oerr);
    if (!outcomeRow) {
      return { ok: false, error: 'Outcome not found.', code: 'DB_ERROR' };
    }
    const outcome = outcomeRow as Pick<
      HsinRecommendationOutcomeRecord,
      'id' | 'decision_run_id' | 'notes'
    >;

    // Latest existing review (else seed a pending base for the transition).
    const { data: latestRow } = await client
      .from('hsin_governance_reviews')
      .select('*')
      .eq('outcome_id', outcomeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latest = latestRow as HsinGovernanceReviewRecord | null;

    const base: GovernanceReview = latest
      ? {
          outcomeId,
          decisionRunId: latest.decision_run_id ?? outcome.decision_run_id,
          decision: asGovernanceDecision(latest.decision ?? 'pending'),
          notes: latest.notes,
          reviewerId: latest.reviewer_id,
          createdAt: latest.created_at,
        }
      : {
          outcomeId,
          decisionRunId: outcome.decision_run_id,
          decision: 'pending',
          notes: undefined,
          createdAt: now,
        };

    const transitioned = applyGovernanceDecision(base, target, {
      reviewerId: gate.user.id,
      notes,
      now,
    });

    const { data: reviewRow, error: rerr } = await client
      .from('hsin_governance_reviews')
      .insert({
        outcome_id: outcomeId,
        decision_run_id: outcome.decision_run_id,
        reviewer_id: gate.user.id,
        decision: target,
        notes: transitioned.notes,
        status: target,
      })
      .select('id')
      .single();
    if (rerr || !reviewRow?.id) {
      return fail(rerr ?? new Error('Governance review insert returned no id.'));
    }
    const reviewId = reviewRow.id as string;

    // When validated, record the validation on the outcome (notes only — the
    // outcome row has no governance-status column; we annotate notes).
    if (target === 'validated') {
      const stamped = `${outcome.notes ? `${outcome.notes} ` : ''}[validated ${now} by ${gate.user.id}]`;
      await client
        .from('hsin_recommendation_outcomes')
        .update({ notes: stamped })
        .eq('id', outcomeId);
    }

    await recordAudit(client, gate.user.id, 'outcome.review', outcomeId, {
      decision: target,
      review_id: reviewId,
    });

    return { ok: true, data: { reviewId, decision: target } };
  } catch (e) {
    return fail(e);
  }
}

/** Write a best-effort audit_logs row (0001 shape). NEVER blocks the mutation. */
async function recordAudit(
  client: SupabaseClient,
  userId: string | null,
  action: string,
  entityId: string,
  extra?: JsonRecord,
): Promise<void> {
  try {
    await client.from('audit_logs').insert({
      user_id: userId,
      action,
      metadata: {
        entity_type: 'recommendation_outcome',
        entity_id: entityId,
        ...(extra ?? {}),
      },
    });
  } catch {
    // Best-effort — never block the mutation on an audit write.
  }
}

export interface LearnFromOutcomesSummary {
  interventionTypes: number;
  upserted: number;
}

/**
 * Recompute ALL confidence learning from the stored outcomes (reviewer+). Loads
 * every outcome, groups by the intervention type behind its decision run, builds
 * a tagged OutcomeEvaluation per outcome, runs learnFromOutcomes per group from a
 * clean baseline, and UPSERTS each hsin_confidence_learning row. NEVER throws.
 */
export async function learnFromOutcomesRun(): Promise<
  DbResult<LearnFromOutcomesSummary>
> {
  try {
    const client = db();
    const gate = await requireRole(client, 'reviewer');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();

    const { data: outcomeRows, error: oerr } = await client
      .from('hsin_recommendation_outcomes')
      .select('*')
      .limit(20000);
    if (oerr) return fail(oerr);
    const outcomes = (outcomeRows ?? []) as HsinRecommendationOutcomeRecord[];

    // Resolve the intervention type for each outcome (cached by run).
    const typeByRun = new Map<string, string>();
    const grouped = new Map<string, OutcomeEvaluation[]>();
    for (const o of outcomes) {
      const runId = o.decision_run_id ?? '';
      let type = typeByRun.get(runId);
      if (type === undefined) {
        type = await interventionTypeForOutcome(client, o);
        typeByRun.set(runId, type);
      }
      const ev = tagInterventionType(recordToEvaluation(o), type);
      const list = grouped.get(type) ?? [];
      list.push(ev);
      grouped.set(type, list);
    }

    let upserted = 0;
    for (const [type, evals] of grouped) {
      const learned = learnFromOutcomes(evals, undefined, now);
      const entry = learned.find((l) => l.interventionType === type);
      if (entry && (await upsertLearning(client, entry))) upserted += 1;
    }

    return {
      ok: true,
      data: { interventionTypes: grouped.size, upserted },
    };
  } catch (e) {
    return fail(e);
  }
}

export interface AddFeedbackResult {
  feedbackId: string;
}

/**
 * Add per-user feedback (a 1..5 rating + free text) on an outcome (authenticated;
 * user_id = auth.uid()). RLS allows any signed-in user to INSERT their OWN row.
 * NEVER throws.
 */
export async function addFeedback(
  outcomeId: string,
  rating: number,
  feedback?: string,
): Promise<DbResult<AddFeedbackResult>> {
  try {
    const client = db();
    const gate = await requireAuth(client);
    if (!gate.ok) return gate;

    const clampedRating = Math.min(5, Math.max(1, Math.round(rating)));

    const { data: row, error } = await client
      .from('hsin_recommendation_feedback')
      .insert({
        outcome_id: outcomeId,
        user_id: gate.user.id,
        rating: clampedRating,
        feedback: feedback ?? null,
      })
      .select('id')
      .single();
    if (error || !row?.id) {
      return fail(error ?? new Error('Feedback insert returned no id.'));
    }
    return { ok: true, data: { feedbackId: row.id as string } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// DEMO — labeled, NON-PERSISTED view-models from the package outcomeDemo().
// For the NOT_CONFIGURED / empty-env showcase path. NEVER throws.
// =============================================================================

export interface OutcomeDemoViews {
  dashboard: DecisionPerformanceData;
  outcome: OutcomeView;
  governance: GovernanceQueueData;
  alerts: HsinDecisionAlertRecord[];
  highlights: OutcomeDashboardHighlights;
  feedback: HsinRecommendationFeedbackRecord[];
}

/**
 * Build the Phase-15 view-models from the deterministic engine fixtures
 * (outcomeDemo). Synthetic ids; clearly a demo. The UI renders this when
 * Supabase is not configured. NEVER throws (outcomeDemo is pure/offline).
 */
export async function demoOutcome(): Promise<DbResult<OutcomeDemoViews>> {
  try {
    const demo = outcomeDemo();
    const now = '2026-06-01T00:00:00.000Z';

    // Map each engine evaluation → an outcome record.
    const outcomeRecords: HsinRecommendationOutcomeRecord[] = demo.evaluations.map(
      (ev, i) => ({
        id: `demo-outcome-${i}`,
        decision_run_id: ev.decisionRunId,
        recommendation_id: ev.recommendationId,
        status: asOutcomeStatus(ev.outcomeStatus),
        expected_outcome: {},
        observed_outcome: {},
        confidence_before: ev.confidenceBefore,
        confidence_after: ev.confidenceAfter,
        success_score: ev.successScore,
        explanation: listJson(ev.explanation),
        limitations: listJson(ev.limitations),
        created_at: now,
        updated_at: now,
      }),
    );

    // --- Dashboard ----------------------------------------------------------
    const scored = demo.evaluations.filter(
      (e) => e.outcomeStatus !== 'inconclusive',
    );
    const successes = scored.filter((e) =>
      SUCCESS_STATUSES.has(e.outcomeStatus),
    ).length;
    const successRate = scored.length > 0 ? successes / scored.length : 0;
    const confidenceAccuracy = mean(
      scored.map(
        (e) =>
          1 -
          Math.abs(
            e.confidenceBefore - (SUCCESS_STATUSES.has(e.outcomeStatus) ? 1 : 0),
          ),
      ),
    );
    const decisionRoi = mean(
      demo.evaluations.map((e) => (e.successScore - 50) / 50),
    );

    const distCounts = new Map<OutcomeStatus, number>();
    for (const e of demo.evaluations) {
      const s = asOutcomeStatus(e.outcomeStatus);
      distCounts.set(s, (distCounts.get(s) ?? 0) + 1);
    }
    const outcomeDistribution = OUTCOME_STATUSES.filter((s) =>
      distCounts.has(s),
    ).map((status) => ({ status, count: distCounts.get(status) ?? 0 }));

    const learningTrends = demo.mergedLearning.map((l) => ({
      interventionType: l.interventionType,
      calibratedConfidence: l.calibratedConfidence,
      sampleCount: l.sampleCount,
    }));
    const byScore = [...demo.mergedLearning].sort(
      (a, b) => b.avgSuccessScore - a.avgSuccessScore,
    );
    const toRollup = (l: ConfidenceLearningEntry) => ({
      interventionType: l.interventionType,
      avgSuccessScore: l.avgSuccessScore,
      sampleCount: l.sampleCount,
    });

    const dashboard: DecisionPerformanceData = {
      successRate: Math.round(successRate * 1e4) / 1e4,
      confidenceAccuracy,
      forecastAccuracy: 0,
      decisionRoi: Math.round(decisionRoi * 1e4) / 1e4,
      outcomeDistribution,
      learningTrends,
      topInterventions: byScore.slice(0, 5).map(toRollup),
      worstInterventions: [...byScore].reverse().slice(0, 5).map(toRollup),
      recentOutcomes: outcomeRecords,
    };

    // --- Single outcome view (first evaluation) -----------------------------
    const first = outcomeRecords[0];
    const measurements: HsinOutcomeMeasurementRecord[] =
      demo.evaluations[0].measurements.map((m, i) => ({
        id: `demo-measurement-${i}`,
        outcome_id: first.id,
        metric: m.metric,
        expected_value: m.expectedValue,
        observed_value: m.observedValue,
        delta: m.delta,
        within_expectation: m.withinExpectation,
        created_at: now,
      }));

    const reviewRecords: HsinGovernanceReviewRecord[] = [
      {
        id: 'demo-review-0',
        outcome_id: first.id,
        decision_run_id: demo.validatedReview.decisionRunId,
        reviewer_id: demo.validatedReview.reviewerId,
        decision: asGovernanceDecision(demo.validatedReview.decision),
        notes: demo.validatedReview.notes,
        status: asGovernanceDecision(demo.validatedReview.decision),
        created_at: now,
        updated_at: now,
      },
    ];

    const outcomeView: OutcomeView = {
      outcome: first,
      measurements,
      governance: reviewRecords,
      auditTrail: demo.auditTrail,
      decisionRun: undefined,
    };

    // --- Alerts -------------------------------------------------------------
    const alerts: HsinDecisionAlertRecord[] = demo.alerts.map((a, i) => ({
      id: `demo-alert-${i}`,
      decision_run_id: a.decisionRunId,
      alert_type: asAlertType(a.alertType),
      severity: a.severity,
      message: a.message,
      explanation: a.explanation,
      status: 'open',
      metadata: a.metadata,
      created_at: now,
    }));

    // --- Governance queue ---------------------------------------------------
    const governance: GovernanceQueueData = {
      pendingOutcomes: outcomeRecords.slice(1),
      reviews: reviewRecords,
      alerts,
    };

    const highlights: OutcomeDashboardHighlights = {
      successRate: dashboard.successRate,
      openAlerts: alerts.length,
      pendingReviews: reviewRecords.filter((r) => r.decision === 'pending').length,
      learningEntries: demo.mergedLearning.length,
    };

    const feedback: HsinRecommendationFeedbackRecord[] = [
      {
        id: 'demo-feedback-0',
        outcome_id: first.id,
        user_id: 'demo-user-0',
        rating: 4,
        feedback: 'Outcome aligned with observed signal decline.',
        created_at: now,
      },
    ];

    return {
      ok: true,
      data: {
        dashboard,
        outcome: outcomeView,
        governance,
        alerts,
        highlights,
        feedback,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the actions layer.
// -----------------------------------------------------------------------------
export { db as outcomeDbClient, requireRole as requireOutcomeRole };
