// =============================================================================
// @hsi/simulation-engine — Counterfactual Engine ("counterfactual_engine")
// applyCounterfactual(state, modification): apply a what-if change, rebuild &
// propagate, and return the recomputed world plus a human-readable cascade
// explanation ("Gravity Increased ↓ Atmosphere Density Changed ↓ ... ↓ Tech").
// =============================================================================

import { SimulationEngine, type ImpactChain } from '@hsi/simulation-engine';
import { getUniverse, clamp01, type WorldState } from '@hsi/world-models';

export type CounterfactualOp = 'set' | 'multiply' | 'add';

/** A single what-if modification to one numeric state path. */
export interface Counterfactual {
  /** Dotted state path, e.g. 'planet.gravityG'. */
  target: string;
  op: CounterfactualOp;
  value: number;
  /** Human-readable label for the change. */
  label: string;
  /** Optional special handling, e.g. removing a gas from the atmosphere. */
  special?: 'removeOxygen' | 'starToRedGiant';
}

export interface CounterfactualResult {
  newState: WorldState;
  impactChain: ImpactChain;
  /** Human-readable cascade, joined with ↓ separators. */
  explanation: string;
  /** Node ids that changed value. */
  affectedNodes: string[];
  /** 0..1 confidence in the counterfactual (min scientific confidence on the path). */
  confidence: number;
}

/** Apply an op to a base value. */
function applyOp(base: number, op: CounterfactualOp, value: number): number {
  switch (op) {
    case 'set':
      return value;
    case 'multiply':
      return base * value;
    case 'add':
      return base + value;
  }
}

/**
 * Apply a counterfactual: mutate the target, recompute the graph, and explain
 * the cascade. Special cases handle non-scalar edits (atmosphere, star type).
 */
export function applyCounterfactual(
  state: WorldState,
  modification: Counterfactual,
): CounterfactualResult {
  const engine = new SimulationEngine(state, getUniverse(state.universeType));

  let impactChain: ImpactChain = { steps: [], affectedCount: 0 };

  if (modification.special === 'removeOxygen') {
    // Strip O2 from the atmosphere; rebuild (composition isn't a single root).
    const planet = engine.getState().planets[0];
    if (planet) {
      const o2 = planet.atmosphereComposition.O2 ?? 0;
      delete planet.atmosphereComposition.O2;
      // Redistribute fraction to inert N2 to keep the map normalized.
      planet.atmosphereComposition.N2 = (planet.atmosphereComposition.N2 ?? 0) + o2;
    }
    engine.rebuild();
  } else if (modification.special === 'starToRedGiant') {
    const s = engine.getState().star;
    s.type = 'redGiant';
    s.massSolar = Math.max(s.massSolar, 1.2);
    s.temperatureK = 3500;
    // Drive luminosity up via mass; rebuild then bump orbit habitability cascade.
    engine.rebuild();
    impactChain = engine.set('star.massSolar', s.massSolar * 6);
  } else {
    const base = engine.get(modification.target);
    const next = applyOp(base, modification.op, modification.value);
    impactChain = engine.set(modification.target, next);
  }

  const affectedNodes = impactChain.steps.filter((s) => s.delta !== 0).map((s) => s.nodeId);
  const explanation = buildCascadeExplanation(modification, impactChain);
  const confidence = computeConfidence(engine, impactChain, modification);

  return {
    newState: engine.getState(),
    impactChain,
    explanation,
    affectedNodes,
    confidence,
  };
}

/** Build the "A ↓ B ↓ C" cascade string from the impact chain. */
function buildCascadeExplanation(mod: Counterfactual, chain: ImpactChain): string {
  const head = mod.label;
  // Deduplicate by label, keep order, drop the trigger (delta 0).
  const seen = new Set<string>();
  const cascade: string[] = [];
  for (const step of chain.steps) {
    if (step.delta === 0) continue;
    const dir = step.delta > 0 ? 'increased' : 'decreased';
    const text = `${step.label} ${dir}`;
    if (!seen.has(text)) {
      seen.add(text);
      cascade.push(text);
    }
  }
  return [head, ...cascade].join(' ↓ ');
}

/** Confidence = min scientific confidence of changed nodes, blended with count. */
function computeConfidence(
  engine: SimulationEngine,
  chain: ImpactChain,
  _mod: Counterfactual,
): number {
  const byId = new Map(engine.getGraph().nodes.map((n) => [n.id, n]));
  let minSci = 1;
  for (const step of chain.steps) {
    const n = byId.get(step.nodeId);
    if (n) minSci = Math.min(minSci, n.provenance.scientificConfidence.confidence);
  }
  // More affected nodes traced = more complete cascade = slightly higher trust.
  const coverage = clamp01(chain.affectedCount / 12);
  return Math.round((0.7 * minSci + 0.3 * coverage) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Ready-made example counterfactuals.
// ---------------------------------------------------------------------------
// Note: gravity is DERIVED (g = M/R²), so a "3x gravity" counterfactual is
// expressed as tripling planetary mass — the graph then recomputes gravity,
// escape velocity, atmosphere retention, and everything downstream.
export const EXAMPLE_COUNTERFACTUALS: Counterfactual[] = [
  { target: 'planet.massEarth', op: 'multiply', value: 3, label: 'Gravity tripled (3x mass)' },
  { target: 'planet.atmospherePressureAtm', op: 'set', value: 0, label: 'Atmosphere loses oxygen', special: 'removeOxygen' },
  { target: 'star.massSolar', op: 'set', value: 0, label: 'Star becomes a red giant', special: 'starToRedGiant' },
  { target: 'intelligence.cognitiveRateHz', op: 'set', value: 3.17e-10, label: 'Intelligence: one thought per century' },
];
