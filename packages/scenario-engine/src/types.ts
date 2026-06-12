// =============================================================================
// @hsi/scenario-engine — public type surface (WorldForge/HSI Phase 21).
//
// SCENARIO PLANNING + EARLY WARNING. Scenarios are competing hypotheses about how
// the future may unfold; the engine scores their likelihood, ranks/compares them,
// and builds a branching scenario tree. The early-warning layer detects emerging
// patterns / signal acceleration / trust collapse / narrative shift / consensus
// instability / forecast risk and raises INFO / WATCH / WARNING / CRITICAL alerts.
//
// PRINCIPLES (binding — identical to Phases 16-20):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every likelihood/alert carries its drivers + a
//     reason. Alerts ONLY — NEVER auto-act, NEVER auto-escalate, NEVER auto-truth.
// =============================================================================

/** The lifecycle state of a scenario. */
export type ScenarioState =
  | 'EMERGING' | 'ACTIVE' | 'MONITORING' | 'CONFIRMED' | 'INVALIDATED' | 'ARCHIVED';

/** A driver that raises (or lowers) a scenario's likelihood. */
export interface ScenarioDriver {
  label: string;
  /** Relative weight of this driver, 0..1. */
  weight: number;
  /** How strongly this driver is currently present, 0..1. */
  presence: number;
}

/** An audited scenario transition. */
export interface ScenarioEvent {
  scenarioId: string;
  from: ScenarioState;
  to: ScenarioState;
  actor: string;
  reason: string;
  at: string;
}

/** A scenario — a competing future hypothesis. */
export interface Scenario {
  id: string;
  title: string;
  description: string;
  state: ScenarioState;
  /** 0..1 likelihood (from drivers). */
  likelihood: number;
  drivers: ScenarioDriver[];
  /** Forecasts associated with this scenario (traceability). */
  forecastIds: string[];
  createdAt: string;
  updatedAt: string;
  events: ScenarioEvent[];
}

export interface ScenarioInput {
  id: string;
  title: string;
  description: string;
  drivers?: ScenarioDriver[];
  forecastIds?: string[];
}
export interface ScenarioPatch {
  title?: string;
  description?: string;
  drivers?: ScenarioDriver[];
  forecastIds?: string[];
}

export type ScenarioTransitionValidity = { valid: boolean; reason: string };
export type ScenarioTransitionResult =
  | { ok: true; scenario: Scenario; event: ScenarioEvent }
  | { ok: false; error: string; reason: string };

/** A ranked scenario row. */
export interface RankedScenario {
  id: string;
  title: string;
  state: ScenarioState;
  likelihood: number;
  rank: number;
  /** Normalised share of likelihood across the compared set, 0..1. */
  share: number;
}

/** A comparison across a set of scenarios. */
export interface ScenarioComparison {
  ranked: RankedScenario[];
  leading: string | null;
  /** 0..1 — how dominant the leader is over the rest (1 = uncontested). */
  divergence: number;
  summary: string;
  limitations: string[];
  comparedAt: string;
}

/** A node in a scenario tree. */
export interface ScenarioTreeNode {
  id: string;
  label: string;
  /** 0..1 probability of this branch given its parent. */
  probability: number;
  children: ScenarioTreeNode[];
}

/** Input to buildScenarioTree (a branch). */
export interface ScenarioBranchInput {
  id: string;
  label: string;
  probability: number;
  children?: ScenarioBranchInput[];
}

// ---- Early warning ----------------------------------------------------------

/** Early-warning alert severity. */
export type WarningLevel = 'INFO' | 'WATCH' | 'WARNING' | 'CRITICAL';

/** What kind of early-warning pattern was detected. */
export type WarningKind =
  | 'emerging_pattern'
  | 'signal_acceleration'
  | 'trust_collapse'
  | 'narrative_shift'
  | 'consensus_instability'
  | 'forecast_risk';

/** An early-warning alert (advisory — never auto-acts). */
export interface EarlyWarning {
  id: string;
  kind: WarningKind;
  level: WarningLevel;
  title: string;
  /** One-line description of the signal. */
  signal: string;
  /** The numbers behind the detection. */
  evidence: string[];
  recommendation: string;
  /** Optional originating entity (signal/narrative/forecast id). */
  entityId?: string;
  detectedAt: string;
}
