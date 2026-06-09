// =============================================================================
// HSI Phase 12 — client-safe view helpers for the Counterfactual Simulation UI
// (simulation dashboard / counterfactual view / backtesting / WorldForge
// scenarios / operations highlights).
//
// "What would have happened if X never happened — and how good are our
// forecasts, really?" PURE + CLIENT-SAFE: no server-only imports (no
// next/headers, no Supabase server client, no actions). These map the Phase-12
// domain unions → color/label, format confidences / deltas, safely read the
// engine `CounterfactualResult` out of a run's open-ended `results_json` jsonb,
// and build clearly-LABELED demo view-models from the @hsi/counterfactual-engine
// `counterfactualDemo()` fixtures so every Phase-12 page renders fully offline
// when an action returns NOT_CONFIGURED.
//
// NEVER FABRICATE, NEVER CERTAINTY — confidence + limitations are surfaced from
// the provided data; these helpers decorate, never invent. They never claim a
// counterfactual is what WOULD have happened, only an ESTIMATE for a human.
// =============================================================================

import type {
  BacktestingView,
  ConfidenceBand,
  CounterfactualActionType,
  CounterfactualRunView,
  CounterfactualScenarioType,
  HsinCounterfactualEventRecord,
  HsinCounterfactualRunRecord,
  HsinForecastAccuracyRecord,
  HsinNarrativeRecord,
  HsinSimulationResultRecord,
  HsinWorldforgeScenarioRecord,
  SimulationHighlights,
  SimulationOverview,
  WorldforgeScenariosView,
} from '@hsi/shared-types';
import {
  counterfactualDemo,
  type CounterfactualDemoResult,
  type CounterfactualResult,
  type CounterfactualWorld,
} from '@hsi/counterfactual-engine';

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

/** Researcher or above — can run counterfactuals, generate scenarios, rebuild. */
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/* -------------------------------------------------------------------------- */
/* Scenario type → color/label/description                                     */
/* -------------------------------------------------------------------------- */

export interface ScenarioDecor extends Decorated {
  /** A human "what if …?" framing of the scenario. */
  whatIf: string;
}

const SCENARIO_DECOR: Record<CounterfactualScenarioType, ScenarioDecor> = {
  remove_event: {
    label: 'Remove event',
    color: TONE_COLORS.red,
    tone: 'red',
    whatIf: 'What if that event never happened?',
    description: 'Replay the timeline with a key causal event removed.',
  },
  delay_event: {
    label: 'Delay event',
    color: TONE_COLORS.orange,
    tone: 'orange',
    whatIf: 'What if that event had been delayed?',
    description: 'Push a causal event later and re-propagate.',
  },
  accelerate_event: {
    label: 'Accelerate event',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    whatIf: 'What if that event had happened sooner?',
    description: 'Pull a causal event earlier and re-propagate.',
  },
  reduce_amplification: {
    label: 'Reduce amplification',
    color: TONE_COLORS.blue,
    tone: 'blue',
    whatIf: 'What if the amplification spike never occurred?',
    description: 'Dampen the amplification / reach term.',
  },
  increase_amplification: {
    label: 'Increase amplification',
    color: TONE_COLORS.orange,
    tone: 'orange',
    whatIf: 'What if the amplification had been even stronger?',
    description: 'Boost the amplification / reach term.',
  },
  remove_source: {
    label: 'Remove source',
    color: TONE_COLORS.red,
    tone: 'red',
    whatIf: 'What if the narrative never spread to new sources?',
    description: 'Strip the source-expansion that fed the narrative.',
  },
  add_source: {
    label: 'Add source',
    color: TONE_COLORS.green,
    tone: 'green',
    whatIf: 'What if even more sources had carried it?',
    description: 'Add source reach and re-propagate.',
  },
  remove_community: {
    label: 'Remove community',
    color: TONE_COLORS.purple,
    tone: 'purple',
    whatIf: 'What if it never reached new communities?',
    description: 'Strip the community-growth term.',
  },
  increase_reliability: {
    label: 'Increase reliability',
    color: TONE_COLORS.green,
    tone: 'green',
    whatIf: 'What if the narrative had been more credible?',
    description: 'Raise the reliability of carrying sources.',
  },
  decrease_reliability: {
    label: 'Decrease reliability',
    color: TONE_COLORS.orange,
    tone: 'orange',
    whatIf: 'What if the narrative had been less credible?',
    description: 'Lower the reliability of carrying sources.',
  },
  remove_contradiction: {
    label: 'Remove contradiction',
    color: TONE_COLORS.green,
    tone: 'green',
    whatIf: 'What if the contradictions never surfaced?',
    description: 'Strip contradicting-signal pressure.',
  },
  increase_contradiction: {
    label: 'Increase contradiction',
    color: TONE_COLORS.red,
    tone: 'red',
    whatIf: 'What if the contradictions had been louder?',
    description: 'Add contradicting-signal pressure.',
  },
};

export function scenarioDecor(
  type?: CounterfactualScenarioType | string | null,
): ScenarioDecor {
  if (!type) {
    return {
      label: 'Scenario',
      color: TONE_COLORS.neutral,
      tone: 'neutral',
      whatIf: 'What if?',
    };
  }
  const known = SCENARIO_DECOR[type as CounterfactualScenarioType];
  if (known) return known;
  return {
    label: titleize(String(type)),
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    whatIf: 'What if?',
  };
}

/** All 12 scenario types, for a picker. */
export function allScenarioTypes(): Array<{
  type: CounterfactualScenarioType;
  decor: ScenarioDecor;
}> {
  return (Object.keys(SCENARIO_DECOR) as CounterfactualScenarioType[]).map(
    (type) => ({ type, decor: SCENARIO_DECOR[type] }),
  );
}

/* -------------------------------------------------------------------------- */
/* Intervention action → color/label                                           */
/* -------------------------------------------------------------------------- */

const ACTION_DECOR: Record<CounterfactualActionType, Decorated> = {
  removed: { label: 'Removed', color: TONE_COLORS.red, tone: 'red' },
  reduced: { label: 'Reduced', color: TONE_COLORS.orange, tone: 'orange' },
  amplified: { label: 'Amplified', color: TONE_COLORS.cyan, tone: 'cyan' },
  delayed: { label: 'Delayed', color: TONE_COLORS.purple, tone: 'purple' },
  accelerated: { label: 'Accelerated', color: TONE_COLORS.green, tone: 'green' },
};

export function actionDecor(
  action?: CounterfactualActionType | string | null,
): Decorated {
  if (!action) {
    return { label: 'Changed', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = ACTION_DECOR[action as CounterfactualActionType];
  if (known) return known;
  return { label: titleize(String(action)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Confidence band → color/label                                               */
/* -------------------------------------------------------------------------- */

const BAND_DECOR: Record<ConfidenceBand, Decorated> = {
  high: {
    label: 'High confidence',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Empirically the best-supported band — still an estimate.',
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
  if (p >= 0.7) return 'high';
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

/** Format a fraction 0..1 as a percent with one decimal where useful. */
export function formatPct01(p?: number | null): string {
  if (p == null || Number.isNaN(p)) return '—';
  const v = Math.max(0, Math.min(1, p)) * 100;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
}

/** Format a signed percentage delta, e.g. +24% / -38%. */
export function formatDeltaPct(pct?: number | null): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  const rounded = Math.round(pct);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/** Format a signed absolute delta, e.g. +12.0 / -5.4. */
export function formatDelta(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

/** Tone for a signed delta — neutral around zero, green up, red down. */
export function deltaTone(value?: number | null): Tone {
  if (value == null || Number.isNaN(value) || value === 0) return 'neutral';
  return value > 0 ? 'green' : 'red';
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

export function readStringArray(
  payload: Record<string, unknown> | undefined | null,
  key: string,
): string[] {
  if (!payload) return [];
  const v = payload[key];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

/* -------------------------------------------------------------------------- */
/* Typed results_json reader (engine CounterfactualResult)                     */
/* -------------------------------------------------------------------------- */

/** A timeline frame in the original / counterfactual series. */
export interface TimelineFrame {
  timestamp: string;
  signals: number;
  sources: number;
  communities: number;
  amplification: number;
  forecast?: string;
}

/** The deltas between the two timelines. */
export interface CounterfactualDeltas {
  signalDeltaPct: number;
  amplificationDelta: number;
  forecastChanged: boolean;
  growthDeltaPct: number;
}

/** A single grounded event-level change. */
export interface CounterfactualChange {
  originalEventId?: string;
  eventType: string;
  action: CounterfactualActionType | string;
  impactScore: number;
  reasoning: string;
}

/** A strongly-typed projection of a run's open-ended `results_json`. */
export interface CounterfactualResultView {
  confidence: number;
  confidenceBand: ConfidenceBand;
  summary: string;
  reasoning: string[];
  limitations: string[];
  evidence: string[];
  changes: CounterfactualChange[];
  original: TimelineFrame[];
  counterfactual: TimelineFrame[];
  originalFinalState?: string;
  counterfactualFinalState?: string;
  deltas: CounterfactualDeltas;
}

function readFrames(value: unknown): TimelineFrame[] {
  if (!isRecord(value)) return [];
  const frames = value.frames;
  if (!Array.isArray(frames)) return [];
  return frames
    .filter(isRecord)
    .map((f) => ({
      timestamp: readString(f, 'timestamp') ?? '',
      signals: readNumber(f, 'signals') ?? 0,
      sources: readNumber(f, 'sources') ?? 0,
      communities: readNumber(f, 'communities') ?? 0,
      amplification: readNumber(f, 'amplification') ?? 0,
      forecast: readString(f, 'forecast'),
    }));
}

function readChanges(value: unknown): CounterfactualChange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((c) => ({
    originalEventId: readString(c, 'originalEventId'),
    eventType: readString(c, 'eventType') ?? 'event',
    action: readString(c, 'action') ?? 'changed',
    impactScore: readNumber(c, 'impactScore') ?? 0,
    reasoning: readString(c, 'reasoning') ?? '',
  }));
}

function readDeltas(value: unknown): CounterfactualDeltas {
  const d = isRecord(value) ? value : undefined;
  return {
    signalDeltaPct: readNumber(d, 'signalDeltaPct') ?? 0,
    amplificationDelta: readNumber(d, 'amplificationDelta') ?? 0,
    forecastChanged:
      d && typeof d.forecastChanged === 'boolean' ? d.forecastChanged : false,
    growthDeltaPct: readNumber(d, 'growthDeltaPct') ?? 0,
  };
}

/**
 * Read a run's open-ended `results_json` jsonb into a strongly typed view of the
 * engine `CounterfactualResult`. Tolerant of partial / missing payloads — every
 * field defaults safely so the UI never crashes on a malformed run. Falls back
 * to the run's top-level confidence/summary when the payload omits them.
 */
export function readCounterfactualResult(
  run: HsinCounterfactualRunRecord,
): CounterfactualResultView {
  const r = run.results_json ?? {};
  const confidence =
    readNumber(r, 'confidence') ?? (typeof run.confidence === 'number' ? run.confidence : 0);
  const band =
    (readString(r, 'confidenceBand') as ConfidenceBand | undefined) ??
    bandFromConfidence(confidence);
  const original = isRecord(r) ? r.original : undefined;
  const counterfactual = isRecord(r) ? r.counterfactual : undefined;
  return {
    confidence,
    confidenceBand: band,
    summary: readString(r, 'summary') ?? run.summary ?? '',
    reasoning: readStringArray(r, 'reasoning'),
    limitations: readStringArray(r, 'limitations'),
    evidence: readStringArray(r, 'evidence'),
    changes: readChanges(isRecord(r) ? r.changes : undefined),
    original: readFrames(original),
    counterfactual: readFrames(counterfactual),
    originalFinalState: isRecord(original)
      ? readString(original, 'finalForecastState')
      : undefined,
    counterfactualFinalState: isRecord(counterfactual)
      ? readString(counterfactual, 'finalForecastState')
      : undefined,
    deltas: readDeltas(isRecord(r) ? r.deltas : undefined),
  };
}

/* -------------------------------------------------------------------------- */
/* world_state reader — key metrics out of a WorldForge scenario              */
/* -------------------------------------------------------------------------- */

export interface WorldStateMetric {
  key: string;
  label: string;
  value: string;
}

/** Project a scenario's open-ended `world_state` jsonb into display metrics. */
export function readWorldStateMetrics(
  worldState: Record<string, unknown> | undefined | null,
): WorldStateMetric[] {
  if (!worldState) return [];
  const out: WorldStateMetric[] = [];
  for (const [key, raw] of Object.entries(worldState)) {
    let value: string;
    if (typeof raw === 'number') value = String(Math.round(raw * 100) / 100);
    else if (typeof raw === 'string') value = raw;
    else if (typeof raw === 'boolean') value = raw ? 'Yes' : 'No';
    else continue; // skip nested objects / arrays
    out.push({ key, label: titleize(key), value });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Derived selectors                                                           */
/* -------------------------------------------------------------------------- */

/** Average accuracy across forecast-accuracy records (0..1). */
export function meanAccuracy(rows: HsinForecastAccuracyRecord[]): number {
  const xs = rows
    .map((r) => r.accuracy_score)
    .filter((x): x is number => typeof x === 'number');
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Average calibration across forecast-accuracy records (0..1). */
export function meanCalibration(rows: HsinForecastAccuracyRecord[]): number {
  const xs = rows
    .map((r) => r.calibration_score)
    .filter((x): x is number => typeof x === 'number');
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Rank runs by confidence (most confident first). */
export function rankRuns(
  runs: HsinCounterfactualRunRecord[],
): HsinCounterfactualRunRecord[] {
  return [...runs].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — engine (camelCase) → shared-types records (snake_case)       */
/* Always labeled "Demo" by callers; pure offline fixtures.                    */
/* -------------------------------------------------------------------------- */

/** Fixed demo "now" matching the counterfactual fixtures. */
const DEMO_NOW = '2026-03-01T00:00:00.000Z';

const DEMO_NARRATIVE_NAMES: Record<string, string> = {
  'ai-jobs': 'AI & jobs',
  'crypto-crash': 'Crypto crash',
};

function demoNarrativeName(id: string): string {
  return DEMO_NARRATIVE_NAMES[id] ?? titleize(id);
}

function demoNarrativeRecord(id: string): HsinNarrativeRecord {
  return {
    id,
    name: demoNarrativeName(id),
    category: id.startsWith('ai-') ? 'economy' : 'finance',
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW,
  };
}

/** Stable id for a demo run derived from its scenario. */
function demoRunId(r: CounterfactualResult, i: number): string {
  return `demo-cf-${r.narrativeId}-${r.scenarioType}-${i}`;
}

/** Serialize an engine CounterfactualResult into the run.results_json shape. */
function resultToJson(r: CounterfactualResult): Record<string, unknown> {
  return {
    confidence: r.confidence,
    confidenceBand: r.confidenceBand,
    summary: r.summary,
    reasoning: r.reasoning,
    limitations: r.limitations,
    evidence: r.evidence,
    changes: r.changes.map((c) => ({
      originalEventId: c.originalEventId,
      eventType: c.eventType,
      action: c.action,
      impactScore: c.impactScore,
      reasoning: c.reasoning,
    })),
    original: r.original,
    counterfactual: r.counterfactual,
    deltas: r.deltas,
  };
}

function resultToRun(
  r: CounterfactualResult,
  i: number,
): HsinCounterfactualRunRecord {
  return {
    id: demoRunId(r, i),
    created_at: r.generatedAt,
    narrative_id: r.narrativeId,
    scenario_name: r.scenarioName,
    scenario_type: r.scenarioType as CounterfactualScenarioType,
    confidence: r.confidence,
    summary: r.summary,
    inputs_json: { scenarioType: r.scenarioType },
    results_json: resultToJson(r),
    generated_at: r.generatedAt,
  };
}

function resultToEvents(
  r: CounterfactualResult,
  runId: string,
): HsinCounterfactualEventRecord[] {
  return r.changes.map((c, i) => ({
    id: `${runId}-evt-${i}`,
    counterfactual_run_id: runId,
    original_event_id: c.originalEventId,
    action: c.action as CounterfactualActionType,
    impact_score: c.impactScore,
    reasoning: c.reasoning,
    created_at: r.generatedAt,
  }));
}

/** Run the offline counterfactual engine once (memo-free; deterministic). */
function demoBundle(): {
  out: CounterfactualDemoResult;
  runs: HsinCounterfactualRunRecord[];
} {
  const out = counterfactualDemo(DEMO_NOW);
  const runs = out.counterfactuals.map((r, i) => resultToRun(r, i));
  return { out, runs };
}

/** All demo narratives, for narrative pickers. */
export function demoNarratives(): HsinNarrativeRecord[] {
  const { runs } = demoBundle();
  const ids = Array.from(new Set(runs.map((r) => r.narrative_id)));
  return ids.map(demoNarrativeRecord);
}

/** Demo forecast-accuracy rows (one per demo narrative window). */
function demoAccuracy(out: CounterfactualDemoResult): HsinForecastAccuracyRecord[] {
  const a = out.accuracy;
  const narratives = demoNarratives();
  return narratives.map((n, i) => ({
    id: `demo-acc-${n.id}`,
    narrative_id: n.id,
    forecast_window: a.forecastWindow,
    prediction_count: a.predictionCount,
    // Vary slightly per narrative so the table isn't uniform, but keep grounded.
    accuracy_score: Math.max(0, Math.min(1, a.accuracyScore + (i === 0 ? 0 : -0.08))),
    calibration_score: Math.max(0, Math.min(1, a.calibrationScore + (i === 0 ? 0 : -0.05))),
    updated_at: DEMO_NOW,
    created_at: DEMO_NOW,
  }));
}

/** Demo simulation results (forecast vs actual) from the backtest history. */
function demoResults(
  out: CounterfactualDemoResult,
  runId: string,
): HsinSimulationResultRecord[] {
  return out.backtest.map((b, i) => ({
    id: `demo-res-${i}`,
    counterfactual_run_id: runId,
    forecast_id: b.forecastId,
    predicted_state: b.predictedState,
    predicted_probability: b.predictedProbability,
    actual_state: b.actualState,
    actual_probability: b.actualProbability,
    error_score: b.errorScore,
    created_at: DEMO_NOW,
  }));
}

function worldToScenario(
  w: CounterfactualWorld,
  runId: string,
  i: number,
): HsinWorldforgeScenarioRecord {
  return {
    id: `demo-scn-${i}`,
    counterfactual_run_id: runId,
    scenario_title: w.scenarioTitle,
    scenario_summary: w.scenarioSummary,
    world_state: w.worldState,
    confidence: w.confidence,
    created_at: DEMO_NOW,
  };
}

/** Demo SimulationOverview from the @hsi/counterfactual-engine fixtures. */
export function demoSimulationOverview(): SimulationOverview {
  const { out, runs } = demoBundle();
  const accuracy = demoAccuracy(out);
  const scenarios = out.worlds.map((w, i) =>
    worldToScenario(w, runs[i]?.id ?? demoRunId(out.counterfactuals[i], i), i),
  );
  return {
    recentRuns: runs,
    topRuns: rankRuns(runs),
    accuracy,
    scenarios,
    avgAccuracy: meanAccuracy(accuracy),
    avgCalibration: meanCalibration(accuracy),
  };
}

/** Demo CounterfactualRunView for one run id (defaults to the first run). */
export function demoCounterfactualRun(runId?: string): CounterfactualRunView | null {
  const { out, runs } = demoBundle();
  const run = (runId ? runs.find((r) => r.id === runId) : undefined) ?? runs[0];
  if (!run) return null;
  return {
    run,
    events: resultToEvents(
      out.counterfactuals[runs.indexOf(run)] ?? out.counterfactuals[0],
      run.id,
    ),
    results: demoResults(out, run.id),
    narrative: demoNarrativeRecord(run.narrative_id),
  };
}

/** All demo runs (for listing / picking). */
export function demoRuns(): HsinCounterfactualRunRecord[] {
  return demoBundle().runs;
}

/** Demo BacktestingView (accuracy + forecast-vs-actual + confidence drift). */
export function demoBacktesting(): BacktestingView {
  const { out, runs } = demoBundle();
  const accuracy = demoAccuracy(out);
  const results = demoResults(out, runs[0]?.id ?? 'demo-run');
  const narratives = demoNarratives();

  // Confidence drift: stated band confidence vs empirical accuracy per band.
  const confidenceDrift = out.calibration.bands.map((b) => ({
    window: bandDecor(b.band).label,
    stated: b.statedConfidence,
    empirical: b.empiricalAccuracy,
  }));

  return {
    accuracy,
    results,
    narratives,
    avgAccuracy: meanAccuracy(accuracy),
    avgCalibration: meanCalibration(accuracy),
    confidenceDrift,
  };
}

/** Demo WorldforgeScenariosView (materialized scenarios + source narratives). */
export function demoWorldforgeScenarios(): WorldforgeScenariosView {
  const { out, runs } = demoBundle();
  const scenarios = out.worlds.map((w, i) => {
    const run = runs[i] ?? runs[0];
    return { ...worldToScenario(w, run?.id ?? `demo-run-${i}`, i), run };
  });
  return { scenarios, narratives: demoNarratives() };
}

/** Demo simulation highlights for the operations strip. */
export function demoSimulationHighlights(): SimulationHighlights {
  const { out, runs } = demoBundle();
  const accuracy = demoAccuracy(out);
  const latest = runs[0];
  return {
    simulationQueue: runs.length,
    latestRun: latest
      ? {
          id: latest.id,
          narrativeId: latest.narrative_id,
          name: demoNarrativeName(latest.narrative_id),
          scenarioType: latest.scenario_type,
          confidence: latest.confidence ?? 0,
        }
      : undefined,
    forecastAccuracy: meanAccuracy(accuracy),
    calibrationHealth: meanCalibration(accuracy),
    scenariosGenerated: out.worlds.length,
  };
}
