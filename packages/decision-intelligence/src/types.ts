// =============================================================================
// @hsi/decision-intelligence — public type surface (WorldForge/HSI Phase 13).
//
// STRATEGIC DECISION INTELLIGENCE + WAR-GAMING. This layer sits on top of the
// counterfactual / causal / temporal engines and answers two human questions:
//   * "What should we do next?"
//   * "Which intervention has the highest probability of success?"
// from a narrative's ACTUAL signal/causal/counterfactual history.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`/seed; NO Date.now()/Math.random()
//     in any logic path. Same inputs → identical outputs.
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * NEVER CERTAINTY, NEVER BLACK-BOX — every output carries a confidence, a
//     reasoning trail, explicit LIMITATIONS, and EVIDENCE, all tied to real input
//     data. Recommendations are AIDS for a HUMAN reviewer, never commands.
// =============================================================================

import type {
  CausalEvent,
  CausalChain,
  CausalInput,
} from '@hsi/causal-intelligence';
import type {
  ConfidenceBand,
  Calibration,
  CounterfactualResult,
  CounterfactualInput,
  ScenarioType,
} from '@hsi/counterfactual-engine';
import type {
  EvolutionRecord,
  InfluenceEdge,
  NarrativeForecast,
  NarrativeSnapshot,
} from '@hsi/temporal-intelligence';

// Re-export the reused upstream types so consumers can import everything from
// this surface alone.
export type {
  CausalEvent,
  CausalChain,
  CausalInput,
} from '@hsi/causal-intelligence';
export type {
  ConfidenceBand,
  Calibration,
  CounterfactualResult,
  CounterfactualInput,
  ScenarioType,
} from '@hsi/counterfactual-engine';
export type {
  EvolutionRecord,
  InfluenceEdge,
  NarrativeForecast,
  NarrativeSnapshot,
} from '@hsi/temporal-intelligence';

/** The strategic decision a recommendation lands on. */
export type DecisionType =
  | 'intervention'
  | 'monitor'
  | 'escalate'
  | 'no_action'
  | 'counter_narrative';

/**
 * The kind of intervention we can war-game. We REUSE the 12 counterfactual
 * scenario types verbatim — an "intervention" here IS a counterfactual scenario
 * applied forward as a strategic option.
 */
export type InterventionType = ScenarioType;

/** How one narrative impacts another (cross-narrative war-gaming). */
export type ImpactType =
  | 'amplifies'
  | 'dampens'
  | 'triggers'
  | 'competes'
  | 'reinforces'
  | 'neutral';

/** The full input bundle for a decision (reuses upstream types). */
export interface DecisionInput {
  narrativeId: string;
  snapshots: NarrativeSnapshot[];
  evolution: EvolutionRecord[];
  events: CausalEvent[];
  forecast?: NarrativeForecast;
  influenceOut?: InfluenceEdge[];
  influenceIn?: InfluenceEdge[];
  /** Optional calibration model — pulls overconfident bands down. */
  calibration?: Calibration;
  /** Injected "now" — the engine NEVER calls Date.now(). */
  now: string;
}

/** The cumulative outcome of applying a SET of interventions. */
export interface InterventionSetResult {
  interventions: InterventionType[];
  outcome: string;
  /** Overall confidence, 0..1 (never 1 — never certainty). Degrades with set size. */
  confidence: number;
  confidenceBand: ConfidenceBand;
  reasoning: string[];
  /** Explicit assumptions / caveats — ALWAYS populated. */
  limitations: string[];
  deltas: {
    signalDeltaPct: number;
    amplificationDelta: number;
    growthDeltaPct: number;
    forecastChanged: boolean;
  };
  /** The real events / metrics the result is grounded in. */
  evidence: string[];
}

/** One ranked candidate intervention. */
export interface InterventionRanking {
  interventionType: InterventionType;
  /**
   * Signed effect on the narrative's trajectory, −100..100. Negative = dampens
   * growth (e.g. remove_amplification on a rising narrative); positive = amplifies.
   */
  expectedEffect: number;
  /** 0..100 — higher for aggressive / upstream / low-confidence interventions. */
  riskScore: number;
  /** 0..1 confidence in the estimate. */
  confidence: number;
  /** 1-based position after sorting by the documented score. */
  rankPosition: number;
  reasoning: string;
}

/** Which causal events drive the observed outcome (sensitivity analysis). */
export interface SensitivityResult {
  contributions: { eventType: string; eventId?: string; sharePct: number }[];
  dominant?: { eventType: string; sharePct: number };
  /** Residual share never attributed to any single event (never forced to 0). */
  unexplainedPct: number;
  reasoning: string[];
}

/** The strategic recommendation: what should we do next? */
export interface Recommendation {
  recommendedAction: string;
  decisionType: DecisionType;
  expectedEffect: number;
  /** CALIBRATED confidence when input.calibration is supplied (≤ raw). */
  confidence: number;
  confidenceBand: ConfidenceBand;
  reasoning: string[];
  limitations: string[];
  evidence: string[];
}

/** "If narrative A changes, what happens to narrative B?" */
export interface CrossNarrativeImpact {
  sourceNarrativeId: string;
  targetNarrativeId: string;
  impactType: ImpactType;
  /** 0..100 strength of the cross-narrative coupling. */
  impactStrength: number;
  confidence: number;
  reasoning: string;
}

/** War-gaming: scenario A vs scenario B head-to-head. */
export interface ScenarioBattleResult {
  scenarioA: { name: string; interventions: InterventionType[] };
  scenarioB: { name: string; interventions: InterventionType[] };
  winner: 'A' | 'B' | 'tie';
  confidence: number;
  reasoning: string[];
  limitations: string[];
  metrics: { a: Record<string, number>; b: Record<string, number> };
}

/** A complete decision run: sensitivity → rankings → recommendation. */
export interface DecisionRun {
  narrativeId: string;
  decisionName: string;
  decisionType: DecisionType;
  confidence: number;
  recommendedAction: string;
  reasoning: string[];
  limitations: string[];
  recommendation: Recommendation;
  rankings: InterventionRanking[];
  sensitivity: SensitivityResult;
  generatedAt: string;
}

/** An explainable audit trail for a decision run (no black-box). */
export interface DecisionAudit {
  decisionRunId?: string;
  decisionOutput: Record<string, unknown>;
  confidence: number;
  limitations: string[];
  auditLog: { step: string; detail: string; at: string }[];
}

// Re-used so internal modules can import shared helper types from one place.
export type { CounterfactualInput as _CfInput };
