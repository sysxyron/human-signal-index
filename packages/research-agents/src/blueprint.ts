// =============================================================================
// @hsi/research-agents — blueprint
// consensusToBlueprint() turns a ResearchRunResult into a SimulationBlueprint:
// it folds the consensus' merged dotted recommendedParameters (e.g.
// "planet.gravityG", "star.type") into a deep-partial WorldState override tree.
// blueprintToWorldState() applies that tree via createWorld() to produce a real,
// simulatable WorldState. Planets are an array, so "planet.*" keys target
// planets[0].
// =============================================================================

import { createWorld, createEarth } from '@hsi/world-models';
import type { WorldState } from '@hsi/world-models';
import type { ResearchRunResult, SimulationBlueprint } from './types';

/** Keys that we know map onto WorldState; anything else is ignored for state. */
const KNOWN_PREFIXES = ['star', 'planet', 'chemistry', 'biology', 'intelligence', 'civilization', 'risks'];

type AnyRecord = Record<string, unknown>;

/** Set a dotted path into a nested object, creating intermediate objects. */
function setPath(root: AnyRecord, path: string[], value: unknown): void {
  let node: AnyRecord = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = node[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      node[key] = {};
    }
    node = node[key] as AnyRecord;
  }
  node[path[path.length - 1]] = value;
}

/** Parse a comma-separated biomes string into an array (biology.biomes). */
function coerceBiomes(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const arr = value.split(',').map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

/**
 * Build the deep-partial WorldState override tree from merged dotted params.
 * "planet.*" keys are collected and applied to planets[0]. Non-WorldState keys
 * (e.g. "temporal.*", "risk.comparison.*") are skipped.
 */
export function paramsToStateOverrides(
  params: Record<string, number | string | boolean>,
): Record<string, unknown> {
  const overrides: AnyRecord = {};
  const planet: AnyRecord = {};

  for (const [key, value] of Object.entries(params)) {
    const parts = key.split('.');
    const prefix = parts[0];
    if (!KNOWN_PREFIXES.includes(prefix)) continue;

    if (prefix === 'planet') {
      // planet.<field> -> collected, applied to planets[0].
      if (parts[1] === 'biomes') continue; // belongs to biology
      setPath(planet, parts.slice(1), value);
    } else if (prefix === 'biology' && parts[1] === 'biomes') {
      const biomes = coerceBiomes(value);
      if (biomes) setPath(overrides, ['biology', 'biomes'], biomes);
    } else if (prefix === 'biology' && parts[1] === 'metabolismRate') {
      // Not a WorldState field; skip (informational only).
      continue;
    } else {
      setPath(overrides, parts, value);
    }
  }

  if (Object.keys(planet).length > 0) {
    // planets is an array (deep-merge replaces arrays wholesale), so we layer the
    // collected planet fields onto a full Earth planet to keep a valid Planet.
    const base = createEarth() as unknown as AnyRecord;
    const merged: AnyRecord = { ...base };
    for (const [k, v] of Object.entries(planet)) {
      if (k === 'atmosphereComposition' && typeof v === 'object' && v !== null) {
        merged[k] = { ...(base[k] as AnyRecord), ...(v as AnyRecord) };
      } else {
        merged[k] = v;
      }
    }
    overrides['planets'] = [merged];
  }
  return overrides;
}

/** Turn a finished research run into a buildable SimulationBlueprint. */
export function consensusToBlueprint(result: ResearchRunResult): SimulationBlueprint {
  const params = result.consensus.recommendedParameters;
  const stateOverrides = paramsToStateOverrides(params);

  const universeType =
    typeof params['universeType'] === 'string'
      ? (params['universeType'] as string)
      : 'standard-physics';
  // Stamp the universe + a name onto the overrides too.
  (stateOverrides as AnyRecord)['universeType'] = universeType;

  const worldName = result.concept.title ?? 'Researched World';
  (stateOverrides as AnyRecord)['name'] = worldName;

  const rationale: string[] = [
    ...result.consensus.blueprintNotes,
    `Universe preset: ${universeType}.`,
    `Mapped ${Object.keys(params).filter((k) => k.includes('.')).length} recommended parameters onto WorldState.`,
  ];

  return {
    worldName,
    universeType,
    stateOverrides,
    rationale,
    confidence: result.consensus.overallConfidence,
  };
}

/**
 * Apply a blueprint's overrides onto the Earth baseline (via createWorld) to
 * produce a real, fully-populated, simulatable WorldState.
 */
export function blueprintToWorldState(blueprint: SimulationBlueprint): WorldState {
  // createWorld deep-merges a DeepPartial<WorldState>; our override tree matches
  // that shape (planets is a full array entry for planets[0]).
  return createWorld(blueprint.stateOverrides as Parameters<typeof createWorld>[0]);
}
