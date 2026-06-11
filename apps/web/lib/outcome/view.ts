// =============================================================================
// HSI Phase 15 — client-safe view helpers for the Outcome Tracking, Governance &
// Decision-Performance UI (outcome dashboard / outcome detail + audit trail /
// governance queue + the decision/compare/operations widgets).
//
// "Did the recommendation actually work, and are recommendations getting better
// over time?" PURE + CLIENT-SAFE: NO server-only imports (no next/headers, no
// Supabase server client, no actions). These map the Phase-15 domain unions →
// color/label, format success scores / confidence deltas, safely read the
// engine's explanation / limitations / expected / observed jsonb out of records,
// and build clearly-LABELED demo view-models from the @hsi/outcome-intelligence
// `outcomeDemo()` fixtures so every Phase-15 page renders fully offline when an
// action returns NOT_CONFIGURED.
//
// NEVER FABRICATE, NEVER CERTAINTY, NEVER BLACK-BOX — success score + confidence
// (before→after) + explanation + limitations + the full audit trail are surfaced
// from the provided data; these helpers decorate and project, never invent. An
// outcome verdict is an AID for a human reviewer, not a certainty.
// =============================================================================

import type {
  DecisionAlertStatus,
  DecisionPerformanceData,
  GovernanceDecision,
  GovernanceQueueData,
  HsinConfidenceLearningRecord,
  HsinDecisionAlertRecord,
  HsinDecisionRunRecord,
  HsinGovernanceReviewRecord,
  HsinOutcomeMeasurementRecord,
  HsinRecommendationOutcomeRecord,
  OutcomeAlertType,
  OutcomeDashboardHighlights,
  OutcomeStatus,
  OutcomeView,
} from '@hsi/shared-types';
import {
  outcomeDemo,
  type ConfidenceLearningEntry,
  type OutcomeAlert,
  type OutcomeAuditStep,
  type OutcomeDemo,
  type OutcomeEvaluation,
} from '@hsi/outcome-intelligence';

/* -------------------------------------------------------------------------- */
/* Shared decoration                                                           */
/* -------------------------------------------------------------------------- */

export type Tone =
  | 'neutral'
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'red'
  | 'cyan'
  | 'pink';

export interface Decorated {
  label: string;
  color: string;
  tone: Tone;
  description?: string;
}

const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
  cyan: '#06B6D4',
  pink: '#EC4899',
};

export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}

function titleize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Pretty-print an intervention type id (shared with the decision surface). */
export function interventionLabel(type?: string | null): string {
  if (!type) return 'Intervention';
  return titleize(String(type));
}

/* -------------------------------------------------------------------------- */
/* Role gating (pure — safe in client + server)                                */
/* -------------------------------------------------------------------------- */

const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  contributor: 1,
  researcher: 2,
  reviewer: 3,
  editor: 3,
  curator: 4,
  admin: 5,
  owner: 6,
};

function rank(role?: string | null): number {
  if (!role) return -1;
  return ROLE_RANK[role.toLowerCase()] ?? -1;
}

/**
 * Reviewer or above — can record outcomes, recompute learning, and run the
 * governance workflow (validate / approve / reject / escalate). Reviewer / editor
 * / curator / admin / owner all qualify; the server re-checks via getSessionRole.
 */
export function canReview(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.reviewer;
}

/* -------------------------------------------------------------------------- */
/* Outcome status → color/label/description (5 statuses)                        */
/* -------------------------------------------------------------------------- */

const OUTCOME_STATUS_DECOR: Record<OutcomeStatus, Decorated> = {
  successful: {
    label: 'Successful',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Observed effect matched the predicted direction and magnitude.',
  },
  partially_successful: {
    label: 'Partially successful',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'Right direction, but the observed effect undershot the prediction.',
  },
  neutral: {
    label: 'Neutral',
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    description: 'The observed effect was negligible or mixed — no clear movement.',
  },
  unsuccessful: {
    label: 'Unsuccessful',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'The narrative moved against the prediction — the recommendation did not work.',
  },
  inconclusive: {
    label: 'Inconclusive',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Too little observed data to judge — honestly reported, never guessed.',
  },
};

/** Stable display order for the 5 statuses (best → worst → inconclusive). */
export const OUTCOME_STATUS_ORDER: OutcomeStatus[] = [
  'successful',
  'partially_successful',
  'neutral',
  'unsuccessful',
  'inconclusive',
];

export function outcomeStatusDecor(status?: OutcomeStatus | string | null): Decorated {
  if (!status) {
    return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = OUTCOME_STATUS_DECOR[status as OutcomeStatus];
  if (known) return known;
  return { label: titleize(String(status)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Alert type → color/label (6 types) + severity + status                       */
/* -------------------------------------------------------------------------- */

const ALERT_TYPE_DECOR: Record<OutcomeAlertType, Decorated> = {
  recommendation_failed: {
    label: 'Recommendation failed',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'A tracked recommendation produced an unsuccessful outcome.',
  },
  confidence_drift: {
    label: 'Confidence drift',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Learned confidence for an intervention type is falling over time.',
  },
  narrative_spike: {
    label: 'Narrative spike',
    color: TONE_COLORS.purple,
    tone: 'purple',
    description: 'A narrative surged sharply against expectation.',
  },
  forecast_miss: {
    label: 'Forecast miss',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'The forecast state diverged from what was observed.',
  },
  resurgence: {
    label: 'Resurgence',
    color: TONE_COLORS.pink,
    tone: 'pink',
    description: 'A narrative declined and then re-emerged.',
  },
  security_anomaly: {
    label: 'Security anomaly',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'A security signal (e.g. coordinated behaviour) was flagged.',
  },
  // --- Phase 16: Calibration & Trust alert types (additive). ---
  calibration_drift: {
    label: 'Calibration drift',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Confidence has drifted out of calibration with observed outcomes.',
  },
  trust_collapse: {
    label: 'Trust collapse',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'An entity’s trust score fell sharply against its history.',
  },
  confidence_instability: {
    label: 'Confidence instability',
    color: TONE_COLORS.purple,
    tone: 'purple',
    description: 'Stated confidence is swinging unpredictably across predictions.',
  },
  forecast_miscalibration: {
    label: 'Forecast miscalibration',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'Forecast confidence systematically diverges from observed states.',
  },
};

export function alertTypeDecor(type?: OutcomeAlertType | string | null): Decorated {
  if (!type) {
    return { label: 'Alert', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = ALERT_TYPE_DECOR[type as OutcomeAlertType];
  if (known) return known;
  return { label: titleize(String(type)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

export function alertSeverityDecor(
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string | null,
): Decorated {
  switch (severity) {
    case 'CRITICAL':
      return { label: 'Critical', color: TONE_COLORS.red, tone: 'red' };
    case 'HIGH':
      return { label: 'High', color: TONE_COLORS.orange, tone: 'orange' };
    case 'MEDIUM':
      return { label: 'Medium', color: TONE_COLORS.cyan, tone: 'cyan' };
    case 'LOW':
      return { label: 'Low', color: TONE_COLORS.blue, tone: 'blue' };
    default:
      return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

export function alertStatusDecor(status?: DecisionAlertStatus | string | null): Decorated {
  switch (status) {
    case 'open':
      return { label: 'Open', color: TONE_COLORS.red, tone: 'red' };
    case 'acknowledged':
      return { label: 'Acknowledged', color: TONE_COLORS.orange, tone: 'orange' };
    case 'resolved':
      return { label: 'Resolved', color: TONE_COLORS.green, tone: 'green' };
    case 'escalated':
      return { label: 'Escalated', color: TONE_COLORS.purple, tone: 'purple' };
    default:
      return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

/* -------------------------------------------------------------------------- */
/* Governance decision → color/label (5 decisions)                             */
/* -------------------------------------------------------------------------- */

const GOVERNANCE_DECOR: Record<GovernanceDecision, Decorated> = {
  pending: {
    label: 'Pending',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Awaiting human review — no verdict reached yet.',
  },
  approved: {
    label: 'Approved',
    color: TONE_COLORS.blue,
    tone: 'blue',
    description: 'A reviewer accepted the outcome as recorded.',
  },
  rejected: {
    label: 'Rejected',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'A reviewer rejected the outcome — it should not be relied upon.',
  },
  escalated: {
    label: 'Escalated',
    color: TONE_COLORS.purple,
    tone: 'purple',
    description: 'Raised to a higher reviewer — high stakes or unresolved.',
  },
  validated: {
    label: 'Validated',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Confirmed against observed data by an authorised reviewer.',
  },
};

export function governanceDecor(decision?: GovernanceDecision | string | null): Decorated {
  if (!decision) {
    return { label: 'Pending', color: TONE_COLORS.orange, tone: 'orange' };
  }
  const known = GOVERNANCE_DECOR[decision as GovernanceDecision];
  if (known) return known;
  return { label: titleize(String(decision)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** The reviewer-selectable governance verdicts (excludes the implicit 'pending'). */
export const GOVERNANCE_ACTIONS: { decision: GovernanceDecision; decor: Decorated }[] = [
  { decision: 'validated', decor: GOVERNANCE_DECOR.validated },
  { decision: 'approved', decor: GOVERNANCE_DECOR.approved },
  { decision: 'rejected', decor: GOVERNANCE_DECOR.rejected },
  { decision: 'escalated', decor: GOVERNANCE_DECOR.escalated },
];

/* -------------------------------------------------------------------------- */
/* Numeric formatters                                                          */
/* -------------------------------------------------------------------------- */

/** Format a 0..1 confidence/probability as a percentage string, e.g. 72%. */
export function formatConfidence(p?: number | null): string {
  if (p == null || Number.isNaN(p)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

/** Format a 0..1 rate (success rate / accuracy) as a percentage string. */
export function formatRate(p?: number | null): string {
  if (p == null || Number.isNaN(p)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

/** Format a 0..100 success score, e.g. 84. */
export function formatScore(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, value)))}`;
}

/** Tone for a 0..100 success score — high green, mid cyan, low red. */
export function scoreTone(value?: number | null): Tone {
  if (value == null || Number.isNaN(value)) return 'neutral';
  if (value >= 70) return 'green';
  if (value >= 40) return 'cyan';
  return 'red';
}

/** Format a signed delta, e.g. +0.12 / -0.30 (rounded to `digits`). */
export function formatDelta(value?: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

/** Format a confidence delta as signed percentage points, e.g. +12pp / -8pp. */
export function formatConfidenceDelta(before?: number | null, after?: number | null): string {
  if (before == null || after == null || Number.isNaN(before) || Number.isNaN(after)) {
    return '—';
  }
  const pp = Math.round((after - before) * 100);
  return `${pp > 0 ? '+' : ''}${pp}pp`;
}

/** Direction of a confidence change. */
export function deltaDirection(before?: number | null, after?: number | null): 'up' | 'down' | 'flat' {
  if (before == null || after == null) return 'flat';
  const d = after - before;
  if (Math.abs(d) < 0.005) return 'flat';
  return d > 0 ? 'up' : 'down';
}

/** Format a decision ROI multiplier, e.g. 1.8x. */
export function formatRoi(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value.toFixed(2))}x`;
}

/** Format an ISO timestamp as a short date (UTC, deterministic). */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Format an ISO timestamp as a short date + time (UTC, deterministic). */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/* -------------------------------------------------------------------------- */
/* jsonb readers — typed helpers (no `any`)                                    */
/* -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Read a jsonb value meant to be a `string[]`. Tolerant: accepts a bare array of
 * strings, an object with an `items`/`list`/`values`/`explanation`/`limitations`
 * string[] field, or a single string (wrapped). Always returns a clean string[].
 */
export function readJsonbStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === 'string');
  }
  if (isRecord(value)) {
    for (const key of ['items', 'list', 'values', 'explanation', 'limitations', 'reasoning']) {
      const inner = value[key];
      if (Array.isArray(inner)) {
        return inner.filter((x): x is string => typeof x === 'string');
      }
    }
  }
  return [];
}

/** Read an outcome's `explanation` jsonb (string[]) via the typed helper. */
export function readExplanation(outcome: HsinRecommendationOutcomeRecord): string[] {
  return readJsonbStringArray(outcome.explanation);
}

/** Read an outcome's `limitations` jsonb (string[]) via the typed helper. */
export function readOutcomeLimitations(outcome: HsinRecommendationOutcomeRecord): string[] {
  return readJsonbStringArray(outcome.limitations);
}

/** A single decoded key/value row out of an expected/observed jsonb blob. */
export interface OutcomeMetricEntry {
  key: string;
  label: string;
  value: string;
}

/** Read a jsonb metric blob (expected_outcome / observed_outcome) into rows. */
export function readMetricEntries(
  blob: Record<string, unknown> | undefined | null,
): OutcomeMetricEntry[] {
  if (!isRecord(blob)) return [];
  const entries: OutcomeMetricEntry[] = [];
  for (const [key, raw] of Object.entries(blob)) {
    let value: string;
    if (typeof raw === 'number') value = String(Number(raw.toFixed(3)));
    else if (typeof raw === 'string') value = raw;
    else if (typeof raw === 'boolean') value = raw ? 'Yes' : 'No';
    else continue;
    entries.push({ key, label: titleize(key), value });
  }
  return entries;
}

/* -------------------------------------------------------------------------- */
/* Derived selectors                                                           */
/* -------------------------------------------------------------------------- */

/** Order an outcome distribution by the canonical 5-status order. */
export function orderedDistribution(
  distribution: { status: OutcomeStatus; count: number }[],
): { status: OutcomeStatus; count: number }[] {
  const byStatus = new Map(distribution.map((d) => [d.status, d.count]));
  return OUTCOME_STATUS_ORDER.map((status) => ({
    status,
    count: byStatus.get(status) ?? 0,
  }));
}

/** Sort outcomes most-recent-first by created_at. */
export function sortOutcomesRecent(
  outcomes: HsinRecommendationOutcomeRecord[],
): HsinRecommendationOutcomeRecord[] {
  return [...outcomes].sort(
    (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
  );
}

/** Reviews for one outcome, most-recent-first. */
export function reviewsForOutcome(
  reviews: HsinGovernanceReviewRecord[],
  outcomeId: string,
): HsinGovernanceReviewRecord[] {
  return reviews
    .filter((r) => r.outcome_id === outcomeId)
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — engine (camelCase) → shared-types records (snake_case)       */
/* Always labeled "Demo" by callers; pure offline fixtures.                    */
/* -------------------------------------------------------------------------- */

/** Fixed demo "now" matching the outcome fixtures (FIXTURE_NOW). */
const DEMO_NOW = '2026-06-01T00:00:00.000Z';

/** Stable id for a demo outcome derived from a recommendation id. */
function demoOutcomeId(recommendationId: string): string {
  return `demo-outcome-${recommendationId}`;
}

/** Project an engine OutcomeEvaluation → a HsinRecommendationOutcomeRecord. */
function evaluationToOutcome(ev: OutcomeEvaluation): HsinRecommendationOutcomeRecord {
  const expected: Record<string, number> = {};
  const observed: Record<string, number> = {};
  for (const m of ev.measurements) {
    expected[m.metric] = m.expectedValue;
    observed[m.metric] = m.observedValue;
  }
  return {
    id: demoOutcomeId(ev.recommendationId),
    decision_run_id: ev.decisionRunId,
    recommendation_id: ev.recommendationId,
    status: ev.outcomeStatus,
    expected_outcome: expected,
    observed_outcome: observed,
    confidence_before: ev.confidenceBefore,
    confidence_after: ev.confidenceAfter,
    success_score: ev.successScore,
    explanation: { items: ev.explanation },
    limitations: { items: ev.limitations },
    created_at: ev.evaluatedAt,
    updated_at: ev.evaluatedAt,
  };
}

/** Project an engine OutcomeEvaluation → measurement records for an outcome. */
function evaluationToMeasurements(ev: OutcomeEvaluation): HsinOutcomeMeasurementRecord[] {
  const outcomeId = demoOutcomeId(ev.recommendationId);
  return ev.measurements.map((m, i) => ({
    id: `${outcomeId}-m${i}`,
    outcome_id: outcomeId,
    metric: m.metric,
    expected_value: m.expectedValue,
    observed_value: m.observedValue,
    delta: m.delta,
    within_expectation: m.withinExpectation,
    created_at: ev.evaluatedAt,
  }));
}

/** Project an engine OutcomeAlert → a HsinDecisionAlertRecord. */
function alertToRecord(a: OutcomeAlert, i: number): HsinDecisionAlertRecord {
  return {
    id: `demo-alert-${i}`,
    decision_run_id: a.decisionRunId,
    alert_type: a.alertType,
    severity: a.severity,
    message: a.message,
    explanation: a.explanation,
    status: 'open',
    metadata: a.metadata,
    created_at: a.createdAt,
  };
}

/** Project the engine confidence-learning entries → learning records. */
function learningToRecords(
  entries: ConfidenceLearningEntry[],
): { interventionType: string; calibratedConfidence: number; sampleCount: number }[] {
  return entries.map((e) => ({
    interventionType: e.interventionType,
    calibratedConfidence: e.calibratedConfidence,
    sampleCount: e.sampleCount,
  }));
}

/** Project the engine confidence-learning entries → intervention-performance rows. */
function learningToInterventions(
  entries: ConfidenceLearningEntry[],
): { interventionType: string; avgSuccessScore: number; sampleCount: number }[] {
  return entries.map((e) => ({
    interventionType: e.interventionType,
    avgSuccessScore: e.avgSuccessScore,
    sampleCount: e.sampleCount,
  }));
}

/** Map a recommendation id (from the demo fixtures) to a recommended action. */
const DEMO_ACTION_BY_REC: Record<string, string> = {
  'rec-success': 'Reduce amplification on the rising narrative',
  'rec-partial': 'Remove the top amplifying source',
  'rec-neutral': 'Remove a contradiction to stabilise',
  'rec-fail': 'Remove a bridging community',
  'rec-thin': 'Add a corrective source',
};

const DEMO_INTERVENTION_BY_REC: Record<string, string> = {
  'rec-success': 'reduce_amplification',
  'rec-partial': 'remove_source',
  'rec-neutral': 'remove_contradiction',
  'rec-fail': 'remove_community',
  'rec-thin': 'add_source',
};

/** Build a demo decision-run record for an evaluation (source recommendation). */
function evaluationToRun(ev: OutcomeEvaluation): HsinDecisionRunRecord {
  const action = DEMO_ACTION_BY_REC[ev.recommendationId] ?? 'Recommended action';
  return {
    id: ev.decisionRunId,
    created_at: DEMO_NOW,
    narrative_id: 'ai-surveillance',
    decision_name: action,
    decision_type: 'intervention',
    confidence: ev.confidenceBefore,
    recommended_action: action,
    generated_at: DEMO_NOW,
  };
}

/** Run the offline outcome engine once (deterministic, memoised per module load). */
let _demo: OutcomeDemo | null = null;
function demoBundle(): OutcomeDemo {
  if (!_demo) _demo = outcomeDemo();
  return _demo;
}

/** All demo outcome records, most-recent-first. */
export function demoOutcomeRecords(): HsinRecommendationOutcomeRecord[] {
  return demoBundle().evaluations.map(evaluationToOutcome);
}

/** Demo intervention picker rows (recommendation id + action + intervention). */
export function demoRecommendationOptions(): {
  recommendationId: string;
  decisionRunId: string;
  action: string;
  interventionType: string;
}[] {
  return demoBundle().evaluations.map((ev) => ({
    recommendationId: ev.recommendationId,
    decisionRunId: ev.decisionRunId,
    action: DEMO_ACTION_BY_REC[ev.recommendationId] ?? ev.recommendationId,
    interventionType: DEMO_INTERVENTION_BY_REC[ev.recommendationId] ?? 'intervention',
  }));
}

/** Demo DecisionPerformanceData from the @hsi/outcome-intelligence fixtures. */
export function demoPerformanceData(): DecisionPerformanceData {
  const demo = demoBundle();
  const evals = demo.evaluations;
  const recentOutcomes = evals.map(evaluationToOutcome);

  // Distribution across the 5 statuses (grounded in the fixtures).
  const counts = new Map<OutcomeStatus, number>();
  for (const e of evals) {
    counts.set(e.outcomeStatus, (counts.get(e.outcomeStatus) ?? 0) + 1);
  }
  const outcomeDistribution = OUTCOME_STATUS_ORDER.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));

  // Success rate: fraction successful / partially_successful over judged outcomes.
  const judged = evals.filter((e) => e.outcomeStatus !== 'inconclusive');
  const wins = judged.filter(
    (e) => e.outcomeStatus === 'successful' || e.outcomeStatus === 'partially_successful',
  ).length;
  const successRate = judged.length > 0 ? wins / judged.length : 0;

  // Confidence accuracy: mean confidenceAfter (calibrated post-observation).
  const confidenceAccuracy =
    evals.length > 0
      ? evals.reduce((a, e) => a + e.confidenceAfter, 0) / evals.length
      : 0;

  const learningTrends = learningToRecords(demo.mergedLearning);
  const interventions = learningToInterventions(demo.mergedLearning).sort(
    (a, b) => b.avgSuccessScore - a.avgSuccessScore,
  );

  return {
    successRate,
    confidenceAccuracy,
    forecastAccuracy: 0.5, // demo forecasts: 1 hit / 1 miss.
    decisionRoi: 1.6,
    outcomeDistribution,
    learningTrends,
    topInterventions: interventions.slice(0, 3),
    worstInterventions: [...interventions].reverse().slice(0, 3),
    recentOutcomes,
  };
}

/** Demo OutcomeView (detail + audit) for an outcome id (defaults to the first). */
export function demoOutcomeView(outcomeId?: string): OutcomeView {
  const demo = demoBundle();
  const ev =
    demo.evaluations.find((e) => demoOutcomeId(e.recommendationId) === outcomeId) ??
    demo.evaluations[0];
  const outcome = evaluationToOutcome(ev);
  const measurements = evaluationToMeasurements(ev);
  const governance: HsinGovernanceReviewRecord[] = [
    {
      id: `${outcome.id}-review-0`,
      outcome_id: outcome.id,
      decision_run_id: outcome.decision_run_id,
      reviewer_id: demo.validatedReview.reviewerId,
      decision: demo.validatedReview.decision,
      notes: demo.validatedReview.notes,
      status: demo.validatedReview.decision,
      created_at: demo.validatedReview.createdAt,
      updated_at: demo.validatedReview.createdAt,
    },
  ];
  const auditTrail = demoAuditTrail(demo.auditTrail);
  return {
    outcome,
    measurements,
    governance,
    auditTrail,
    decisionRun: evaluationToRun(ev),
  };
}

/** Map the engine audit steps → the OutcomeView audit-trail shape. */
function demoAuditTrail(
  steps: OutcomeAuditStep[],
): { step: string; detail: string; at?: string }[] {
  return steps.map((s) => ({ step: s.step, detail: s.detail, at: s.at }));
}

/** Demo GovernanceQueueData from the fixtures (pending outcomes + reviews + alerts). */
export function demoGovernanceQueue(): GovernanceQueueData {
  const demo = demoBundle();
  // Pending outcomes: those not yet successfully validated (use the non-winner
  // statuses as a stand-in for "needs a human verdict").
  const pendingOutcomes = demo.evaluations
    .filter((e) => e.outcomeStatus !== 'successful')
    .map(evaluationToOutcome);

  const reviews: HsinGovernanceReviewRecord[] = [
    {
      id: 'demo-review-pending',
      outcome_id: demoOutcomeId(demo.evaluations[0]?.recommendationId ?? 'rec-success'),
      decision_run_id: demo.review.decisionRunId,
      reviewer_id: demo.review.reviewerId,
      decision: demo.review.decision,
      notes: demo.review.notes,
      status: demo.review.decision,
      created_at: demo.review.createdAt,
      updated_at: demo.review.createdAt,
    },
    {
      id: 'demo-review-validated',
      outcome_id: demoOutcomeId(demo.evaluations[0]?.recommendationId ?? 'rec-success'),
      decision_run_id: demo.validatedReview.decisionRunId,
      reviewer_id: demo.validatedReview.reviewerId,
      decision: demo.validatedReview.decision,
      notes: demo.validatedReview.notes,
      status: demo.validatedReview.decision,
      created_at: demo.validatedReview.createdAt,
      updated_at: demo.validatedReview.createdAt,
    },
  ];

  const alerts = demo.alerts.map((a, i) => alertToRecord(a, i));

  return { pendingOutcomes, reviews, alerts };
}

/** Demo OutcomeDashboardHighlights for the operations strip. */
export function demoOutcomeHighlights(): OutcomeDashboardHighlights {
  const perf = demoPerformanceData();
  const queue = demoGovernanceQueue();
  return {
    successRate: perf.successRate,
    openAlerts: queue.alerts.filter((a) => a.status === 'open').length,
    pendingReviews: queue.pendingOutcomes.length,
    learningEntries: perf.learningTrends.length,
  };
}

/**
 * The raw decision/compare widget payload — mirrors the Phase-15 action's
 * `DecisionOutcomeWidget` ({ decisionRunId, outcomes, learning }) so the page can
 * pass the action result (or a demo build) straight through.
 */
export interface DecisionOutcomeWidgetData {
  decisionRunId: string;
  outcomes: HsinRecommendationOutcomeRecord[];
  learning: HsinConfidenceLearningRecord[];
}

/** A display rollup derived from a DecisionOutcomeWidgetData (pure, client-safe). */
export interface DecisionOutcomeWidgetSummary {
  outcomes: HsinRecommendationOutcomeRecord[];
  successRate?: number;
  avgConfidenceAfter?: number;
  worked: number;
  didNotWork: number;
}

/** Summarise a widget payload into the display rollup the component renders. */
export function summarizeOutcomeWidget(
  data: DecisionOutcomeWidgetData,
): DecisionOutcomeWidgetSummary {
  const outcomes = data.outcomes ?? [];
  const judged = outcomes.filter((o) => o.status && o.status !== 'inconclusive');
  const worked = outcomes.filter(
    (o) => o.status === 'successful' || o.status === 'partially_successful',
  ).length;
  const didNotWork = outcomes.filter(
    (o) => o.status === 'unsuccessful' || o.status === 'neutral',
  ).length;
  const avgConfidenceAfter =
    outcomes.length > 0
      ? outcomes.reduce((a, o) => a + (o.confidence_after ?? 0), 0) / outcomes.length
      : undefined;
  return {
    outcomes,
    successRate: judged.length > 0 ? worked / judged.length : undefined,
    avgConfidenceAfter,
    worked,
    didNotWork,
  };
}

/** Demo DecisionOutcomeWidgetData for a decision run (best-effort widget). */
export function demoDecisionOutcomeWidget(decisionRunId?: string): DecisionOutcomeWidgetData {
  const demo = demoBundle();
  return {
    decisionRunId: decisionRunId ?? 'demo-run',
    outcomes: demoOutcomeRecords(),
    learning: demo.mergedLearning.map((e, i) => ({
      id: `demo-learning-${i}`,
      intervention_type: e.interventionType,
      sample_count: e.sampleCount,
      success_count: e.successCount,
      avg_success_score: e.avgSuccessScore,
      calibrated_confidence: e.calibratedConfidence,
      adjustment: e.adjustment,
      rationale: e.rationale,
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    })),
  };
}
