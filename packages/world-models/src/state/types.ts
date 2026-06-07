// =============================================================================
// @hsi/simulation-engine — WorldState model
// The canonical, single-source-of-truth representation of a world. Reports are
// DERIVED from this; this is never derived from a report. All numeric fields use
// explicit units encoded in the field name (…Solar, …Earth, …K, …AU, …Gyr).
// =============================================================================

import type { UniverseType } from '../universe/universe';

/** Stellar spectral / end-state classes. */
export type StarType =
  | 'O'
  | 'B'
  | 'A'
  | 'F'
  | 'G'
  | 'K'
  | 'M'
  | 'whiteDwarf'
  | 'redGiant'
  | 'neutron';

export interface Star {
  type: StarType;
  /** Mass in solar masses. */
  massSolar: number;
  /** Luminosity in solar luminosities. */
  luminositySolar: number;
  /** 0..1 normalized ionizing/UV/particle radiation index. */
  radiationIndex: number;
  /** Age in billions of years. */
  ageGyr: number;
  /** Effective surface temperature, kelvin. */
  temperatureK: number;
  /** Inner edge of the habitable zone, AU. */
  habitableZoneInnerAU: number;
  /** Outer edge of the habitable zone, AU. */
  habitableZoneOuterAU: number;
}

/** Gas fraction map: composition gas symbol -> fraction (0..1, ~sums to 1). */
export type AtmosphereComposition = Record<string, number>;

export interface Planet {
  id: string;
  name: string;
  /** Mass in Earth masses. */
  massEarth: number;
  /** Radius in Earth radii. */
  radiusEarth: number;
  /** Surface gravity in g (Earth = 1). */
  gravityG: number;
  /** Orbital semi-major axis, AU. */
  orbitAU: number;
  /** Surface pressure in atmospheres (Earth = 1). */
  atmospherePressureAtm: number;
  atmosphereComposition: AtmosphereComposition;
  /** Mean surface temperature, kelvin. */
  temperatureK: number;
  /** Escape velocity, km/s. */
  escapeVelocityKmS: number;
  /** 0..1 normalized magnetic-field strength (Earth ≈ 0.5). */
  magnetosphereStrength: number;
  /** 0..1 bond albedo. */
  albedo: number;
  /** Age in billions of years. */
  ageGyr: number;
  /** 0..1 fraction of surface covered by the chemistry's solvent. */
  waterCoverage: number;
}

export type Solvent = 'water' | 'ammonia' | 'methane' | 'silicate' | 'supercriticalCO2';

export interface Chemistry {
  solvent: Solvent;
  /** Free-text metabolism descriptor, e.g. 'aerobic carbon'. */
  metabolism: string;
  /** Replication mechanism descriptor, e.g. 'template polymer'. */
  replication: string;
  /** 0..1 thermodynamic stability of the chemistry under local conditions. */
  stabilityIndex: number;
}

export type GeneticsSubstrate = 'DNA' | 'RNA' | 'crystal' | 'protein' | 'magnetic' | 'none';

export interface Biology {
  /** Free-text cell architecture, e.g. 'membrane-bound eukaryote'. */
  cellStructure: string;
  geneticsSubstrate: GeneticsSubstrate;
  /** 0..1 relative pace of evolution (Earth baseline ≈ 0.5). */
  evolutionRate: number;
  /** 0..1 biological complexity index. */
  complexityIndex: number;
  /** Named biomes present. */
  biomes: string[];
}

export interface Intelligence {
  present: boolean;
  /**
   * Cognitive throughput in "thoughts per second". Can be tiny — e.g. one
   * thought per century ≈ 1 / (100·365·86400) ≈ 3.17e-10 Hz.
   */
  cognitiveRateHz: number;
  /** Free-text cognitive substrate, e.g. 'neuronal', 'mineral lattice'. */
  substrate: string;
  /** 0..1 problem-solving capability index. */
  problemSolvingIndex: number;
}

export interface Civilization {
  present: boolean;
  /** Free-text social organization descriptor. */
  society: string;
  /** Free-text legal/normative system descriptor. */
  laws: string;
  /** 0..1 sophistication of formal mathematics. */
  mathematicsLevel: number;
  /** Kardashev-ish technology level, ~0..3 (0.7 ≈ modern Earth). */
  technologyLevel: number;
  /** 0..1 ability to anticipate and mitigate existential risk. */
  riskManagementIndex: number;
  /** log10 of population (Earth ≈ 9.9). */
  populationOrders: number;
}

export interface Risks {
  /** 0..1 aggregate extinction probability over the next era. */
  extinctionIndex: number;
  /** 0..1 climate instability. */
  climateInstability: number;
  /** 0..1 asteroid/impact exposure. */
  asteroidExposure: number;
  /** Remaining stellar main-sequence lifetime, Gyr. */
  stellarLifetimeRemainingGyr: number;
  /** 0..1 risk the civilization destroys itself. */
  selfDestructionRisk: number;
}

export interface WorldMeta {
  /** Schema version of this state shape. */
  schemaVersion: string;
  /** ISO timestamp PASSED IN by the caller (never Date.now() internally). */
  createdAt: string;
  /** Deterministic seed for any stochastic step. */
  seed: number;
  /** Optional free-form note / scenario lineage. */
  note?: string;
}

/** The canonical world. Single source of truth. */
export interface WorldState {
  id: string;
  name: string;
  universeType: UniverseType;
  star: Star;
  planets: Planet[];
  chemistry: Chemistry;
  biology: Biology;
  intelligence: Intelligence;
  civilization: Civilization;
  risks: Risks;
  meta: WorldMeta;
}
