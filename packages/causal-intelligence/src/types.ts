// =============================================================================
// @hsi/causal-intelligence — public type surface (WorldForge/HSI Phase 11).
//
// The CAUSAL-ANALYSIS + NARRATIVE-REPLAY engine. Where temporal-intelligence is
// "git history for ideas," this layer EXPLAINS the history: it detects causal
// EVENTS in a narrative's snapshot/evolution timeline, orders them into
// explainable CHAINS, ATTRIBUTES a share of the observed change to each, renders
// a DATA-GROUNDED human explanation, builds a REPLAY timeline (scrubber frames),
// and detects narrative MILESTONES (birth → growth → viral → peak → decline →
// death → resurgence).
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random()
//     in any logic path. Same inputs → identical outputs.
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * NEVER FABRICATE — every statement an event/explanation makes is tied to a
//     concrete number drawn from the input snapshots/evolution. Thin data lowers
//     confidence and says so; it does not invent.
// =============================================================================

import type {
  EvolutionRecord,
  InfluenceEdge,
  NarrativeForecast,
  NarrativeSnapshot,
} from '@hsi/temporal-intelligence';

// Re-export the reused temporal types so consumers can import everything from
// the causal package surface alone.
export type {
  EvolutionRecord,
  InfluenceEdge,
  NarrativeForecast,
  NarrativeSnapshot,
} from '@hsi/temporal-intelligence';

/** The kinds of causal events detectable in a narrative's history. */
export type CausalEventType =
  | 'signal_surge'
  | 'source_expansion'
  | 'community_growth'
  | 'amplification_spike'
  | 'contradiction_drop'
  | 'contradiction_rise'
  | 'forecast_shift'
  | 'influence_transfer';

/**
 * A single causal event detected at a snapshot boundary. Every event carries an
 * explanation tied to the actual numbers plus the raw metrics behind it.
 */
export interface CausalEvent {
  /** Deterministic id derived from narrative + type + time. */
  id?: string;
  narrativeId: string;
  eventType: CausalEventType;
  /** How strong the event is, 0..100 (scaled by the magnitude of the change). */
  eventStrength: number;
  /** Confidence in the detection, 0..1. */
  confidence: number;
  /** Human-readable, DATA-GROUNDED explanation (e.g. "signals rose 100→500 (+400%)"). */
  explanation: string;
  /** ISO time of the snapshot boundary the event occurred at. */
  occurredAt: string;
  /** Supporting metrics (the numbers behind the explanation). */
  metrics: Record<string, number | string>;
  createdAt: string;
}

/** An ordered, explainable sequence of causal events ("why it changed"). */
export interface CausalChain {
  id?: string;
  narrativeId: string;
  chainName: string;
  /** 0..1 confidence (mean member confidence scaled by temporal coherence). */
  confidence: number;
  /** Human-readable summary listing the ACTUAL member events. */
  summary: string;
  /** Events in causal/temporal order. */
  events: CausalEvent[];
  createdAt: string;
}

/** The kind of milestone reached in a narrative's life-cycle. */
export type MilestoneType =
  | 'birth'
  | 'growth'
  | 'viral'
  | 'peak'
  | 'decline'
  | 'death'
  | 'resurgence';

/** A life-cycle milestone with a data-grounded description and metrics. */
export interface NarrativeMilestone {
  id?: string;
  narrativeId: string;
  milestoneType: MilestoneType;
  confidence: number;
  description: string;
  occurredAt: string;
  metrics: Record<string, number>;
  createdAt: string;
}

/** One frame of the narrative replay timeline (a scrubber position). */
export interface ReplayFrame {
  narrativeId: string;
  frameTimestamp: string;
  signals: number;
  sources: number;
  communities: number;
  amplification: number;
  reliability: number;
  influenceIn: number;
  influenceOut: number;
  forecast?: string;
  changeType?: string;
  /** Event types active in (firing at the boundary ending in) this frame. */
  events: string[];
  /** Raw frame payload for the UI (kept open-ended but deterministic). */
  data: Record<string, unknown>;
}

/** A factor contributing to a narrative change, with its grounding metric. */
export interface ExplanationFactor {
  label: string;
  detail: string;
  metric?: number;
}

/** A human-readable, data-grounded explanation of a narrative's change. */
export interface NarrativeChangeExplanation {
  narrativeId: string;
  headline: string;
  text: string;
  factors: ExplanationFactor[];
  confidence: number;
  generatedAt: string;
}

/** The full input bundle for the causal engine (reuses temporal types). */
export interface CausalInput {
  narrativeId: string;
  snapshots: NarrativeSnapshot[];
  evolution: EvolutionRecord[];
  influenceIn?: InfluenceEdge[];
  influenceOut?: InfluenceEdge[];
  forecast?: NarrativeForecast;
  /** Injected "now" — the engine NEVER calls Date.now(). */
  now: string;
}
