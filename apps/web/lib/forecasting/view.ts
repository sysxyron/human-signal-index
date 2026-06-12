// =============================================================================
// HSI Phase 21 — client-safe view helpers for the forecasting dashboards
// (forecasts / scenarios / warnings).
//
// PURE + CLIENT-SAFE: NO server-only imports. Maps the Phase-21 unions →
// color/label, formats confidence/likelihood, reads jsonb, and builds clearly-
// LABELED demo view-models from the @hsi/forecast-engine + @hsi/scenario-engine
// fixtures so every page renders fully offline when an action returns
// NOT_CONFIGURED.
//
// EXPLAINABLE — every forecast is a hypothesis carrying assumptions/invalidation/
// limitations; warnings are advisory; nothing auto-acts.
// =============================================================================

import type {
  ForecastBoardRow,
  ForecastDetailData,
  ForecastStatus,
  ForecastingHighlights,
  ForecastsBoardData,
  HsinForecastReliabilityRecord,
  ScenarioDetailData,
  ScenarioState,
  ScenariosBoardData,
  WarningLevel,
  WarningsBoardData,
} from '@hsi/shared-types';
import {
  buildForecastExplanation,
  forecastDemo,
} from '@hsi/forecast-engine';
import {
  buildScenarioTree,
  compareScenarios,
  scenarioDemo,
} from '@hsi/scenario-engine';

/* decoration */
export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'cyan' | 'pink';
export interface Decorated { label: string; color: string; tone: Tone; description?: string }
const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8', blue: '#3B82F6', purple: '#8B5CF6', green: '#10B981',
  orange: '#F59E0B', red: '#EF4444', cyan: '#06B6D4', pink: '#EC4899',
};
export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}
function titleize(v: string): string {
  return v.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/* role gating */
const ROLE_RANK: Record<string, number> = { viewer: 0, contributor: 1, researcher: 2, reviewer: 3, editor: 3, curator: 4, admin: 5, owner: 6 };
function rank(role?: string | null): number {
  return role ? (ROLE_RANK[role.toLowerCase()] ?? -1) : -1;
}
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}
export function canCurate(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/* forecast status */
const FORECAST_DECOR: Record<ForecastStatus, Decorated> = {
  active: { label: 'Active', color: TONE_COLORS.blue, tone: 'blue' },
  monitoring: { label: 'Monitoring', color: TONE_COLORS.cyan, tone: 'cyan' },
  confirmed: { label: 'Confirmed', color: TONE_COLORS.green, tone: 'green' },
  failed: { label: 'Failed', color: TONE_COLORS.red, tone: 'red' },
  expired: { label: 'Expired', color: TONE_COLORS.neutral, tone: 'neutral' },
};
export function forecastStatusDecor(s?: ForecastStatus | string | null): Decorated {
  if (!s) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return FORECAST_DECOR[s as ForecastStatus] ?? { label: titleize(String(s)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* scenario state */
const SCENARIO_DECOR: Record<ScenarioState, Decorated> = {
  EMERGING: { label: 'Emerging', color: TONE_COLORS.cyan, tone: 'cyan' },
  ACTIVE: { label: 'Active', color: TONE_COLORS.blue, tone: 'blue' },
  MONITORING: { label: 'Monitoring', color: TONE_COLORS.purple, tone: 'purple' },
  CONFIRMED: { label: 'Confirmed', color: TONE_COLORS.green, tone: 'green' },
  INVALIDATED: { label: 'Invalidated', color: TONE_COLORS.red, tone: 'red' },
  ARCHIVED: { label: 'Archived', color: TONE_COLORS.neutral, tone: 'neutral' },
};
export function scenarioStateDecor(s?: ScenarioState | string | null): Decorated {
  if (!s) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return SCENARIO_DECOR[s as ScenarioState] ?? { label: titleize(String(s)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* warning level */
const WARNING_DECOR: Record<WarningLevel, Decorated> = {
  INFO: { label: 'Info', color: TONE_COLORS.blue, tone: 'blue' },
  WATCH: { label: 'Watch', color: TONE_COLORS.cyan, tone: 'cyan' },
  WARNING: { label: 'Warning', color: TONE_COLORS.orange, tone: 'orange' },
  CRITICAL: { label: 'Critical', color: TONE_COLORS.red, tone: 'red' },
};
export function warningLevelDecor(l?: WarningLevel | string | null): Decorated {
  if (!l) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return WARNING_DECOR[l as WarningLevel] ?? { label: titleize(String(l)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** Confidence band. */
export function confidenceBand(c?: number | null): Decorated {
  if (c == null || Number.isNaN(c)) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  if (c >= 0.7) return { label: 'High confidence', color: TONE_COLORS.green, tone: 'green' };
  if (c >= 0.5) return { label: 'Moderate confidence', color: TONE_COLORS.orange, tone: 'orange' };
  return { label: 'Low confidence', color: TONE_COLORS.red, tone: 'red' };
}

/* formatters */
export function formatPct(v?: number | null, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(Math.max(0, Math.min(1, v)) * 100).toFixed(digits)}%`;
}
export function formatBrier(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(Math.max(0, Math.min(1, v)).toFixed(3)).toString();
}
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function readStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  if (isRecord(value)) {
    for (const k of ['items', 'list', 'values']) {
      const inner = value[k];
      if (Array.isArray(inner)) return inner.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

/** Read a scenario-tree jsonb into a renderable node. */
export interface TreeNode { id: string; label: string; probability: number; children: TreeNode[] }
export function readTree(value: unknown): TreeNode | null {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? '');
  const label = String(value.label ?? '');
  const probability = typeof value.probability === 'number' ? value.probability : 0;
  const rawChildren = Array.isArray(value.children) ? value.children : [];
  const children = rawChildren.map((c) => readTree(c)).filter((c): c is TreeNode => c !== null);
  return { id, label, probability, children };
}

/* -------------------------------------------------------------------------- */
/* DEMO builders                                                               */
/* -------------------------------------------------------------------------- */
const DEMO_NOW = '2026-06-09T12:00:00.000Z';

let _fc: ReturnType<typeof forecastDemo> | null = null;
function fcBundle(): ReturnType<typeof forecastDemo> {
  if (!_fc) _fc = forecastDemo();
  return _fc;
}
let _sc: ReturnType<typeof scenarioDemo> | null = null;
function scBundle(): ReturnType<typeof scenarioDemo> {
  if (!_sc) _sc = scenarioDemo();
  return _sc;
}

export function demoForecastsBoard(): ForecastsBoardData {
  const d = fcBundle();
  const f = d.forecast;
  const rows: ForecastBoardRow[] = [{ id: f.forecastId, prediction: f.prediction, confidence: f.confidence, reliability: f.reliability, status: f.status, horizon: f.horizon, signalCount: f.supportingSignals.length, updatedAt: DEMO_NOW }];
  return {
    rows,
    byStatus: { active: 1 },
    accuracy: { id: 'demo-acc', scope: 'overall', success_rate: d.accuracy.successRate, failure_rate: d.accuracy.failureRate, ece: d.calibration.ece, brier_score: d.brier.score, drift: 0, sample_count: d.accuracy.sampleCount, bins: { items: d.calibration.bins }, computed_at: DEMO_NOW, created_at: DEMO_NOW },
  };
}

export function demoForecastDetail(): ForecastDetailData {
  const d = fcBundle();
  const f = d.forecast;
  const exp = buildForecastExplanation(f, { now: DEMO_NOW });
  return {
    forecast: { id: f.forecastId, prediction: f.prediction, confidence: f.confidence, reliability: f.reliability, status: f.status, horizon: f.horizon, supporting_signals: { items: f.supportingSignals }, assumptions: { items: f.assumptions }, invalidation_criteria: { items: f.invalidationCriteria }, limitations: { items: f.limitations }, version: f.version, expires_at: f.expiresAt, created_at: DEMO_NOW, updated_at: DEMO_NOW },
    explanation: { factors: exp.factors, assumptions: exp.assumptions, invalidationCriteria: exp.invalidationCriteria, limitations: exp.limitations, summary: exp.summary },
    outcomes: d.accuracy.sampleCount > 0 ? [{ id: 'demo-o', forecast_id: f.forecastId, confidence: 0.8, success: 1, observation: 'velocity rose', created_at: DEMO_NOW }] : [],
    versions: [{ id: 'demo-v', forecast_id: f.forecastId, version: 1, prediction: f.prediction, confidence: f.confidence, reliability: f.reliability, status: f.status, actor: 'analyst', reason: 'Generated.', at: DEMO_NOW, created_at: DEMO_NOW }],
    alerts: [],
  };
}

export function demoScenariosBoard(): ScenariosBoardData {
  const d = scBundle();
  const cmp = compareScenarios(d.scenarios, { now: DEMO_NOW });
  return {
    scenarios: d.scenarios.map((s) => ({ id: s.id, slug: s.id, title: s.title, description: s.description, state: s.state, likelihood: s.likelihood, drivers: { items: s.drivers }, forecast_ids: { items: s.forecastIds }, created_at: DEMO_NOW, updated_at: DEMO_NOW })),
    byState: { EMERGING: 2, ACTIVE: 1 },
    comparison: { id: 'demo-cmp', leading: cmp.leading ?? undefined, divergence: cmp.divergence, ranked: { items: cmp.ranked }, summary: cmp.summary, limitations: { items: cmp.limitations }, compared_at: DEMO_NOW, created_at: DEMO_NOW },
  };
}

export function demoScenarioDetail(): ScenarioDetailData {
  const d = scBundle();
  const s = d.scenarios[0];
  const tree = buildScenarioTree({ id: 'root', label: 'Narrative outlook', probability: 1, children: [{ id: 'a', label: 'Resurges', probability: 0.55 }, { id: 'b', label: 'Fades', probability: 0.3 }, { id: 'c', label: 'Mutates', probability: 0.15 }] });
  const ranked = d.comparison.ranked.map((r) => ({ id: r.id, title: r.title, likelihood: r.likelihood, rank: r.rank, share: r.share }));
  return {
    scenario: { id: s.id, slug: s.id, title: s.title, description: s.description, state: s.state, likelihood: s.likelihood, drivers: { items: s.drivers }, forecast_ids: { items: s.forecastIds }, created_at: DEMO_NOW },
    tree: { id: 'demo-tree', scenario_id: s.id, title: 'Outlook tree', tree: tree as unknown as Record<string, unknown>, created_at: DEMO_NOW },
    versions: [{ id: 'demo-v', scenario_id: s.id, from_state: 'EMERGING', to_state: 'ACTIVE', actor: 'analyst', reason: 'Promoted.', likelihood: s.likelihood, at: DEMO_NOW, created_at: DEMO_NOW }],
    ranked,
  };
}

export function demoWarningsBoard(): WarningsBoardData {
  const d = scBundle();
  const warnings = d.warnings.map((w) => ({ id: w.id, kind: w.kind, level: w.level, title: w.title, signal: w.signal, evidence: { items: w.evidence }, recommendation: w.recommendation, entity_id: w.entityId, status: 'open' as const, detected_at: w.detectedAt, created_at: w.detectedAt }));
  const byLevel: Record<WarningLevel, number> = { INFO: 0, WATCH: 0, WARNING: 0, CRITICAL: 0 };
  for (const w of warnings) byLevel[w.level] += 1;
  return { warnings, forecastAlerts: [], byLevel };
}

export function demoForecastingHighlights(): ForecastingHighlights {
  const fc = fcBundle();
  const sc = scBundle();
  return { activeForecasts: 1, forecastFailures: 0, scenarioShifts: sc.scenarios.length, warningAlerts: sc.warnings.length, forecastAccuracy: fc.accuracy.successRate, confidenceDrift: 0 };
}

/** Read forecast accuracy bins for the reliability chart. */
export interface BinRow { label: string; meanConfidence: number; observedSuccess: number; count: number }
export function readAccuracyBins(accuracy?: HsinForecastReliabilityRecord): BinRow[] {
  const raw = isRecord(accuracy?.bins) ? (accuracy!.bins as Record<string, unknown>).items : accuracy?.bins;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((r) => ({ label: String(r.label ?? ''), meanConfidence: typeof r.meanConfidence === 'number' ? r.meanConfidence : 0, observedSuccess: typeof r.observedSuccess === 'number' ? r.observedSuccess : 0, count: typeof r.count === 'number' ? r.count : 0 }));
}
