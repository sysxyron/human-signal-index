// =============================================================================
// HSI Phase 17 — client-safe view helpers for the Public Trust, Recalibration &
// Governance UI (trust history / public trust / proposals / proposal detail /
// drift dashboards + the trust-provenance panel surfaced throughout).
//
// "How trustworthy is this — why, and how has it changed?"
//
// PURE + CLIENT-SAFE: NO server-only imports (no next/headers, no Supabase
// server client, no actions). These map the Phase-17 domain unions →
// color/label, format trust scores / deltas / confidence, safely read the
// engines' provenance/evidence/audit jsonb out of records, and build clearly-
// LABELED demo view-models from the @hsi/trust-history + @hsi/recalibration-engine
// fixtures so every Phase-17 page renders fully offline when an action returns
// NOT_CONFIGURED.
//
// EXPLAINABLE, NEVER BLACK-BOX — every score carries the factors that produced it
// + explicit limitations; drift only RECOMMENDS recalibration; recalibration is a
// proposal a human approves/rejects (audited + reversible). These helpers
// decorate and project, never invent.
// =============================================================================

import type {
  HsinRecalibrationProposalRecord,
  HsinTrustDriftRecord,
  HsinTrustHistoryRecord,
  ProposalStatus,
  PublicTrustData,
  PublicTrustEntry,
  RecalibrationDirection,
  RecalibrationProposalView,
  RecalibrationQueueData,
  TrustBand,
  TrustDriftDashboardData,
  TrustDriftKind,
  TrustEntityType,
  TrustHistoryDashboardData,
  TrustHistoryRow,
  TrustHistoryView,
  TrustProvenanceView,
  TrustSeverity,
  TrustTrend,
} from '@hsi/shared-types';
import {
  buildTrustProvenance,
  computeTrustTrend,
  detectTrustDrift,
  trustHistoryDemo,
  type TrustExplanation,
  type TrustSnapshot,
} from '@hsi/trust-history';
import { recalibrationDemo, type RecalibrationProposal } from '@hsi/recalibration-engine';

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

/** Researcher or above — may VIEW the trust dashboards. */
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/** Curator or above — may decide proposals, record history, publish trust. */
export function canCurate(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/* -------------------------------------------------------------------------- */
/* Trust trend → color/label/description (4 trends)                             */
/* -------------------------------------------------------------------------- */

const TREND_DECOR: Record<TrustTrend, Decorated> = {
  improving: {
    label: 'Improving',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Trust is climbing steadily with low volatility.',
  },
  stable: {
    label: 'Stable',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'Trust is holding steady within tolerance.',
  },
  degrading: {
    label: 'Degrading',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Trust is declining steadily — recalibration may be warranted.',
  },
  volatile: {
    label: 'Volatile',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'Trust is swinging — unstable, no clean direction.',
  },
};

export function trendDecor(trend?: TrustTrend | string | null): Decorated {
  if (!trend) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return (
    TREND_DECOR[trend as TrustTrend] ?? {
      label: titleize(String(trend)),
      color: TONE_COLORS.neutral,
      tone: 'neutral',
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Trust drift kind → color/label/description (6 kinds)                         */
/* -------------------------------------------------------------------------- */

const DRIFT_DECOR: Record<TrustDriftKind, Decorated> = {
  collapse: {
    label: 'Collapse',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'A sudden, severe loss of trust — route to governance immediately.',
  },
  degradation: {
    label: 'Degradation',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Trust has fallen notably from its baseline.',
  },
  instability: {
    label: 'Instability',
    color: TONE_COLORS.pink,
    tone: 'pink',
    description: 'Trust is swinging erratically — thin or noisy evidence.',
  },
  overconfidence: {
    label: 'Overconfidence',
    color: TONE_COLORS.purple,
    tone: 'purple',
    description: 'Trust outruns demonstrated reliability — recommend lowering it.',
  },
  underconfidence: {
    label: 'Underconfidence',
    color: TONE_COLORS.blue,
    tone: 'blue',
    description: 'Reliability exceeds trust — the entity may be undervalued.',
  },
  stable: {
    label: 'Stable',
    color: TONE_COLORS.cyan,
    tone: 'cyan',
    description: 'No drift detected — trust is within tolerance.',
  },
};

export function driftDecor(kind?: TrustDriftKind | string | null): Decorated {
  if (!kind) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return (
    DRIFT_DECOR[kind as TrustDriftKind] ?? {
      label: titleize(String(kind)),
      color: TONE_COLORS.neutral,
      tone: 'neutral',
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Severity → color/tone (4 levels)                                            */
/* -------------------------------------------------------------------------- */

const SEVERITY_DECOR: Record<TrustSeverity, Decorated> = {
  LOW: { label: 'Low', color: TONE_COLORS.cyan, tone: 'cyan' },
  MEDIUM: { label: 'Medium', color: TONE_COLORS.orange, tone: 'orange' },
  HIGH: { label: 'High', color: TONE_COLORS.red, tone: 'red' },
  CRITICAL: { label: 'Critical', color: TONE_COLORS.red, tone: 'red' },
};

export function severityDecor(sev?: TrustSeverity | string | null): Decorated {
  if (!sev) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return (
    SEVERITY_DECOR[sev as TrustSeverity] ?? {
      label: titleize(String(sev)),
      color: TONE_COLORS.neutral,
      tone: 'neutral',
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Proposal status → color/label (3 states)                                    */
/* -------------------------------------------------------------------------- */

const STATUS_DECOR: Record<ProposalStatus, Decorated> = {
  pending: {
    label: 'Pending',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'Awaiting a governance decision.',
  },
  approved: {
    label: 'Approved',
    color: TONE_COLORS.green,
    tone: 'green',
    description: 'Approved by a reviewer; the change was applied (reversible).',
  },
  rejected: {
    label: 'Rejected',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'Rejected by a reviewer; no change was applied.',
  },
};

export function statusDecor(status?: ProposalStatus | string | null): Decorated {
  if (!status) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return (
    STATUS_DECOR[status as ProposalStatus] ?? {
      label: titleize(String(status)),
      color: TONE_COLORS.neutral,
      tone: 'neutral',
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Direction → label/arrow                                                     */
/* -------------------------------------------------------------------------- */

export function directionDecor(direction?: RecalibrationDirection | string | null): Decorated {
  if (direction === 'downward')
    return { label: 'Downward', color: TONE_COLORS.orange, tone: 'orange', description: '▼ Lower confidence' };
  if (direction === 'upward')
    return { label: 'Upward', color: TONE_COLORS.blue, tone: 'blue', description: '▲ Raise confidence' };
  return { label: 'No change', color: TONE_COLORS.neutral, tone: 'neutral', description: '— Unchanged' };
}

/* -------------------------------------------------------------------------- */
/* Trust band + entity type (mirror Phase-16 thresholds)                        */
/* -------------------------------------------------------------------------- */

const BAND_DECOR: Record<TrustBand, Decorated> = {
  high: { label: 'High trust', color: TONE_COLORS.green, tone: 'green' },
  medium: { label: 'Medium trust', color: TONE_COLORS.orange, tone: 'orange' },
  low: { label: 'Low trust', color: TONE_COLORS.red, tone: 'red' },
};

export function bandDecor(band?: TrustBand | string | null): Decorated {
  if (!band) return { label: 'Unrated', color: TONE_COLORS.neutral, tone: 'neutral' };
  return (
    BAND_DECOR[band as TrustBand] ?? {
      label: titleize(String(band)),
      color: TONE_COLORS.neutral,
      tone: 'neutral',
    }
  );
}

export function bandFromScore(score?: number | null): TrustBand {
  if (score == null || Number.isNaN(score)) return 'low';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

const ENTITY_DECOR: Record<TrustEntityType, Decorated> = {
  source: { label: 'Source', color: TONE_COLORS.blue, tone: 'blue' },
  narrative: { label: 'Narrative', color: TONE_COLORS.purple, tone: 'purple' },
  forecast: { label: 'Forecast', color: TONE_COLORS.cyan, tone: 'cyan' },
  decision: { label: 'Decision', color: TONE_COLORS.green, tone: 'green' },
  intervention: { label: 'Intervention', color: TONE_COLORS.orange, tone: 'orange' },
  recommendation: { label: 'Recommendation', color: TONE_COLORS.pink, tone: 'pink' },
};

export function entityTypeDecor(type?: TrustEntityType | string | null): Decorated {
  if (!type) return { label: 'Entity', color: TONE_COLORS.neutral, tone: 'neutral' };
  return (
    ENTITY_DECOR[type as TrustEntityType] ?? {
      label: titleize(String(type)),
      color: TONE_COLORS.neutral,
      tone: 'neutral',
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Formatters                                                                  */
/* -------------------------------------------------------------------------- */

export function formatTrustScore(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, value)))}`;
}

export function formatConfidence(value?: number | null, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(digits)}%`;
}

export function formatDelta(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const r = Math.round(value * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}`;
}

export function trustScoreTone(value?: number | null): Tone {
  return bandDecor(bandFromScore(value)).tone;
}

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
/* jsonb readers                                                               */
/* -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Read a jsonb value meant to be a string[] (evidence / audit_trail / items). */
export function readStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  if (isRecord(value)) {
    for (const key of ['items', 'list', 'values', 'evidence', 'audit_trail', 'auditTrail']) {
      const inner = value[key];
      if (Array.isArray(inner)) return inner.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

/** A normalised sparkline point (for the TrustHistoryChart). */
export interface SparkPoint {
  trustScore: number;
  at: string;
  x: number;
  y: number;
}

/** Map a score series into normalised SVG coordinates (0..width, 0..height). */
export function sparkPoints(
  series: { trustScore: number; at: string }[],
  width = 120,
  height = 32,
): SparkPoint[] {
  if (series.length === 0) return [];
  const n = series.length;
  return series.map((p, i) => {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
    const y = height - (Math.max(0, Math.min(100, p.trustScore)) / 100) * height;
    return { trustScore: p.trustScore, at: p.at, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  });
}

/* -------------------------------------------------------------------------- */
/* DEMO builders — pure offline fixtures (client-safe). Always labeled "Demo".  */
/* -------------------------------------------------------------------------- */

const DEMO_NOW = '2026-06-09T12:00:00.000Z';

let _hist: ReturnType<typeof trustHistoryDemo> | null = null;
function histBundle(): ReturnType<typeof trustHistoryDemo> {
  if (!_hist) _hist = trustHistoryDemo();
  return _hist;
}

function snapToRecord(s: TrustSnapshot, i: number): HsinTrustHistoryRecord {
  return {
    id: s.id ?? `demo-hist-${i}`,
    entity_type: s.entityType,
    entity_id: s.entityId,
    trust_score: s.trustScore,
    confidence: s.confidence,
    calibration_score: s.calibrationScore,
    evidence_count: s.evidenceCount,
    band: s.band,
    snapshot_at: s.at,
    created_at: s.at,
  };
}

function driftToRecord(d: ReturnType<typeof detectTrustDrift>, i: number): HsinTrustDriftRecord {
  return {
    id: `demo-drift-${i}`,
    entity_type: d.entityType,
    entity_id: d.entityId,
    drift_kind: d.kind,
    severity: d.severity,
    magnitude: d.magnitude,
    current_trust: d.currentTrust,
    baseline_trust: d.baselineTrust,
    reason: d.reason,
    evidence: d.evidence,
    recommendation: d.recommendation,
    detected_at: d.detectedAt,
    created_at: d.detectedAt,
  };
}

function provToView(p: TrustExplanation): TrustProvenanceView {
  return {
    entityType: p.entityType,
    entityId: p.entityId,
    score: p.score,
    band: p.band,
    factors: p.factors,
    weights: p.weights,
    limitations: p.limitations,
    history: p.history,
    ...(p.trend
      ? {
          trend: {
            trend: p.trend.trend,
            delta: p.trend.delta,
            slope: p.trend.slope,
            mean: p.trend.mean,
            volatility: p.trend.volatility,
            sampleCount: p.trend.sampleCount,
            explanation: p.trend.explanation,
          },
        }
      : {}),
    summary: p.summary,
    generatedAt: p.generatedAt,
  };
}

function buildHistRows(): TrustHistoryRow[] {
  const demo = histBundle();
  const rows: TrustHistoryRow[] = [];
  for (const key of Object.keys(demo.series)) {
    const snaps = demo.series[key];
    const trend = computeTrustTrend(snaps);
    const latest = snaps[snaps.length - 1];
    rows.push({
      entityType: latest.entityType,
      entityId: latest.entityId,
      latestScore: latest.trustScore,
      band: latest.band,
      trend: trend.trend,
      delta: trend.delta,
      snapshotCount: snaps.length,
      sparkline: snaps.map((s) => ({ trustScore: s.trustScore, at: s.at })),
      lastUpdated: latest.at,
    });
  }
  return rows.sort((a, b) => b.latestScore - a.latestScore);
}

/** Demo trust-history dashboard. */
export function demoTrustHistoryDashboard(): TrustHistoryDashboardData {
  const demo = histBundle();
  const rows = buildHistRows();
  const trendCounts: Record<TrustTrend, number> = {
    improving: 0,
    stable: 0,
    degrading: 0,
    volatile: 0,
  };
  for (const r of rows) trendCounts[r.trend] += 1;
  const drift = Object.keys(demo.drift)
    .filter((k) => demo.drift[k].kind !== 'stable')
    .map((k, i) => driftToRecord(demo.drift[k], i));
  return { rows, drift, trendCounts };
}

/** Demo single trust-history view (defaults to the improving source). */
export function demoTrustHistoryView(
  entityType?: TrustEntityType,
  entityId?: string,
): TrustHistoryView {
  const demo = histBundle();
  const snaps = demo.series.improving;
  const type = entityType ?? snaps[0].entityType;
  const eid = entityId ?? snaps[0].entityId;
  const trend = computeTrustTrend(snaps);
  const drift = detectTrustDrift(snaps, { now: DEMO_NOW });
  const provenance = provToView(
    buildTrustProvenance(
      {
        entityType: type,
        entityId: eid,
        score: snaps[snaps.length - 1].trustScore,
        calibrationScore: snaps[snaps.length - 1].calibrationScore,
        historicalAccuracy: 0.74,
        evidenceQuality: 0.68,
        governanceSignal: 0.82,
        evidenceCount: snaps[snaps.length - 1].evidenceCount,
        history: snaps.map((s) => ({ trustScore: s.trustScore, at: s.at })),
      },
      { now: DEMO_NOW },
    ),
  );
  return {
    entityType: type,
    entityId: eid,
    snapshots: snaps.map((s, i) => snapToRecord(s, i)),
    trend: {
      trend: trend.trend,
      delta: trend.delta,
      slope: trend.slope,
      mean: trend.mean,
      volatility: trend.volatility,
      sampleCount: trend.sampleCount,
      first: trend.first,
      last: trend.last,
      explanation: trend.explanation,
      limitations: trend.limitations,
    },
    drift: driftToRecord(drift, 0),
    provenance,
  };
}

/** Demo trust-drift dashboard. */
export function demoTrustDriftDashboard(): TrustDriftDashboardData {
  const demo = histBundle();
  const events = Object.keys(demo.drift).map((k, i) => driftToRecord(demo.drift[k], i));
  const bySeverity: Record<TrustSeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const byKind: Record<TrustDriftKind, number> = {
    collapse: 0,
    degradation: 0,
    instability: 0,
    overconfidence: 0,
    underconfidence: 0,
    stable: 0,
  };
  for (const e of events) {
    if (e.severity) bySeverity[e.severity] += 1;
    if (e.drift_kind) byKind[e.drift_kind] += 1;
  }
  return { events, bySeverity, byKind };
}

function proposalToRecord(p: RecalibrationProposal): HsinRecalibrationProposalRecord {
  return {
    id: p.id,
    entity_type: p.entityType,
    entity_id: p.entityId,
    trigger: p.trigger,
    current_confidence: p.currentConfidence,
    recommended_confidence: p.recommendedConfidence,
    current_trust: p.currentTrust,
    recommended_trust: p.recommendedTrust,
    direction: p.direction,
    magnitude: p.magnitude,
    severity: p.severity,
    reason: p.reason,
    supporting_evidence: { items: p.supportingEvidence },
    status: p.status,
    created_at: p.createdAt,
    updated_at: p.createdAt,
  };
}

/** Demo recalibration queue. */
export function demoRecalibrationQueue(): RecalibrationQueueData {
  const demo = recalibrationDemo();
  const proposals = demo.proposals.map(proposalToRecord);
  return {
    proposals,
    pendingCount: proposals.length,
    approvedCount: 0,
    rejectedCount: 0,
  };
}

/** Demo single recalibration proposal view. */
export function demoRecalibrationProposal(id?: string): RecalibrationProposalView {
  const demo = recalibrationDemo();
  const base = demo.proposals[0];
  const proposal = proposalToRecord({ ...base, id: id?.trim() || base.id });
  return {
    proposal,
    review: {
      valid: demo.review.valid,
      direction: demo.review.direction,
      confidenceDelta: demo.review.confidenceDelta,
      severity: demo.review.severity,
      checks: demo.review.checks,
      recommendation: demo.review.recommendation,
      summary: demo.review.summary,
    },
    reviews: [
      {
        id: 'demo-review-0',
        proposal_id: proposal.id,
        reviewer_id: 'curator-alice',
        decision: 'approved',
        reason: demo.approval.reason,
        valid: true,
        previous_state: demo.approval.previousState as unknown as Record<string, unknown>,
        new_state: demo.approval.newState as unknown as Record<string, unknown>,
        reversible: true,
        audit_trail: { items: demo.approval.auditTrail },
        created_at: DEMO_NOW,
      },
    ],
  };
}

/** Demo Phase-17 governance highlights for the operations strip. */
export function demoTrustGovernanceHighlights(): import('@hsi/shared-types').TrustGovernanceHighlights {
  const demo = histBundle();
  const driftEvents = Object.values(demo.drift).filter((d) => d.kind !== 'stable');
  const degrading = driftEvents.filter(
    (d) => d.kind === 'degradation' || d.kind === 'collapse',
  ).length;
  const scores = Object.values(demo.series).map((s) => s[s.length - 1].trustScore);
  const avgTrust = scores.length
    ? Math.round((scores.reduce((a, n) => a + n, 0) / scores.length) * 100) / 100
    : undefined;
  return {
    degradingCount: degrading,
    pendingProposals: driftEvents.length,
    driftEvents: driftEvents.length,
    avgTrust,
  };
}

/** Demo public trust surface. */
export function demoPublicTrust(): PublicTrustData {
  const demo = histBundle();
  const entries: PublicTrustEntry[] = Object.keys(demo.series).map((key) => {
    const snaps = demo.series[key];
    const latest = snaps[snaps.length - 1];
    const trend = computeTrustTrend(snaps).trend;
    const provenance = provToView(
      buildTrustProvenance(
        {
          entityType: latest.entityType,
          entityId: latest.entityId,
          score: latest.trustScore,
          calibrationScore: latest.calibrationScore,
          historicalAccuracy: 0.72,
          evidenceQuality: 0.66,
          governanceSignal: 0.8,
          evidenceCount: latest.evidenceCount,
          history: snaps.map((s) => ({ trustScore: s.trustScore, at: s.at })),
        },
        { now: DEMO_NOW },
      ),
    );
    return {
      entityType: latest.entityType,
      entityId: latest.entityId,
      trustScore: latest.trustScore,
      band: latest.band,
      reliability: latest.calibrationScore,
      calibrationQuality: latest.calibrationScore,
      outcomeAccuracy: 0.72,
      evidenceQuality: 0.66,
      governanceHistoryCount: 1,
      trend,
      provenance,
    };
  });
  return { entries: entries.sort((a, b) => b.trustScore - a.trustScore) };
}
