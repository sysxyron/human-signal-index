// =============================================================================
// HSI Phase 16 — client-safe view helpers for the Calibration & Trust UI
// (calibration dashboard / calibration snapshot detail / trust dashboard +
// drawer + overrides + the operations highlights strip + the decisions trust
// badge).
//
// "What does 82% confidence ACTUALLY mean, and how trustworthy is this?"
//
// PURE + CLIENT-SAFE: NO server-only imports (no next/headers, no Supabase
// server client, no actions). These map the Phase-16 domain unions →
// color/label, format ECE / MCE / Brier / trust scores, safely read the engine's
// reliability `curve` / `explanation` / `limitations` jsonb out of records, and
// build clearly-LABELED demo view-models from the @hsi/calibration-engine
// `calibrationDemo()` fixtures so every Phase-16 page renders fully offline when
// an action returns NOT_CONFIGURED.
//
// EXPLAINABLE, NEVER BLACK-BOX, NEVER CERTAINTY — every score carries the numbers
// that produced it + explicit limitations; drift only RECOMMENDS recalibration;
// overrides are always logged with a reason. These helpers decorate and project,
// never invent.
// =============================================================================

import type {
  CalibrationDashboardData,
  CalibrationHighlights,
  CalibrationQuality,
  CalibrationView,
  ConfidenceDriftKind,
  HsinBrierScoreRecord,
  HsinCalibrationSnapshotRecord,
  HsinConfidenceDriftRecord,
  HsinDecisionTrustRecord,
  HsinForecastTrustRecord,
  HsinNarrativeTrustRecord,
  HsinReliabilityCurveRecord,
  HsinSourceTrustRecord,
  TrustBand,
  TrustDashboardData,
  TrustEntityType,
  TrustView,
} from '@hsi/shared-types';
import {
  calibrationDemo,
  type BrierResult,
  type CalibrationBin,
  type ReliabilityCurve,
  type TrustScore,
} from '@hsi/calibration-engine';

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

/**
 * Researcher or above — may VIEW the calibration + trust dashboards. The server
 * re-checks via getSessionRole; this is the client-side gate for read surfaces.
 */
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/**
 * Curator or above — may MODIFY trust (override) and recompute calibration /
 * trust. The server re-checks via getSessionRole; this gates the controls.
 */
export function canCurate(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/* -------------------------------------------------------------------------- */
/* Confidence-drift kind → color/label/description (5 kinds)                    */
/* -------------------------------------------------------------------------- */

const DRIFT_DECOR: Record<ConfidenceDriftKind, Decorated> = {
  overconfidence: {
    label: 'Overconfidence',
    color: TONE_COLORS.red,
    tone: 'red',
    description:
      'Stated confidence runs ahead of observed success — predictions are too sure.',
  },
  underconfidence: {
    label: 'Underconfidence',
    color: TONE_COLORS.blue,
    tone: 'blue',
    description:
      'Observed success exceeds stated confidence — predictions are too cautious.',
  },
  degradation: {
    label: 'Degradation',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Calibration error has grown relative to the prior snapshot.',
  },
  improvement: {
    label: 'Improvement',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Calibration error has shrunk relative to the prior snapshot.',
  },
  stable: {
    label: 'Stable',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'Calibration is holding steady within the drift threshold.',
  },
};

export function driftDecor(kind?: ConfidenceDriftKind | string | null): Decorated {
  if (!kind) {
    return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = DRIFT_DECOR[kind as ConfidenceDriftKind];
  if (known) return known;
  return { label: titleize(String(kind)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Calibration quality → color/label/description (5 buckets)                    */
/* -------------------------------------------------------------------------- */

const QUALITY_DECOR: Record<CalibrationQuality, Decorated> = {
  excellent: {
    label: 'Excellent',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Confidence tracks observed outcomes very closely.',
  },
  good: {
    label: 'Good',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'Confidence is well aligned with observed outcomes.',
  },
  fair: {
    label: 'Fair',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Confidence is roughly aligned but has noticeable error.',
  },
  poor: {
    label: 'Poor',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'Confidence diverges substantially from observed outcomes.',
  },
  insufficient_data: {
    label: 'Insufficient data',
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    description: 'Too few observations to judge calibration honestly.',
  },
};

export function qualityDecor(quality?: CalibrationQuality | string | null): Decorated {
  if (!quality) {
    return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = QUALITY_DECOR[quality as CalibrationQuality];
  if (known) return known;
  return { label: titleize(String(quality)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** Derive a calibration-quality bucket from a Brier score (engine thresholds). */
export function brierQuality(
  score?: number | null,
  sampleCount?: number | null,
): CalibrationQuality {
  if (sampleCount != null && sampleCount < 10) return 'insufficient_data';
  if (score == null || Number.isNaN(score)) return 'insufficient_data';
  if (score <= 0.1) return 'excellent';
  if (score <= 0.2) return 'good';
  if (score <= 0.3) return 'fair';
  return 'poor';
}

/* -------------------------------------------------------------------------- */
/* Trust band → color/label/description (3 bands)                               */
/* -------------------------------------------------------------------------- */

const BAND_DECOR: Record<TrustBand, Decorated> = {
  high: {
    label: 'High trust',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Strong, well-evidenced track record — still advisory, never certain.',
  },
  medium: {
    label: 'Medium trust',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Mixed or thin evidence — treat with caution.',
  },
  low: {
    label: 'Low trust',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'Weak track record or very little evidence — corroborate independently.',
  },
};

export function bandDecor(band?: TrustBand | string | null): Decorated {
  if (!band) {
    return { label: 'Unrated', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = BAND_DECOR[band as TrustBand];
  if (known) return known;
  return { label: titleize(String(band)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** Map a 0..100 trust score to its band (engine thresholds: ≥70 high, ≥40 medium). */
export function bandFromScore(score?: number | null): TrustBand {
  if (score == null || Number.isNaN(score)) return 'low';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/* -------------------------------------------------------------------------- */
/* Trust-entity type → label/icon-tone (6 types)                                */
/* -------------------------------------------------------------------------- */

const ENTITY_DECOR: Record<TrustEntityType, Decorated> = {
  source: { label: 'Source', color: TONE_COLORS.blue, tone: 'blue' },
  narrative: { label: 'Narrative', color: TONE_COLORS.purple, tone: 'purple' },
  forecast: { label: 'Forecast', color: TONE_COLORS.cyan, tone: 'cyan' },
  decision: { label: 'Decision', color: TONE_COLORS.green, tone: 'green' },
  intervention: { label: 'Intervention', color: TONE_COLORS.orange, tone: 'orange' },
  recommendation: { label: 'Recommendation', color: TONE_COLORS.pink, tone: 'pink' },
};

export function entityTypeDecor(type?: TrustEntityType | string | null): Decorated {
  if (!type) {
    return { label: 'Entity', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
  const known = ENTITY_DECOR[type as TrustEntityType];
  if (known) return known;
  return { label: titleize(String(type)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** The four ranked trust sections in display order. */
export const TRUST_ENTITY_SECTIONS: TrustEntityType[] = [
  'source',
  'narrative',
  'forecast',
  'decision',
];

/* -------------------------------------------------------------------------- */
/* Numeric formatters                                                          */
/* -------------------------------------------------------------------------- */

/** Format a 0..1 error metric (ECE / MCE / calibration error) as a %, e.g. 4.2%. */
export function formatErrorPct(value?: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(digits)}%`;
}

/** Format a 0..1 rate (confidence / observed success) as a %, e.g. 80.9%. */
export function formatRate(value?: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(digits)}%`;
}

/** Format a 0..1 Brier score to 3 dp (lower is better), e.g. 0.083. */
export function formatBrier(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return Number(Math.max(0, Math.min(1, value)).toFixed(3)).toString();
}

/** Format a signed overconfidence index, e.g. +0.18 / -0.07. */
export function formatSigned(value?: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

/** Format a 0..100 trust score, e.g. 78. */
export function formatTrustScore(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, value)))}`;
}

/** Tone for a 0..100 trust score (matches the band thresholds). */
export function trustScoreTone(value?: number | null): Tone {
  return bandDecor(bandFromScore(value)).tone;
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

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

/**
 * Read a jsonb value meant to be a `string[]` (explanation / limitations).
 * Tolerant: accepts a bare string[], an object with an
 * `items`/`list`/`values`/`explanation`/`limitations` field, or a single
 * string. Always returns a clean string[].
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

/** A normalised reliability-diagram bin (predicted confidence vs observed success). */
export interface DiagramBin {
  lower: number;
  upper: number;
  label: string;
  count: number;
  meanConfidence: number;
  observedSuccess: number;
  calibrationError: number;
}

function binLabel(lower: number, upper: number): string {
  return `${Math.round(lower * 100)}–${Math.round(upper * 100)}%`;
}

/**
 * Read the per-bin reliability rows for a snapshot. PREFERS the dedicated
 * HsinReliabilityCurveRecord rows; falls back to decoding the snapshot's `curve`
 * jsonb (the engine's ReliabilityCurve.bins) when no rows are present.
 */
export function readReliabilityBins(
  curves: HsinReliabilityCurveRecord[] | undefined,
  snapshotCurveJsonb?: Record<string, unknown> | null,
): DiagramBin[] {
  const fromRows = (curves ?? [])
    .map((c) => {
      const lower = c.bin_lower ?? 0;
      const upper = c.bin_upper ?? 0;
      const meanConfidence = c.mean_confidence ?? 0;
      const observedSuccess = c.observed_success ?? 0;
      return {
        lower,
        upper,
        label: binLabel(lower, upper),
        count: c.count ?? 0,
        meanConfidence,
        observedSuccess,
        calibrationError:
          c.calibration_error ?? Math.abs(meanConfidence - observedSuccess),
      } satisfies DiagramBin;
    })
    .sort((a, b) => a.lower - b.lower);

  if (fromRows.length > 0) return fromRows;

  // Fallback: decode the snapshot's `curve` jsonb (engine ReliabilityCurve).
  if (isRecord(snapshotCurveJsonb)) {
    const bins = snapshotCurveJsonb.bins;
    if (Array.isArray(bins)) {
      return bins
        .map((raw): DiagramBin | null => {
          if (!isRecord(raw)) return null;
          const lower = asNumber(raw.lower) ?? 0;
          const upper = asNumber(raw.upper) ?? 0;
          const meanConfidence = asNumber(raw.meanConfidence) ?? 0;
          const observedSuccess = asNumber(raw.observedSuccess) ?? 0;
          return {
            lower,
            upper,
            label: typeof raw.label === 'string' ? raw.label : binLabel(lower, upper),
            count: asNumber(raw.count) ?? 0,
            meanConfidence,
            observedSuccess,
            calibrationError:
              asNumber(raw.calibrationError) ??
              Math.abs(meanConfidence - observedSuccess),
          };
        })
        .filter((b): b is DiagramBin => b !== null)
        .sort((a, b) => a.lower - b.lower);
    }
  }
  return [];
}

/** Read a Brier score's reliability/resolution/uncertainty decomposition jsonb. */
export interface BrierDecomposition {
  reliability?: number;
  resolution?: number;
  uncertainty?: number;
}
export function readBrierDecomposition(
  value?: Record<string, unknown> | null,
): BrierDecomposition | undefined {
  if (!isRecord(value)) return undefined;
  const reliability = asNumber(value.reliability);
  const resolution = asNumber(value.resolution);
  const uncertainty = asNumber(value.uncertainty);
  if (reliability === undefined && resolution === undefined && uncertainty === undefined) {
    return undefined;
  }
  return { reliability, resolution, uncertainty };
}

/* -------------------------------------------------------------------------- */
/* Trust-row normalisation (the four record shapes share a common projection)   */
/* -------------------------------------------------------------------------- */

/** A unified trust-ranking row across the four entity record types. */
export interface TrustRow {
  entityType: TrustEntityType;
  entityId: string;
  trustScore: number;
  confidence: number;
  evidenceCount: number;
  calibrationScore: number;
  band: TrustBand;
  overridden: boolean;
  overrideReason?: string;
  lastUpdated?: string;
}

type AnyTrustRecord =
  | HsinSourceTrustRecord
  | HsinNarrativeTrustRecord
  | HsinForecastTrustRecord
  | HsinDecisionTrustRecord;

function entityIdOf(record: AnyTrustRecord, type: TrustEntityType): string {
  if (type === 'source') return (record as HsinSourceTrustRecord).source_id ?? record.id;
  if (type === 'narrative')
    return (record as HsinNarrativeTrustRecord).narrative_id ?? record.id;
  if (type === 'forecast')
    return (record as HsinForecastTrustRecord).narrative_id ?? record.id;
  if (type === 'decision')
    return (record as HsinDecisionTrustRecord).decision_run_id ?? record.id;
  return record.id;
}

/** Project any trust record into the unified TrustRow (band derived if absent). */
export function toTrustRow(record: AnyTrustRecord, type: TrustEntityType): TrustRow {
  const trustScore = record.trust_score ?? 0;
  return {
    entityType: type,
    entityId: entityIdOf(record, type),
    trustScore,
    confidence: record.confidence ?? 0,
    evidenceCount: record.evidence_count ?? 0,
    calibrationScore: record.calibration_score ?? 0,
    band: record.band ?? bandFromScore(trustScore),
    overridden: Boolean(record.overridden),
    overrideReason: record.override_reason,
    lastUpdated: record.last_updated ?? record.updated_at,
  };
}

/** All trust rows for one section of the dashboard, ranked high→low. */
export function trustRowsForSection(
  data: TrustDashboardData,
  type: TrustEntityType,
): TrustRow[] {
  let records: AnyTrustRecord[] = [];
  if (type === 'source') records = data.sources;
  else if (type === 'narrative') records = data.narratives;
  else if (type === 'forecast') records = data.forecasts;
  else if (type === 'decision') records = data.decisions;
  return records
    .map((r) => toTrustRow(r, type))
    .sort((a, b) => b.trustScore - a.trustScore);
}

/** Filter a set of rows by band (querystring-driven; 'all' passes everything). */
export function filterRowsByBand(rows: TrustRow[], band?: string | null): TrustRow[] {
  if (!band || band === 'all') return rows;
  return rows.filter((r) => r.band === band);
}

/** A trust-score histogram across rows (5 buckets of 20 points each). */
export interface TrustHistogramBucket {
  label: string;
  lower: number;
  upper: number;
  count: number;
}
export function trustHistogram(rows: TrustRow[]): TrustHistogramBucket[] {
  const edges = [0, 20, 40, 60, 80, 100];
  const buckets: TrustHistogramBucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lower = edges[i];
    const upper = edges[i + 1];
    const count = rows.filter((r) => {
      const s = r.trustScore;
      return i === edges.length - 2 ? s >= lower && s <= upper : s >= lower && s < upper;
    }).length;
    buckets.push({ label: `${lower}–${upper}`, lower, upper, count });
  }
  return buckets;
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — engine (camelCase) → shared-types records (snake_case)        */
/* Always labeled "Demo" by callers; pure offline fixtures.                    */
/* -------------------------------------------------------------------------- */

const DEMO_NOW = '2026-06-09T12:00:00.000Z';

/** Run the offline calibration engine once (deterministic, memoised). */
let _demo: ReturnType<typeof calibrationDemo> | null = null;
function demoBundle(): ReturnType<typeof calibrationDemo> {
  if (!_demo) _demo = calibrationDemo();
  return _demo;
}

/** The engine reliability curve → per-bin curve records. */
function curveToRecords(
  curve: ReliabilityCurve,
  snapshotId: string,
): HsinReliabilityCurveRecord[] {
  return curve.bins.map((b: CalibrationBin, i): HsinReliabilityCurveRecord => ({
    id: `${snapshotId}-bin-${i}`,
    calibration_snapshot_id: snapshotId,
    bin_lower: b.lower,
    bin_upper: b.upper,
    count: b.count,
    mean_confidence: b.meanConfidence,
    observed_success: b.observedSuccess,
    calibration_error: b.calibrationError,
    created_at: DEMO_NOW,
  }));
}

/** The engine reliability curve + brier → a calibration snapshot record. */
function curveToSnapshot(
  curve: ReliabilityCurve,
  brier: BrierResult,
  id: string,
  scope: string,
): HsinCalibrationSnapshotRecord {
  return {
    id,
    scope,
    kind: 'all',
    sample_count: curve.sampleCount,
    expected_calibration_error: curve.expectedCalibrationError,
    max_calibration_error: curve.maxCalibrationError,
    overconfidence_index: curve.overconfidenceIndex,
    brier_score: brier.score,
    curve: { bins: curve.bins as unknown as Record<string, unknown>[] },
    generated_at: curve.generatedAt,
    created_at: DEMO_NOW,
  };
}

function brierToRecord(
  brier: BrierResult,
  id: string,
  scope: string,
  kind: string,
): HsinBrierScoreRecord {
  return {
    id,
    scope,
    kind,
    score: brier.score,
    sample_count: brier.sampleCount,
    calibration_quality: brier.calibrationQuality,
    interpretation: brier.interpretation,
    decomposition: brier.decomposition
      ? (brier.decomposition as unknown as Record<string, unknown>)
      : undefined,
    created_at: DEMO_NOW,
  };
}

function driftToRecord(
  key: string,
  result: ReturnType<typeof calibrationDemo>['drift'][string]['result'],
): HsinConfidenceDriftRecord {
  return {
    id: `demo-drift-${key}`,
    scope: 'all',
    drift_kind: result.kind,
    magnitude: result.magnitude,
    current_ece: result.currentEce,
    prior_ece: result.priorEce,
    recommendation: result.recommendation,
    explanation: result.explanation,
    detected_at: result.detectedAt,
    created_at: DEMO_NOW,
  };
}

/** Demo CalibrationDashboardData from the @hsi/calibration-engine fixtures. */
export function demoCalibrationDashboard(): CalibrationDashboardData {
  const demo = demoBundle();
  const snapshotId = 'demo-snapshot-current';
  const snapshot = curveToSnapshot(demo.curve, demo.brierOverall, snapshotId, 'all');
  const curves = curveToRecords(demo.curve, snapshotId);

  // Brier rows: overall + per-kind (each labeled by kind).
  const brier: HsinBrierScoreRecord[] = [
    brierToRecord(demo.brierOverall, 'demo-brier-overall', 'all', 'all'),
    ...(Object.keys(demo.brierByKind) as (keyof typeof demo.brierByKind)[]).map((k) =>
      brierToRecord(demo.brierByKind[k], `demo-brier-${k}`, 'all', String(k)),
    ),
  ];

  // Drift: surface the over/under/degradation/improvement/stable detections.
  const drift: HsinConfidenceDriftRecord[] = (
    Object.keys(demo.drift) as (keyof typeof demo.drift)[]
  ).map((k) => driftToRecord(String(k), demo.drift[k].result));

  // Trend: a small deterministic ECE/Brier walk across "snapshots" so the trend
  // chart renders — labeled demo. Ends at the current snapshot's real values.
  const ece = demo.curve.expectedCalibrationError;
  const b = demo.brierOverall.score;
  const trend = [
    { generatedAt: '2026-03-01T00:00:00.000Z', ece: ece + 0.06, brier: b + 0.05 },
    { generatedAt: '2026-04-01T00:00:00.000Z', ece: ece + 0.04, brier: b + 0.03 },
    { generatedAt: '2026-05-01T00:00:00.000Z', ece: ece + 0.02, brier: b + 0.015 },
    { generatedAt: demo.curve.generatedAt, ece, brier: b },
  ];

  return { snapshot, curves, brier, drift, trend };
}

/** Demo CalibrationView (single snapshot detail) — defaults to the current one. */
export function demoCalibrationView(id?: string): CalibrationView {
  const demo = demoBundle();
  const snapshotId = id?.trim() || 'demo-snapshot-current';
  const snapshot = curveToSnapshot(demo.curve, demo.brierOverall, snapshotId, 'all');
  const curves = curveToRecords(demo.curve, snapshotId);
  const brier = brierToRecord(demo.brierOverall, `${snapshotId}-brier`, 'all', 'all');
  const driftKey = (Object.keys(demo.drift) as (keyof typeof demo.drift)[])[0];
  const drift = driftToRecord(String(driftKey), demo.drift[driftKey].result);
  return { snapshot, curves, brier, drift };
}

/** The engine confidenceMeaning for the demo (82% → historical success). */
export function demoConfidenceMeaning(): {
  statedConfidence: number;
  historicalSuccess: number;
  sampleCount: number;
  sentence: string;
} {
  return demoBundle().meaning82;
}

/* ----- Trust demo --------------------------------------------------------- */

function trustScoreToSource(t: TrustScore): HsinSourceTrustRecord {
  return {
    id: `demo-source-trust-${t.entityId}`,
    source_id: t.entityId,
    trust_score: t.trustScore,
    confidence: t.confidence,
    evidence_count: t.evidenceCount,
    calibration_score: t.calibrationScore,
    band: t.band,
    explanation: { items: t.explanation },
    limitations: { items: t.limitations },
    overridden: false,
    last_updated: t.lastUpdated,
    created_at: DEMO_NOW,
    updated_at: t.lastUpdated,
  };
}

function trustScoreToNarrative(t: TrustScore): HsinNarrativeTrustRecord {
  return {
    id: `demo-narrative-trust-${t.entityId}`,
    narrative_id: t.entityId,
    trust_score: t.trustScore,
    confidence: t.confidence,
    evidence_count: t.evidenceCount,
    calibration_score: t.calibrationScore,
    band: t.band,
    explanation: { items: t.explanation },
    limitations: { items: t.limitations },
    overridden: false,
    last_updated: t.lastUpdated,
    created_at: DEMO_NOW,
    updated_at: t.lastUpdated,
  };
}

function trustScoreToForecast(t: TrustScore): HsinForecastTrustRecord {
  return {
    id: `demo-forecast-trust-${t.entityId}`,
    narrative_id: t.entityId,
    forecast_kind: 'narrative_state',
    trust_score: t.trustScore,
    confidence: t.confidence,
    evidence_count: t.evidenceCount,
    calibration_score: t.calibrationScore,
    band: t.band,
    explanation: { items: t.explanation },
    limitations: { items: t.limitations },
    overridden: false,
    last_updated: t.lastUpdated,
    created_at: DEMO_NOW,
    updated_at: t.lastUpdated,
  };
}

function trustScoreToDecision(t: TrustScore): HsinDecisionTrustRecord {
  return {
    id: `demo-decision-trust-${t.entityId}`,
    decision_run_id: t.entityId,
    trust_score: t.trustScore,
    confidence: t.confidence,
    evidence_count: t.evidenceCount,
    calibration_score: t.calibrationScore,
    band: t.band,
    explanation: { items: t.explanation },
    limitations: { items: t.limitations },
    overridden: false,
    last_updated: t.lastUpdated,
    created_at: DEMO_NOW,
    updated_at: t.lastUpdated,
  };
}

/** Demo TrustDashboardData from the calibration-engine trust fixtures. */
export function demoTrustDashboard(): TrustDashboardData {
  const demo = demoBundle();
  const t = demo.trust;
  // A handful per section so rankings + the histogram read sensibly. We perturb
  // the demo entity ids deterministically to populate multiple rows per kind.
  const variants = (base: TrustScore, n: number): TrustScore[] =>
    Array.from({ length: n }).map((_, i) => ({
      ...base,
      entityId: i === 0 ? base.entityId : `${base.entityId}-${i}`,
      trustScore: Math.max(0, Math.min(100, base.trustScore - i * 11)),
      band: bandFromScore(Math.max(0, Math.min(100, base.trustScore - i * 11))),
    }));

  return {
    sources: variants(t.source, 4).map(trustScoreToSource),
    narratives: variants(t.narrative, 3).map(trustScoreToNarrative),
    forecasts: variants(t.forecast, 3).map(trustScoreToForecast),
    decisions: variants(t.decision, 3).map(trustScoreToDecision),
  };
}

/** Demo TrustView for one entity (defaults to the demo source). */
export function demoTrustView(entityType?: TrustEntityType, entityId?: string): TrustView {
  const demo = demoBundle();
  const type: TrustEntityType = entityType ?? 'source';
  const base: TrustScore =
    type === 'narrative'
      ? demo.trust.narrative
      : type === 'forecast'
        ? demo.trust.forecast
        : type === 'decision'
          ? demo.trust.decision
          : demo.trust.source;
  const score = base.trustScore;
  // A deterministic trust history walking up to the current score.
  const history = [
    { trustScore: Math.max(0, score - 14), at: '2026-03-01T00:00:00.000Z' },
    { trustScore: Math.max(0, score - 8), at: '2026-04-01T00:00:00.000Z' },
    { trustScore: Math.max(0, score - 3), at: '2026-05-01T00:00:00.000Z' },
    { trustScore: score, at: base.lastUpdated },
  ];
  return {
    entityType: type,
    entityId: entityId ?? base.entityId,
    trustScore: score,
    band: base.band,
    history,
    explanation: base.explanation,
    limitations: base.limitations,
    overridden: false,
  };
}

/** Demo CalibrationHighlights for the operations strip. */
export function demoCalibrationHighlights(): CalibrationHighlights {
  const demo = demoBundle();
  const trustData = demoTrustDashboard();
  const allScores = [
    ...trustData.sources,
    ...trustData.narratives,
    ...trustData.forecasts,
    ...trustData.decisions,
  ].map((r) => r.trust_score ?? 0);
  const avgTrust =
    allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : undefined;
  const firstDrift = (Object.keys(demo.drift) as (keyof typeof demo.drift)[])[0];
  return {
    ece: demo.curve.expectedCalibrationError,
    brier: demo.brierOverall.score,
    driftKind: demo.drift[firstDrift].result.kind,
    avgTrust,
  };
}

/** Demo single TrustView used by the decisions trust badge (best-effort). */
export function demoDecisionTrustView(decisionRunId?: string): TrustView {
  return demoTrustView('decision', decisionRunId);
}
