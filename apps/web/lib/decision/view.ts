// =============================================================================
// HSI Phase 13 — client-safe view helpers for the Decision Intelligence &
// Strategic War-Gaming UI (decision dashboard / scenario battle / cross-narrative
// impacts / decision explorer / operations highlights).
//
// "What should we do next, and which intervention has the highest probability of
// success?" PURE + CLIENT-SAFE: no server-only imports (no next/headers, no
// Supabase server client, no actions). These map the Phase-13 domain unions →
// color/label, format confidences / effects / risks, safely read the engine's
// reasoning/limitations jsonb out of records, and build clearly-LABELED demo
// view-models from the @hsi/decision-intelligence `decisionDemo()` fixtures so
// every Phase-13 page renders fully offline when an action returns NOT_CONFIGURED.
//
// NEVER FABRICATE, NEVER CERTAINTY, NEVER BLACK-BOX — confidence + reasoning +
// limitations + audit are surfaced from the provided data; these helpers decorate
// and project, never invent. A recommendation is an AID for a human reviewer.
// =============================================================================

import type {
  ConfidenceBand,
  CrossNarrativeImpactView,
  DecisionDashboardData,
  DecisionExplorerResult,
  DecisionHighlights,
  DecisionImpactType,
  DecisionRunView,
  DecisionType,
  HsinCrossNarrativeImpactRecord,
  HsinDecisionAuditRecord,
  HsinDecisionRunRecord,
  HsinInterventionRankingRecord,
  HsinNarrativeRecord,
  HsinScenarioComparisonRecord,
  ScenarioComparisonView,
  ScenarioWinner,
} from '@hsi/shared-types';
import {
  decisionDemo,
  ALL_INTERVENTIONS,
  type CrossNarrativeImpact,
  type DecisionAudit,
  type DecisionDemoResult,
  type DecisionRun,
  type InterventionRanking,
  type InterventionType,
  type Recommendation,
  type ScenarioBattleResult,
} from '@hsi/decision-intelligence';

// Re-export the Phase-13 union the war-gaming components consume from this view
// surface (so they import decoration + types from one place).
export type { ScenarioWinner } from '@hsi/shared-types';

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

/** Researcher or above — can run decisions, war-game scenarios, rebuild. */
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/* -------------------------------------------------------------------------- */
/* Decision type → color/label/description (5 types)                           */
/* -------------------------------------------------------------------------- */

const DECISION_DECOR: Record<DecisionType, Decorated> = {
  intervention: {
    label: 'Intervene',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Take an active intervention to alter the narrative trajectory.',
  },
  monitor: {
    label: 'Monitor',
    color: TONE_COLORS.blue,
    tone: 'blue',
    description: 'Keep watching — no action warranted yet, but track it closely.',
  },
  escalate: {
    label: 'Escalate',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'Raise to a human decision-maker — high stakes or low confidence.',
  },
  no_action: {
    label: 'No action',
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    description: 'No intervention recommended — the trajectory does not warrant one.',
  },
  counter_narrative: {
    label: 'Counter-narrative',
    color: TONE_COLORS.purple,
    tone: 'purple',
    description: 'Recommend a counter-narrative response rather than a structural lever.',
  },
};

export function decisionTypeDecor(type?: DecisionType | string | null): Decorated {
  if (!type) {
    return { label: 'Decision', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = DECISION_DECOR[type as DecisionType];
  if (known) return known;
  return { label: titleize(String(type)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Intervention type → color/label (12 types — reuses counterfactual scenarios) */
/* -------------------------------------------------------------------------- */

export interface InterventionDecor extends Decorated {
  /** A human "do this" framing of the lever. */
  framing: string;
}

const INTERVENTION_DECOR: Record<InterventionType, InterventionDecor> = {
  remove_event: {
    label: 'Remove event',
    color: TONE_COLORS.red,
    tone: 'red',
    framing: 'Neutralize a key causal event before it lands.',
  },
  delay_event: {
    label: 'Delay event',
    color: TONE_COLORS.orange,
    tone: 'orange',
    framing: 'Push a causal event later to blunt its momentum.',
  },
  accelerate_event: {
    label: 'Accelerate event',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    framing: 'Bring a counter-event forward to pre-empt the narrative.',
  },
  reduce_amplification: {
    label: 'Reduce amplification',
    color: TONE_COLORS.blue,
    tone: 'blue',
    framing: 'Dampen the amplification / reach driving the spread.',
  },
  increase_amplification: {
    label: 'Increase amplification',
    color: TONE_COLORS.orange,
    tone: 'orange',
    framing: 'Boost amplification of a competing / corrective narrative.',
  },
  remove_source: {
    label: 'Remove source',
    color: TONE_COLORS.red,
    tone: 'red',
    framing: 'Cut off a source carrying the narrative.',
  },
  add_source: {
    label: 'Add source',
    color: TONE_COLORS.green,
    tone: 'green',
    framing: 'Recruit credible sources to carry a counter-message.',
  },
  remove_community: {
    label: 'Remove community',
    color: TONE_COLORS.purple,
    tone: 'purple',
    framing: 'Disrupt the community spread feeding the narrative.',
  },
  increase_reliability: {
    label: 'Increase reliability',
    color: TONE_COLORS.green,
    tone: 'green',
    framing: 'Raise the credibility of carrying sources.',
  },
  decrease_reliability: {
    label: 'Decrease reliability',
    color: TONE_COLORS.orange,
    tone: 'orange',
    framing: 'Expose the unreliability of carrying sources.',
  },
  remove_contradiction: {
    label: 'Remove contradiction',
    color: TONE_COLORS.green,
    tone: 'green',
    framing: 'Resolve contradictions that are stalling consensus.',
  },
  increase_contradiction: {
    label: 'Increase contradiction',
    color: TONE_COLORS.red,
    tone: 'red',
    framing: 'Surface contradicting evidence to slow the narrative.',
  },
};

export function interventionDecor(
  type?: InterventionType | string | null,
): InterventionDecor {
  if (!type) {
    return {
      label: 'Intervention',
      color: TONE_COLORS.neutral,
      tone: 'neutral',
      framing: 'A candidate strategic lever.',
    };
  }
  const known = INTERVENTION_DECOR[type as InterventionType];
  if (known) return known;
  return {
    label: titleize(String(type)),
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    framing: 'A candidate strategic lever.',
  };
}

/** All 12 intervention types, for a picker / multi-select. */
export function allInterventionTypes(): Array<{
  type: InterventionType;
  decor: InterventionDecor;
}> {
  return ALL_INTERVENTIONS.map((type) => ({ type, decor: interventionDecor(type) }));
}

/* -------------------------------------------------------------------------- */
/* Impact type → color/label (6 types)                                         */
/* -------------------------------------------------------------------------- */

const IMPACT_DECOR: Record<DecisionImpactType, Decorated> = {
  amplifies: {
    label: 'Amplifies',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'The source pushes the target the same direction — stronger together.',
  },
  dampens: {
    label: 'Dampens',
    color: TONE_COLORS.blue,
    tone: 'blue',
    description: 'The source suppresses the target.',
  },
  triggers: {
    label: 'Triggers',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'The source precedes and sets off the target.',
  },
  competes: {
    label: 'Competes',
    color: TONE_COLORS.purple,
    tone: 'purple',
    description: 'They contest the same audience on opposite trajectories.',
  },
  reinforces: {
    label: 'Reinforces',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Mutually self-reinforcing — a feedback loop.',
  },
  neutral: {
    label: 'Neutral',
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    description: 'No meaningful cross-narrative coupling detected.',
  },
};

export function impactTypeDecor(type?: DecisionImpactType | string | null): Decorated {
  if (!type) {
    return { label: 'Impact', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = IMPACT_DECOR[type as DecisionImpactType];
  if (known) return known;
  return { label: titleize(String(type)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Scenario winner → color/label                                               */
/* -------------------------------------------------------------------------- */

export function winnerDecor(winner?: ScenarioWinner | string | null): Decorated {
  switch (winner) {
    case 'A':
      return { label: 'Scenario A wins', color: TONE_COLORS.cyan, tone: 'cyan' };
    case 'B':
      return { label: 'Scenario B wins', color: TONE_COLORS.purple, tone: 'purple' };
    case 'tie':
      return { label: 'Too close to call', color: TONE_COLORS.neutral, tone: 'neutral' };
    default:
      return { label: 'Undecided', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

/* -------------------------------------------------------------------------- */
/* Confidence band → color/label                                               */
/* -------------------------------------------------------------------------- */

const BAND_DECOR: Record<ConfidenceBand, Decorated> = {
  high: {
    label: 'High confidence',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Best-supported band — still an estimate, never a certainty.',
  },
  medium: {
    label: 'Medium confidence',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Moderate support — treat as a working hypothesis.',
  },
  low: {
    label: 'Low confidence',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'Weakly supported — directional only, do not rely on it.',
  },
};

export function bandDecor(band?: ConfidenceBand | string | null): Decorated {
  if (!band) {
    return { label: 'Unknown confidence', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = BAND_DECOR[band as ConfidenceBand];
  if (known) return known;
  return { label: titleize(String(band)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** Derive a coarse band from a raw 0..1 confidence (engine convention). */
export function bandFromConfidence(p?: number | null): ConfidenceBand {
  if (p == null || Number.isNaN(p)) return 'low';
  if (p >= 0.66) return 'high';
  if (p >= 0.4) return 'medium';
  return 'low';
}

/* -------------------------------------------------------------------------- */
/* Numeric formatters                                                          */
/* -------------------------------------------------------------------------- */

/** Format a 0..1 confidence/probability as a percentage string, e.g. 72%. */
export function formatConfidence(p?: number | null): string {
  if (p == null || Number.isNaN(p)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

/** Format a signed expected effect (−100..100) e.g. +24 / -38. */
export function formatEffect(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

/** Tone for a signed effect — green dampens growth in a rising adversarial story
 * is good, but we keep it value-neutral: positive cyan, negative orange, 0 grey. */
export function effectTone(value?: number | null): Tone {
  if (value == null || Number.isNaN(value) || value === 0) return 'neutral';
  return value > 0 ? 'cyan' : 'orange';
}

/** Format a 0..100 risk score. */
export function formatRisk(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, value)))}`;
}

/** Tone for a 0..100 risk score — low green, mid orange, high red. */
export function riskTone(value?: number | null): Tone {
  if (value == null || Number.isNaN(value)) return 'neutral';
  if (value >= 70) return 'red';
  if (value >= 40) return 'orange';
  return 'green';
}

/** Format a 0..100 impact strength. */
export function formatStrength(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, value)))}`;
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

export function readNumber(
  payload: Record<string, unknown> | undefined | null,
  key: string,
): number | undefined {
  if (!payload) return undefined;
  const v = payload[key];
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

export function readString(
  payload: Record<string, unknown> | undefined | null,
  key: string,
): string | undefined {
  if (!payload) return undefined;
  const v = payload[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Read a jsonb value that is meant to be a `string[]`. Tolerant: accepts a bare
 * array of strings, OR an object with an `items`/`list`/`values` string[] field,
 * OR a single string (wrapped). Always returns a clean string[].
 */
export function readJsonbStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === 'string');
  }
  if (isRecord(value)) {
    for (const key of ['items', 'list', 'values', 'reasoning', 'limitations']) {
      const inner = value[key];
      if (Array.isArray(inner)) {
        return inner.filter((x): x is string => typeof x === 'string');
      }
    }
  }
  return [];
}

/** Read a decision run's `reasoning` jsonb (string[]) via the typed helper. */
export function readReasoning(run: HsinDecisionRunRecord): string[] {
  return readJsonbStringArray(run.reasoning);
}

/** Read a decision run's `limitations` jsonb (string[]) via the typed helper. */
export function readLimitations(run: HsinDecisionRunRecord): string[] {
  return readJsonbStringArray(run.limitations);
}

/** Read an audit's `limitations` jsonb (string[]). */
export function readAuditLimitations(audit: HsinDecisionAuditRecord): string[] {
  return readJsonbStringArray(audit.limitations);
}

/** A single decoded audit-log step. */
export interface AuditStep {
  step: string;
  detail: string;
  at?: string;
}

/** Decode an audit record's `audit_log` jsonb into ordered steps. */
export function readAuditLog(audit: HsinDecisionAuditRecord): AuditStep[] {
  const log = audit.audit_log;
  let arr: unknown[] = [];
  if (Array.isArray(log)) arr = log;
  else if (isRecord(log) && Array.isArray(log.steps)) arr = log.steps;
  return arr.filter(isRecord).map((s) => ({
    step: readString(s, 'step') ?? 'step',
    detail: readString(s, 'detail') ?? '',
    at: readString(s, 'at'),
  }));
}

/** Decode an audit record's `decision_output` jsonb into display key/value rows. */
export interface OutputEntry {
  key: string;
  label: string;
  value: string;
}

export function readDecisionOutput(audit: HsinDecisionAuditRecord): OutputEntry[] {
  const out = audit.decision_output;
  if (!isRecord(out)) return [];
  const entries: OutputEntry[] = [];
  for (const [key, raw] of Object.entries(out)) {
    let value: string;
    if (typeof raw === 'number') value = String(Math.round(raw * 1000) / 1000);
    else if (typeof raw === 'string') value = raw;
    else if (typeof raw === 'boolean') value = raw ? 'Yes' : 'No';
    else continue;
    entries.push({ key, label: titleize(key), value });
  }
  return entries;
}

/* -------------------------------------------------------------------------- */
/* Scenario A/B jsonb readers (scenario comparison records)                    */
/* -------------------------------------------------------------------------- */

export interface ScenarioSide {
  name: string;
  interventions: string[];
  metrics: { key: string; label: string; value: number }[];
}

function readMetrics(value: unknown): { key: string; label: string; value: number }[] {
  if (!isRecord(value)) return [];
  const out: { key: string; label: string; value: number }[] = [];
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && !Number.isNaN(raw)) {
      out.push({ key, label: titleize(key), value: Math.round(raw * 100) / 100 });
    }
  }
  return out;
}

/** Read a scenario side (A or B) out of a comparison's open-ended jsonb. */
export function readScenarioSide(
  value: Record<string, unknown> | undefined | null,
  fallbackName: string,
): ScenarioSide {
  const name = readString(value ?? undefined, 'name') ?? fallbackName;
  const rawInterventions = isRecord(value) ? value.interventions : undefined;
  const interventions = Array.isArray(rawInterventions)
    ? rawInterventions.filter((x): x is string => typeof x === 'string')
    : [];
  const metrics = readMetrics(isRecord(value) ? value.metrics : undefined);
  return { name, interventions, metrics };
}

/** Read a comparison's `comparison_reasoning` into a reasoning list. */
export function readComparisonReasoning(c: HsinScenarioComparisonRecord): string[] {
  const raw = c.comparison_reasoning;
  if (!raw) return [];
  // Engine joins with " | " — split it back out for a readable ordered list.
  return raw
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Derived selectors                                                           */
/* -------------------------------------------------------------------------- */

/** Average 0..1 confidence across decision runs. */
export function meanRunConfidence(runs: HsinDecisionRunRecord[]): number {
  const xs = runs
    .map((r) => r.confidence)
    .filter((x): x is number => typeof x === 'number');
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Rank decision runs by confidence (most confident first). */
export function rankRuns(runs: HsinDecisionRunRecord[]): HsinDecisionRunRecord[] {
  return [...runs].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

/** Sort intervention rankings by their rank_position (1 first). */
export function sortRankings(
  rankings: HsinInterventionRankingRecord[],
): HsinInterventionRankingRecord[] {
  return [...rankings].sort(
    (a, b) => (a.rank_position ?? 999) - (b.rank_position ?? 999),
  );
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — engine (camelCase) → shared-types records (snake_case)       */
/* Always labeled "Demo" by callers; pure offline fixtures.                    */
/* -------------------------------------------------------------------------- */

/** Fixed demo "now" matching the decision fixtures (FIXTURE_NOW). */
const DEMO_NOW = '2026-04-01T00:00:00.000Z';

const DEMO_NARRATIVE_NAMES: Record<string, string> = {
  'ai-surveillance': 'AI surveillance',
  'ai-ethics': 'AI ethics',
  'ai-regulation': 'AI regulation',
};

const DEMO_NARRATIVE_CATEGORY: Record<string, string> = {
  'ai-surveillance': 'security',
  'ai-ethics': 'ethics',
  'ai-regulation': 'policy',
};

function demoNarrativeName(id: string): string {
  return DEMO_NARRATIVE_NAMES[id] ?? titleize(id);
}

function demoNarrativeRecord(id: string): HsinNarrativeRecord {
  return {
    id,
    name: demoNarrativeName(id),
    category: DEMO_NARRATIVE_CATEGORY[id] ?? 'general',
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW,
  };
}

/** Stable id for the demo decision run. */
function demoRunId(run: DecisionRun): string {
  return `demo-decision-${run.narrativeId}`;
}

function recommendationRun(
  rec: Recommendation,
  run: DecisionRun,
): HsinDecisionRunRecord {
  return {
    id: demoRunId(run),
    created_at: run.generatedAt,
    narrative_id: run.narrativeId,
    decision_name: run.decisionName,
    decision_type: run.decisionType,
    confidence: rec.confidence,
    recommended_action: rec.recommendedAction,
    reasoning: { items: rec.reasoning },
    limitations: { items: rec.limitations },
    generated_at: run.generatedAt,
  };
}

function rankingRecord(
  r: InterventionRanking,
  runId: string,
  i: number,
): HsinInterventionRankingRecord {
  return {
    id: `${runId}-rank-${i}`,
    decision_run_id: runId,
    intervention_type: r.interventionType,
    expected_effect: r.expectedEffect,
    risk_score: r.riskScore,
    confidence: r.confidence,
    rank_position: r.rankPosition,
    reasoning: r.reasoning,
    created_at: DEMO_NOW,
  };
}

function battleRecord(
  b: ScenarioBattleResult,
  runId: string,
  i: number,
): HsinScenarioComparisonRecord {
  return {
    id: `${runId}-battle-${i}`,
    decision_run_id: runId,
    scenario_a: {
      name: b.scenarioA.name,
      interventions: b.scenarioA.interventions,
      metrics: b.metrics.a,
    },
    scenario_b: {
      name: b.scenarioB.name,
      interventions: b.scenarioB.interventions,
      metrics: b.metrics.b,
    },
    winner: b.winner,
    confidence: b.confidence,
    comparison_reasoning: b.reasoning.join(' | '),
    created_at: DEMO_NOW,
  };
}

function crossImpactRecord(
  c: CrossNarrativeImpact,
  i: number,
): HsinCrossNarrativeImpactRecord {
  return {
    id: `demo-impact-${i}`,
    source_narrative_id: c.sourceNarrativeId,
    target_narrative_id: c.targetNarrativeId,
    impact_type: c.impactType,
    impact_strength: c.impactStrength,
    confidence: c.confidence,
    reasoning: c.reasoning,
    created_at: DEMO_NOW,
  };
}

function auditRecord(audit: DecisionAudit, runId: string): HsinDecisionAuditRecord {
  return {
    id: `${runId}-audit`,
    decision_run_id: runId,
    decision_output: audit.decisionOutput,
    confidence: audit.confidence,
    limitations: { items: audit.limitations },
    audit_log: { steps: audit.auditLog },
    created_at: DEMO_NOW,
  };
}

/** Run the offline decision engine once (deterministic). */
function demoBundle(): {
  out: DecisionDemoResult;
  run: HsinDecisionRunRecord;
  runId: string;
} {
  const out = decisionDemo(DEMO_NOW);
  const runId = demoRunId(out.decisionRun);
  const run = recommendationRun(out.recommendation, out.decisionRun);
  return { out, run, runId };
}

/** All demo narratives, for narrative pickers. */
export function demoNarratives(): HsinNarrativeRecord[] {
  return ['ai-surveillance', 'ai-ethics', 'ai-regulation'].map(demoNarrativeRecord);
}

/** Demo DecisionDashboardData from the @hsi/decision-intelligence fixtures. */
export function demoDecisionDashboard(): DecisionDashboardData {
  const { out, run, runId } = demoBundle();
  const topRankings = out.rankings.map((r, i) => rankingRecord(r, runId, i));
  // Highest-risk narratives: derive a coarse risk from the cross-impact strengths
  // plus the top intervention's risk — grounded in the fixtures, never invented.
  const highestRiskNarratives = [
    {
      narrativeId: out.decisionRun.narrativeId,
      name: demoNarrativeName(out.decisionRun.narrativeId),
      riskScore: out.rankings[0]?.riskScore ?? 0,
    },
    ...out.crossImpacts.slice(0, 2).map((c) => ({
      narrativeId: c.targetNarrativeId,
      name: demoNarrativeName(c.targetNarrativeId),
      riskScore: c.impactStrength,
    })),
  ];
  return {
    recentRuns: [run],
    topRankings,
    highestRiskNarratives,
    recommendations: [run],
    avgConfidence: run.confidence ?? 0,
  };
}

/** Demo DecisionRunView for a run id (defaults to the single demo run). */
export function demoDecisionRun(runId?: string): DecisionRunView {
  const { out, run } = demoBundle();
  const id = run.id;
  const rankings = out.rankings.map((r, i) => rankingRecord(r, id, i));
  const comparisons = [out.decisiveBattle, out.closeBattle].map((b, i) =>
    battleRecord(b, id, i),
  );
  void runId;
  return {
    run,
    rankings,
    comparisons,
    audit: auditRecord(out.audit, id),
    narrative: demoNarrativeRecord(run.narrative_id),
  };
}

/** Demo ScenarioComparisonView (the two demo battles + source narratives). */
export function demoScenarioComparisons(): ScenarioComparisonView {
  const { out, run, runId } = demoBundle();
  const comparisons = [out.decisiveBattle, out.closeBattle].map((b, i) => ({
    ...battleRecord(b, runId, i),
    run,
  }));
  return { comparisons, narratives: demoNarratives() };
}

/** Demo engine ScenarioBattleResult for a fresh war-game (the decisive battle). */
export function demoScenarioBattle(): ScenarioBattleResult {
  return demoBundle().out.decisiveBattle;
}

/** Demo CrossNarrativeImpactView (the fixture cross-impacts + narratives). */
export function demoCrossImpacts(): CrossNarrativeImpactView {
  const { out } = demoBundle();
  return {
    narratives: demoNarratives(),
    impacts: out.crossImpacts.map((c, i) => crossImpactRecord(c, i)),
  };
}

/** Demo DecisionExplorerResult for a narrative + intervention type. */
export function demoExplorerResult(
  narrativeId: string,
  interventionType: string,
): DecisionExplorerResult {
  const { out } = demoBundle();
  // Find the matching ranking in the demo run, else fall back to the top one.
  const ranking =
    out.rankings.find((r) => r.interventionType === interventionType) ??
    out.rankings[0];
  return {
    narrativeId,
    interventionType: ranking?.interventionType ?? interventionType,
    expectedEffect: ranking?.expectedEffect ?? 0,
    riskScore: ranking?.riskScore ?? 0,
    confidence: ranking?.confidence ?? 0,
    reasoning: ranking ? [ranking.reasoning] : [],
    limitations: out.recommendation.limitations,
  };
}

/** Demo DecisionHighlights for the operations strip. */
export function demoDecisionHighlights(): DecisionHighlights {
  const { out } = demoBundle();
  return {
    decisionHealth: out.recommendation.confidence,
    recommendationQueue: 1,
    topRisks: [
      {
        narrativeId: out.decisionRun.narrativeId,
        name: demoNarrativeName(out.decisionRun.narrativeId),
        riskScore: out.rankings[0]?.riskScore ?? 0,
      },
    ],
    scenarioBattles: 2,
    crossNarrativeEffects: out.crossImpacts.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Engine → record adapters (for live action results that return engine types) */
/* -------------------------------------------------------------------------- */

/**
 * Project an engine `ScenarioBattleResult` into a `HsinScenarioComparisonRecord`
 * for display (the war-game action returns the engine battle, not a persisted
 * row). Pure / client-safe; never invents — copies metrics, winner, confidence,
 * and joins the reasoning trail the same way the persistence layer does.
 */
export function battleToRecord(
  battle: ScenarioBattleResult,
  opts?: { id?: string; decisionRunId?: string; createdAt?: string },
): HsinScenarioComparisonRecord {
  return {
    id: opts?.id ?? `battle-${battle.scenarioA.name}-vs-${battle.scenarioB.name}`,
    decision_run_id: opts?.decisionRunId ?? '',
    scenario_a: {
      name: battle.scenarioA.name,
      interventions: battle.scenarioA.interventions,
      metrics: battle.metrics.a,
    },
    scenario_b: {
      name: battle.scenarioB.name,
      interventions: battle.scenarioB.interventions,
      metrics: battle.metrics.b,
    },
    winner: battle.winner,
    confidence: battle.confidence,
    comparison_reasoning: battle.reasoning.join(' | '),
    created_at: opts?.createdAt ?? DEMO_NOW,
  };
}
