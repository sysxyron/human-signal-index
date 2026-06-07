// =============================================================================
// @hsi/simulation-engine — WorldState factories
// createEarthState() is the reference world with real-ish numbers. createWorld()
// lets callers deep-merge overrides while keeping a valid, fully-populated state.
// =============================================================================

import type {
  Biology,
  Chemistry,
  Civilization,
  Intelligence,
  Planet,
  Risks,
  Star,
  WorldMeta,
  WorldState,
} from './types';

/** Earth's host star (the Sun, a G2V main-sequence star). */
export function createSun(): Star {
  return {
    type: 'G',
    massSolar: 1,
    luminositySolar: 1,
    radiationIndex: 0.25, // moderate UV/particle flux at 1 AU
    ageGyr: 4.6,
    temperatureK: 5772,
    // Conservative habitable zone for the Sun (Kopparapu-ish), AU.
    habitableZoneInnerAU: 0.95,
    habitableZoneOuterAU: 1.67,
  };
}

/** Earth itself. */
export function createEarth(): Planet {
  return {
    id: 'earth',
    name: 'Earth',
    massEarth: 1,
    radiusEarth: 1,
    gravityG: 1,
    orbitAU: 1,
    atmospherePressureAtm: 1,
    atmosphereComposition: { N2: 0.78, O2: 0.21, Ar: 0.0093, CO2: 0.0004 },
    temperatureK: 288, // mean surface temperature
    escapeVelocityKmS: 11.2,
    magnetosphereStrength: 0.5,
    albedo: 0.306,
    ageGyr: 4.54,
    waterCoverage: 0.71,
  };
}

function earthChemistry(): Chemistry {
  return {
    solvent: 'water',
    metabolism: 'aerobic carbon',
    replication: 'template polymer (DNA)',
    stabilityIndex: 0.9,
  };
}

function earthBiology(): Biology {
  return {
    cellStructure: 'membrane-bound eukaryote',
    geneticsSubstrate: 'DNA',
    evolutionRate: 0.5,
    complexityIndex: 0.85,
    biomes: ['ocean', 'forest', 'grassland', 'desert', 'tundra', 'reef'],
  };
}

function earthIntelligence(): Intelligence {
  return {
    present: true,
    cognitiveRateHz: 20, // ~tens of conscious "thoughts" per second, order-of-magnitude
    substrate: 'neuronal',
    problemSolvingIndex: 0.8,
  };
}

function earthCivilization(): Civilization {
  return {
    present: true,
    society: 'global networked nation-states',
    laws: 'codified statutory + international law',
    mathematicsLevel: 0.85,
    technologyLevel: 0.73, // ~Kardashev 0.73
    riskManagementIndex: 0.45,
    populationOrders: 9.9, // ~8 billion
  };
}

function earthRisks(): Risks {
  return {
    extinctionIndex: 0.12,
    climateInstability: 0.4,
    asteroidExposure: 0.1,
    stellarLifetimeRemainingGyr: 5.0, // Sun has ~5 Gyr of main sequence left
    selfDestructionRisk: 0.2,
  };
}

/** The canonical Earth reference world. */
export function createEarthState(
  opts: { id?: string; name?: string; createdAt?: string; seed?: number } = {},
): WorldState {
  const meta: WorldMeta = {
    schemaVersion: '1.0.0',
    createdAt: opts.createdAt ?? '1970-01-01T00:00:00.000Z',
    seed: opts.seed ?? 0x1eaf,
  };
  return {
    id: opts.id ?? 'earth-baseline',
    name: opts.name ?? 'Earth (baseline)',
    universeType: 'standard-physics',
    star: createSun(),
    planets: [createEarth()],
    chemistry: earthChemistry(),
    biology: earthBiology(),
    intelligence: earthIntelligence(),
    civilization: earthCivilization(),
    risks: earthRisks(),
    meta,
  };
}

/** Recursively merge plain-object overrides into a base object (immutably). */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer _U>
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override as unknown as T) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(override as Record<string, unknown>)) {
    const o = (override as Record<string, unknown>)[key];
    if (o === undefined) continue;
    const b = out[key];
    out[key] = isPlainObject(b) && isPlainObject(o) ? deepMerge(b, o) : o;
  }
  return out as T;
}

/** Create a world from the Earth baseline with deep overrides applied. */
export function createWorld(overrides: DeepPartial<WorldState> = {}): WorldState {
  return deepMerge(createEarthState(), overrides);
}

/** Structural deep clone of a WorldState (no shared references). */
export function cloneState(state: WorldState): WorldState {
  return {
    ...state,
    star: { ...state.star },
    planets: state.planets.map((p) => ({
      ...p,
      atmosphereComposition: { ...p.atmosphereComposition },
    })),
    chemistry: { ...state.chemistry },
    biology: { ...state.biology, biomes: [...state.biology.biomes] },
    intelligence: { ...state.intelligence },
    civilization: { ...state.civilization },
    risks: { ...state.risks },
    meta: { ...state.meta },
  };
}
