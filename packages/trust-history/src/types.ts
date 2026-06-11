// =============================================================================
// @hsi/trust-history — public type surface (WorldForge/HSI Phase 17).
//
// TRUST HISTORY + TREND + DRIFT + PROVENANCE. Where Phase 16
// (@hsi/calibration-engine) MEASURES trust at a point in time, Phase 17 tracks
// how that trust EVOLVES: it persists append-only snapshots, classifies the
// trend (improving / stable / degrading / volatile), detects drift
// (degradation / collapse / over- and under-confidence / instability), and
// explains WHY a trust score exists and HOW it changed (provenance).
//
// PRINCIPLES (binding — identical to Phase 16):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random()
//     anywhere. Same inputs → identical outputs.
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * APPEND-ONLY — history is never overwritten; a snapshot is added, never
//     mutated. Trend/drift are derived, never destructive.
//   * EXPLAINABLE + AUDITABLE + REPRODUCIBLE — every trend/drift/provenance
//     carries the numbers that produced it + explicit LIMITATIONS. NEVER opaque,
//     NEVER force a verdict, NEVER auto-correct trust (drift only RECOMMENDS).
// =============================================================================

// Reused upstream types are importable from this surface for convenience.
export type {
  TrustEntityType,
  TrustScore,
  TrustInputs,
} from '@hsi/calibration-engine';

import type { TrustEntityType } from '@hsi/calibration-engine';

/** The five trust dimensions Phase 17 tracks over time (per the spec). */
export type TrustDimension =
  | 'source'
  | 'narrative'
  | 'forecast'
  | 'recommendation'
  | 'decision';

/** A trust band — mirrors the Phase-16 trust band thresholds (≥70 high, ≥40 medium). */
export type TrustBand = 'low' | 'medium' | 'high';

/**
 * One APPEND-ONLY point in an entity's trust history. A snapshot is a faithful
 * record of the trust score (and the signals behind it) AT a moment — it is
 * never edited once written.
 */
export interface TrustSnapshot {
  /** Stable id of the snapshot (caller-supplied; engine never invents one). */
  id?: string;
  entityType: TrustEntityType;
  entityId: string;
  /** 0..100 trust score at `at`. */
  trustScore: number;
  /** 0..1 confidence behind the score at `at`. */
  confidence: number;
  /** 0..1 calibration component used (1 = perfectly calibrated). */
  calibrationScore: number;
  /** Underlying observation count the score rested on. */
  evidenceCount: number;
  /** Band derived from `trustScore` (≥70 high, ≥40 medium, else low). */
  band: TrustBand;
  /** ISO timestamp of the snapshot. */
  at: string;
}

/** Inputs to recordTrustSnapshot — a subset is enough; the rest defaults safely. */
export interface TrustSnapshotInput {
  entityType: TrustEntityType;
  entityId: string;
  trustScore: number;
  confidence?: number;
  calibrationScore?: number;
  evidenceCount?: number;
  id?: string;
}

/** How an entity's trust is trending over its history. */
export type TrustTrend = 'improving' | 'stable' | 'degrading' | 'volatile';

/**
 * The classified trend over a trust-history series. ADVISORY — the slope and
 * volatility are reported with the numbers that produced them so a human can
 * judge them.
 */
export interface TrustTrendResult {
  trend: TrustTrend;
  /** Net change over the series (last − first), in trust points (−100..+100). */
  delta: number;
  /** Mean per-step change (regression-free), in trust points per step. */
  slope: number;
  /** Mean trust score over the series, 0..100. */
  mean: number;
  /** Standard deviation of the per-step changes, in trust points (instability). */
  volatility: number;
  /** Number of snapshots the classification rests on. */
  sampleCount: number;
  /** First and last score in the window (for display). */
  first: number;
  last: number;
  /** Enumerates the numbers + thresholds behind the classification. */
  explanation: string;
  /** Honest caveats — ALWAYS populated. */
  limitations: string[];
}

/** The kind of trust drift detected (priority-ordered classification). */
export type TrustDriftKind =
  | 'collapse'
  | 'degradation'
  | 'instability'
  | 'overconfidence'
  | 'underconfidence'
  | 'stable';

/** Advisory severity for triaging a drift event. */
export type TrustDriftSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * A detected trust-drift event. RECOMMENDS recalibration / review only — it
 * NEVER auto-corrects trust. Carries the evidence numbers + an advisory
 * recommendation for a human reviewer.
 */
export interface TrustDriftEvent {
  entityType: TrustEntityType;
  entityId: string;
  kind: TrustDriftKind;
  severity: TrustDriftSeverity;
  /** 0..1 — how far the deciding gap exceeded its threshold. */
  magnitude: number;
  /** Current (latest) trust score, 0..100. */
  currentTrust: number;
  /** Baseline trust score the current is compared against, 0..100. */
  baselineTrust: number;
  /** One-line human reason. */
  reason: string;
  /** The numbers behind the detection (deltas, thresholds, bands…). */
  evidence: string[];
  /** Advisory recalibration / review recommendation — never an auto-action. */
  recommendation: string;
  detectedAt: string;
}

/** One enumerated factor behind a trust score (provenance). */
export interface TrustProvenanceFactor {
  /** e.g. 'historicalAccuracy', 'calibration', 'evidenceQuality', 'governance'. */
  name: string;
  /** The 0..1 value this factor contributed. */
  value: number;
  /** The documented weight applied to this factor (0..1). */
  weight: number;
  /** value × weight × 100, the points this factor added to the 0..100 score. */
  contribution: number;
  /** Whether the factor was a real signal or a neutral default. */
  present: boolean;
  /** Human description of where the factor came from. */
  detail: string;
}

/**
 * A full TRUST EXPLANATION (provenance): WHY a trust score exists, WHERE it came
 * from, and HOW it changed. No black-box scores — every factor is enumerated
 * with its value, weight, and contribution, plus explicit limitations and the
 * recent history.
 */
export interface TrustExplanation {
  entityType: TrustEntityType;
  entityId: string;
  /** 0..100 trust score being explained. */
  score: number;
  band: TrustBand;
  /** Every contributing factor, enumerated. */
  factors: TrustProvenanceFactor[];
  /** The documented weights map (factor name → weight). */
  weights: Record<string, number>;
  /** Honest caveats — ALWAYS populated. */
  limitations: string[];
  /** Recent trust history (oldest → newest) for the "how it changed" panel. */
  history: { trustScore: number; at: string }[];
  /** The trend classification over `history` (if enough points). */
  trend?: TrustTrendResult;
  /** A single-sentence plain-language summary. */
  summary: string;
  generatedAt: string;
}

/** Inputs to buildTrustProvenance — all optional + honestly defaulted. */
export interface TrustProvenanceInputs {
  entityType: TrustEntityType;
  entityId: string;
  /** The current 0..100 trust score. */
  score: number;
  /** Historical accuracy of this entity, 0..1. */
  historicalAccuracy?: number;
  /** Quality of supporting evidence, 0..1. */
  evidenceQuality?: number;
  /** Calibration score, 0..1 (1 = perfectly calibrated). */
  calibrationScore?: number;
  /** Net governance signal, 0..1 (validated/approved vs rejected/escalated). */
  governanceSignal?: number;
  /** Number of underlying observations. */
  evidenceCount?: number;
  /** Recent trust history (any order — normalised internally). */
  history?: { trustScore: number; at: string }[];
}
