// =============================================================================
// WorldForge web helpers — base world factories + memoized graphs.
// All engine calls are pure & synchronous; we cache the heavier constructions
// (graphs, evaluations, the Chronid demo) so re-renders stay cheap.
// =============================================================================

import {
  createEarthState,
  buildDependencyGraph,
  indexGraph,
  resolveAll,
  evaluateWorld,
  getUniverse,
  type WorldState,
  type SimulationGraph,
  type GraphIndex,
  type WorldEvaluation,
} from '@hsi/simulation-engine';
import { createChronidPrime, chronidDemo, type ChronidDemo } from '@hsi/counterfactuals';

export type WorldId = 'earth' | 'chronid';

export interface WorldHandle {
  id: WorldId;
  name: string;
  description: string;
  /** Fresh state factory (call when you need a mutable copy). */
  factory: () => WorldState;
}

export const WORLDS: Record<WorldId, WorldHandle> = {
  earth: {
    id: 'earth',
    name: 'Earth',
    description:
      'The reference world. Carbon-and-water biochemistry, a G-type star, a balanced habitable orbit.',
    factory: createEarthState,
  },
  chronid: {
    id: 'chronid',
    name: 'Chronid Prime',
    description:
      'A frozen, high-gravity super-earth around a long-lived red dwarf. Crystal genetics, geological neural networks, one thought per ~1000 Earth years.',
    factory: createChronidPrime,
  },
};

export const WORLD_LIST: WorldHandle[] = [WORLDS.earth, WORLDS.chronid];

// ---- memoized constructions ------------------------------------------------

const stateCache = new Map<WorldId, WorldState>();
const graphCache = new Map<WorldId, SimulationGraph>();
const indexCache = new Map<WorldId, GraphIndex>();
const evalCache = new Map<WorldId, WorldEvaluation>();
let chronidDemoCache: ChronidDemo | null = null;

/** A stable (cached, resolved) base state for a world. Treat as read-only. */
export function getBaseState(id: WorldId): WorldState {
  let s = stateCache.get(id);
  if (!s) {
    s = WORLDS[id].factory();
    stateCache.set(id, s);
  }
  return s;
}

/** A stable (cached, resolved) dependency graph for a world. */
export function getGraph(id: WorldId): SimulationGraph {
  let g = graphCache.get(id);
  if (!g) {
    const state = getBaseState(id);
    g = buildDependencyGraph(state, getUniverse(state.universeType));
    const index = indexGraph(g);
    resolveAll(g, index);
    graphCache.set(id, g);
    indexCache.set(id, index);
  }
  return g;
}

/** A stable index matching getGraph(id). */
export function getGraphIndex(id: WorldId): GraphIndex {
  if (!indexCache.has(id)) getGraph(id);
  return indexCache.get(id) as GraphIndex;
}

/** A stable evaluation report for a world. */
export function getEvaluation(id: WorldId): WorldEvaluation {
  let e = evalCache.get(id);
  if (!e) {
    e = evaluateWorld(getBaseState(id));
    evalCache.set(id, e);
  }
  return e;
}

/** The full (cached) Chronid showcase bundle. */
export function getChronidDemo(): ChronidDemo {
  if (!chronidDemoCache) chronidDemoCache = chronidDemo();
  return chronidDemoCache;
}
