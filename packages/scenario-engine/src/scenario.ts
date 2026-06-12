// =============================================================================
// @hsi/scenario-engine — scenario lifecycle, likelihood, ranking, comparison,
// and trees.
//
// createScenario / updateScenario build attributed scenarios; the state machine
// (validateScenarioTransition / advanceScenario) governs EMERGING → … → ARCHIVED;
// computeScenarioLikelihood weights the drivers; rankScenarios + compareScenarios
// order competing scenarios; buildScenarioTree assembles a branching tree.
// Deterministic; explainable; never auto-acts.
// =============================================================================

import type {
  RankedScenario,
  Scenario,
  ScenarioBranchInput,
  ScenarioComparison,
  ScenarioDriver,
  ScenarioEvent,
  ScenarioInput,
  ScenarioPatch,
  ScenarioState,
  ScenarioTransitionResult,
  ScenarioTransitionValidity,
  ScenarioTreeNode,
} from './types';

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
export function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** The allowed scenario transitions. */
export const SCENARIO_TRANSITIONS: Record<ScenarioState, ScenarioState[]> = {
  EMERGING: ['ACTIVE', 'MONITORING', 'INVALIDATED', 'ARCHIVED'],
  ACTIVE: ['MONITORING', 'CONFIRMED', 'INVALIDATED', 'ARCHIVED'],
  MONITORING: ['ACTIVE', 'CONFIRMED', 'INVALIDATED', 'ARCHIVED'],
  CONFIRMED: ['ARCHIVED', 'MONITORING'],
  INVALIDATED: ['ARCHIVED'],
  ARCHIVED: ['MONITORING'],
};

/**
 * Compute a scenario's likelihood: the weight-normalised mean of (weight ×
 * presence) across its drivers. No drivers → a neutral 0.5. Deterministic.
 */
export function computeScenarioLikelihood(drivers: ScenarioDriver[]): number {
  if (drivers.length === 0) return 0.5;
  let weighted = 0;
  let totalWeight = 0;
  for (const d of drivers) {
    const w = clamp01(d.weight);
    weighted += w * clamp01(d.presence);
    totalWeight += w;
  }
  return round(totalWeight > 0 ? weighted / totalWeight : 0);
}

/** Create a scenario in EMERGING with a genesis event + computed likelihood. */
export function createScenario(input: ScenarioInput, opts: { now: string; actor?: string }): Scenario {
  const drivers = input.drivers ? input.drivers.map((d) => ({ ...d, weight: clamp01(d.weight), presence: clamp01(d.presence) })) : [];
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    state: 'EMERGING',
    likelihood: computeScenarioLikelihood(drivers),
    drivers,
    forecastIds: input.forecastIds ? [...input.forecastIds] : [],
    createdAt: opts.now,
    updatedAt: opts.now,
    events: [{ scenarioId: input.id, from: 'EMERGING', to: 'EMERGING', actor: opts.actor ?? 'analyst', reason: 'Scenario created.', at: opts.now }],
  };
}

/** Update a scenario (re-scores likelihood if drivers change). Inputs not mutated. */
export function updateScenario(scenario: Scenario, patch: ScenarioPatch, opts: { now: string }): Scenario {
  const drivers = patch.drivers ? patch.drivers.map((d) => ({ ...d, weight: clamp01(d.weight), presence: clamp01(d.presence) })) : scenario.drivers;
  return {
    ...scenario,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    drivers,
    ...(patch.drivers ? { likelihood: computeScenarioLikelihood(drivers) } : {}),
    ...(patch.forecastIds ? { forecastIds: [...patch.forecastIds] } : {}),
    updatedAt: opts.now,
  };
}

/** Is `to` a legal scenario transition? Explainable verdict. */
export function validateScenarioTransition(from: ScenarioState, to: ScenarioState): ScenarioTransitionValidity {
  if (from === to) return { valid: false, reason: `Already in state '${from}'; no self-transition.` };
  const allowed = SCENARIO_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) return { valid: true, reason: `'${from}' → '${to}' is permitted.` };
  return { valid: false, reason: `'${from}' → '${to}' is not permitted (allowed: ${allowed.join(', ') || 'none'}).` };
}

/** Apply a scenario transition. Validated + audited. NEVER throws / silently no-ops. */
export function advanceScenario(scenario: Scenario, to: ScenarioState, opts: { now: string; actor?: string; reason?: string }): ScenarioTransitionResult {
  const verdict = validateScenarioTransition(scenario.state, to);
  if (!verdict.valid) return { ok: false, error: 'INVALID_TRANSITION', reason: verdict.reason };
  const event: ScenarioEvent = { scenarioId: scenario.id, from: scenario.state, to, actor: opts.actor ?? 'analyst', reason: opts.reason ?? verdict.reason, at: opts.now };
  return { ok: true, scenario: { ...scenario, state: to, updatedAt: opts.now, events: [...scenario.events, event] }, event };
}

/** Rank scenarios by likelihood (high→low), with normalised shares. */
export function rankScenarios(scenarios: Scenario[]): RankedScenario[] {
  const total = scenarios.reduce((a, s) => a + clamp01(s.likelihood), 0) || 1;
  return scenarios
    .slice()
    .sort((a, b) => b.likelihood - a.likelihood || a.id.localeCompare(b.id))
    .map((s, i) => ({ id: s.id, title: s.title, state: s.state, likelihood: round(s.likelihood), rank: i + 1, share: round(clamp01(s.likelihood) / total) }));
}

/** Compare a set of scenarios — leader, divergence, and an explainable summary. */
export function compareScenarios(scenarios: Scenario[], opts: { now: string }): ScenarioComparison {
  const ranked = rankScenarios(scenarios);
  const leading = ranked[0]?.id ?? null;
  const top = ranked[0]?.likelihood ?? 0;
  const second = ranked[1]?.likelihood ?? 0;
  // Divergence: gap between leader and runner-up, normalised by the leader.
  const divergence = top > 0 ? round(clamp01((top - second) / top)) : 0;

  const limitations: string[] = [];
  if (scenarios.length < 2) limitations.push('Fewer than two scenarios — comparison is trivial.');
  if (divergence < 0.1 && scenarios.length >= 2) limitations.push('The top scenarios are nearly tied — treat the leader as weakly preferred.');
  limitations.push('Scenario likelihoods are hypotheses, not probabilities of truth; they require human judgement.');

  const summary = leading
    ? `${ranked.length} scenario(s) compared. Leader "${ranked[0].title}" at ${Math.round(top * 100)}% likelihood (divergence ${Math.round(divergence * 100)}% over the runner-up).`
    : 'No scenarios to compare.';

  return { ranked, leading, divergence, summary, limitations, comparedAt: opts.now };
}

/** Build a scenario tree, clamping each branch's probability to 0..1. */
export function buildScenarioTree(root: ScenarioBranchInput): ScenarioTreeNode {
  return {
    id: root.id,
    label: root.label,
    probability: round(clamp01(root.probability)),
    children: (root.children ?? []).map(buildScenarioTree),
  };
}

/** The joint probability of the most-likely path through a scenario tree. */
export function mostLikelyPath(node: ScenarioTreeNode): { path: string[]; probability: number } {
  if (node.children.length === 0) return { path: [node.label], probability: node.probability };
  const best = node.children
    .map((c) => mostLikelyPath(c))
    .sort((a, b) => b.probability - a.probability)[0];
  return { path: [node.label, ...best.path], probability: round(node.probability * best.probability) };
}
