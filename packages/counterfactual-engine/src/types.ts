// =============================================================================
// @hsi/counterfactual-engine — public type surface (WorldForge/HSI Phase 12).
//
// GROUNDED counterfactual reasoning + forecast validation/calibration. It
// answers "what would have happened if X never happened?" by REPLAYING a
// narrative's ACTUAL signal history with one intervention applied, then
// re-propagating downstream effects with deterministic heuristics. It also
// VALIDATES past forecasts (backtest) and CALIBRATES stated confidence against
// empirical accuracy (pulling overconfident bands down).
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`/seed; NO Date.now()/Math.random()
//     in any logic path. Same inputs → identical outputs.
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * NEVER CERTAINTY, NEVER FABRICATE — every output carries a confidence, a
//     reasoning trail, and explicit LIMITATIONS, all tied to real input data.
//     Counterfactuals are ESTIMATES for a HUMAN reviewer, not predictions.
// =============================================================================

import type {
  CausalEvent,
} from '@hsi/causal-intelligence';
import type {
  EvolutionRecord,
  NarrativeForecast,
  NarrativeSnapshot,
} from '@hsi/temporal-intelligence';

// Re-export reused upstream types so consumers can import from this surface.
export type {
  CausalEvent,
  CausalChain,
  CausalInput,
  ReplayFrame,
  NarrativeMilestone,
} from '@hsi/causal-intelligence';
export type {
  EvolutionRecord,
  NarrativeForecast,
  NarrativeSnapshot,
  ForecastState,
} from '@hsi/temporal-intelligence';

/** The kinds of intervention scenario a counterfactual can apply. */
export type ScenarioType =
  | 'remove_event'
  | 'delay_event'
  | 'accelerate_event'
  | 'reduce_amplification'
  | 'increase_amplification'
  | 'remove_source'
  | 'add_source'
  | 'remove_community'
  | 'increase_reliability'
  | 'decrease_reliability'
  | 'remove_contradiction'
  | 'increase_contradiction';

/** The concrete action applied to a targeted causal event in a scenario. */
export type InterventionAction =
  | 'removed'
  | 'reduced'
  | 'amplified'
  | 'delayed'
  | 'accelerated';

/** Coarse confidence band used for calibration and UI display. */
export type ConfidenceBand = 'low' | 'medium' | 'high';

/** The full input bundle for a counterfactual (reuses upstream types). */
export interface CounterfactualInput {
  narrativeId: string;
  snapshots: NarrativeSnapshot[];
  evolution: EvolutionRecord[];
  events: CausalEvent[];
  forecast?: NarrativeForecast;
  /** Injected "now" — the engine NEVER calls Date.now(). */
  now: string;
}

/** A single event-level change produced by an intervention, fully grounded. */
export interface CounterfactualEventChange {
  /** The id of the real event this change targets (if any). */
  originalEventId?: string;
  eventType: string;
  action: InterventionAction;
  /** How much the change re-shapes downstream metrics, 0..100. */
  impactScore: number;
  /** Data-grounded reasoning for this specific change. */
  reasoning: string;
}

/** A re-propagated narrative timeline (baseline OR altered). */
export interface AlternativeTimeline {
  frames: {
    timestamp: string;
    signals: number;
    sources: number;
    communities: number;
    amplification: number;
    forecast?: string;
  }[];
  /** Forecast state at the end of the timeline (argmax). */
  finalForecastState?: string;
}

/** The full result of a counterfactual — both timelines, deltas, and honesty. */
export interface CounterfactualResult {
  narrativeId: string;
  scenarioName: string;
  scenarioType: ScenarioType;
  /** Overall confidence in the counterfactual, 0..1 (never 1 — never certainty). */
  confidence: number;
  confidenceBand: ConfidenceBand;
  summary: string;
  reasoning: string[];
  /** Explicit assumptions / caveats — ALWAYS populated. */
  limitations: string[];
  /** The real events / metrics the result is grounded in. */
  evidence: string[];
  changes: CounterfactualEventChange[];
  original: AlternativeTimeline;
  counterfactual: AlternativeTimeline;
  deltas: {
    /** % change in final signal count, counterfactual vs original. */
    signalDeltaPct: number;
    /** Absolute change in final amplification. */
    amplificationDelta: number;
    /** Did the final forecast state change? */
    forecastChanged: boolean;
    /** % change in window growth (final/first signals). */
    growthDeltaPct: number;
  };
  generatedAt: string;
}

// ---- Validation / calibration ----------------------------------------------

/** One backtest record: a past forecast scored against what actually happened. */
export interface BacktestRecord {
  narrativeId: string;
  forecastId?: string;
  predictedState: string;
  predictedProbability: number;
  actualState: string;
  actualProbability: number;
  /** 0..1 error — Brier-style (lower is better). */
  errorScore: number;
}

/** Accuracy + calibration summary for a narrative over a forecast window. */
export interface ForecastAccuracy {
  narrativeId: string;
  forecastWindow: string;
  predictionCount: number;
  /** Fraction of predictions whose argmax state was correct, 0..1. */
  accuracyScore: number;
  /** 1 − |meanConfidence − accuracy|, 0..1 (1 = perfectly calibrated). */
  calibrationScore: number;
}

/** Empirical accuracy of one confidence band, with a corrective adjustment. */
export interface CalibrationBand {
  band: ConfidenceBand;
  /** Representative stated confidence for predictions in this band, 0..1. */
  statedConfidence: number;
  /** Empirically observed accuracy for this band, 0..1. */
  empiricalAccuracy: number;
  /** Multiplicative adjustment applied to raw confidence (≤ 1 when overconfident). */
  adjustment: number;
}

/** A calibration model derived from backtest records. */
export interface Calibration {
  bands: CalibrationBand[];
  /** ≥ 0 — how much stated confidence exceeds empirical accuracy on average. */
  overconfidenceIndex: number;
  /** Calibrate a raw confidence: pull overconfident bands down. */
  calibrate(raw: number): { calibrated: number; band: ConfidenceBand };
}

// ---- WorldForge -------------------------------------------------------------

/** A counterfactual rendered as an alternative WorldForge timeline. */
export interface CounterfactualWorld {
  scenarioTitle: string;
  scenarioSummary: string;
  /** Key narrative metrics in the alternate timeline. */
  worldState: Record<string, unknown>;
  confidence: number;
  epochs: { label: string; summary: string }[];
  turningPoints: { at: string; description: string }[];
}
