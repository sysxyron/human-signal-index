// =============================================================================
// @hsi/simulation-engine — SimulationEngine / StateManager
// Holds a WorldState, builds its graph, recomputes derived fields from the graph
// back into the state, exposes typed get/set, and records immutable versions.
// State is the single source of truth; the graph is the recompute substrate.
// =============================================================================

import { buildDependencyGraph, N } from '../graph/builder';
import { indexGraph, type GraphIndex, type SimulationGraph } from '../graph/types';
import { resolveAll, propagate, type ImpactChain } from './propagation';
import { getUniverse, cloneState, type Universe, type WorldState } from '@hsi/world-models';
import { createVersion, type WorldVersion } from '../versioning/version';

/** A dotted path into the WorldState, e.g. 'planet.gravityG' or 'star.massSolar'. */
export type StatePath = string;

/** Map a small set of editable state paths to the graph root node they drive. */
const PATH_TO_ROOT: Record<string, string> = {
  'star.massSolar': N.starMass,
  'star.temperatureK': N.starTemp,
  'planet.massEarth': N.planetMass,
  'planet.radiusEarth': N.planetRadius,
  'planet.orbitAU': N.planetOrbit,
  'planet.albedo': N.planetAlbedo,
  'planet.atmospherePressureAtm': N.planetBasePressure,
  'planet.waterCoverage': N.planetWater,
  'planet.magnetosphereStrength': N.planetMagDeclared,
  'chemistry.stabilityIndex': N.chemStability,
  'biology.evolutionRate': N.evolutionRate,
  'intelligence.cognitiveRateHz': N.cognitiveRate,
  'intelligence.problemSolvingIndex': N.problemSolving,
  'civilization.mathematicsLevel': N.mathematics,
  'civilization.riskManagementIndex': N.riskManagement,
};

/** Resolve a dotted path to a numeric value on the state's first planet/section. */
function readPath(state: WorldState, path: StatePath): number {
  const [head, key] = path.split('.');
  if (head === 'planet') return numberAt(state.planets[0] as unknown as Record<string, unknown>, key);
  const section = (state as unknown as Record<string, unknown>)[head];
  return numberAt(section as Record<string, unknown>, key);
}

function numberAt(obj: Record<string, unknown> | undefined, key: string): number {
  const v = obj?.[key];
  return typeof v === 'number' ? v : 0;
}

/** Write a numeric value at a dotted path (mutates the given state). */
function writePath(state: WorldState, path: StatePath, value: number): void {
  const [head, key] = path.split('.');
  if (head === 'planet') {
    const p = state.planets[0];
    if (p) (p as unknown as Record<string, unknown>)[key] = value;
    return;
  }
  const section = (state as unknown as Record<string, unknown>)[head];
  if (section && typeof section === 'object') {
    (section as Record<string, unknown>)[key] = value;
  }
}

/** Manages a world, its graph, recomputation, and version history. */
export class SimulationEngine {
  private state: WorldState;
  private universe: Universe;
  private graph: SimulationGraph;
  private index: GraphIndex;
  private versions: WorldVersion[] = [];

  constructor(state: WorldState, universe?: Universe) {
    this.state = cloneState(state);
    this.universe = universe ?? getUniverse(state.universeType);
    this.graph = buildDependencyGraph(this.state, this.universe);
    this.index = indexGraph(this.graph);
    resolveAll(this.graph, this.index);
    this.writeDerivedBackToState();
  }

  /** The current world state (single source of truth). */
  getState(): WorldState {
    return this.state;
  }

  /** The current simulation graph (resolved). */
  getGraph(): SimulationGraph {
    return this.graph;
  }

  /** The active universe. */
  getUniverse(): Universe {
    return this.universe;
  }

  /** Read a numeric value at a state path. */
  get(path: StatePath): number {
    return readPath(this.state, path);
  }

  /**
   * Set a numeric value at a state path, propagate the change through the graph,
   * write derived results back into the state, and return the impact cascade.
   */
  set(path: StatePath, value: number): ImpactChain {
    writePath(this.state, path, value);
    const rootId = PATH_TO_ROOT[path];
    if (!rootId) {
      // Not a graph-wired field; rebuild fully to stay consistent.
      this.rebuild();
      return { steps: [], affectedCount: 0 };
    }
    const node = this.index.nodeById.get(rootId);
    if (node) node.value = value;
    const impact = propagate(this.graph, [rootId], this.index);
    this.writeDerivedBackToState();
    return impact;
  }

  /** Switch the universe (constants change → full rebuild & recompute). */
  setUniverse(universe: Universe): void {
    this.universe = universe;
    this.state.universeType = universe.type;
    this.rebuild();
  }

  /** Rebuild the graph from the current state and recompute everything. */
  rebuild(): void {
    this.graph = buildDependencyGraph(this.state, this.universe);
    this.index = indexGraph(this.graph);
    resolveAll(this.graph, this.index);
    this.writeDerivedBackToState();
  }

  /** Snapshot the current state as an immutable version. */
  snapshot(label: string, timestamp: string): WorldVersion {
    const version = createVersion(this.state, label, timestamp, this.versions.length + 1);
    this.versions.push(version);
    return version;
  }

  /** All recorded versions (oldest first). */
  getVersions(): WorldVersion[] {
    return this.versions;
  }

  /** Replace the whole state (e.g. after a counterfactual) and rebuild. */
  replaceState(state: WorldState): void {
    this.state = cloneState(state);
    this.universe = getUniverse(this.state.universeType);
    this.rebuild();
  }

  /**
   * Write graph-derived node values back into the canonical WorldState so the
   * state always reflects the latest computation (reports read from state).
   */
  private writeDerivedBackToState(): void {
    const v = (id: string): number => this.index.nodeById.get(id)?.value ?? 0;
    const planet = this.state.planets[0];
    if (planet) {
      planet.gravityG = v(N.gravity);
      planet.escapeVelocityKmS = v(N.escapeVel);
      planet.temperatureK = v(N.temperature);
      planet.magnetosphereStrength = v(N.magnetosphere);
    }
    this.state.star.luminositySolar = v(N.starLuminosity);
    this.state.star.radiationIndex = v(N.starRadiation);
    this.state.star.habitableZoneInnerAU = v(N.hzInner);
    this.state.star.habitableZoneOuterAU = v(N.hzOuter);
    this.state.biology.complexityIndex = v(N.complexity);
    this.state.civilization.technologyLevel = v(N.technology) * 3; // node is 0..1 → Kardashev 0..3
    this.state.risks.stellarLifetimeRemainingGyr = v(N.starLifetime);
    this.state.risks.extinctionIndex = v(N.extinction);
  }
}

/** Alias for callers preferring the name "StateManager". */
export const StateManager = SimulationEngine;
export type StateManager = SimulationEngine;
