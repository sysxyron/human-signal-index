// =============================================================================
// @hsi/world-models — Chronid Prime world factory
// The pure WorldState factory for the flagship Chronid showcase. Chronid Prime:
// subjective day ≈ 1000 Earth years, so cognitiveRateHz ≈ 1 thought / ~1000 yr
// ≈ 3.17e-11 Hz. A frozen, high-gravity super-earth with crystal genetics and
// mineral neural networks, hosting a billion-year civilization. Only the pure
// world definition lives here; the demo orchestration lives in @hsi/counterfactuals.
// =============================================================================

import { createWorld } from './factory';
import type { WorldState } from './types';

/** 1 thought per ~1000 Earth years, in Hz. */
export const CHRONID_COGNITIVE_RATE_HZ = 1 / (1000 * 365 * 86400); // ≈ 3.17e-11

/** Construct Chronid Prime. */
export function createChronidPrime(): WorldState {
  return createWorld({
    id: 'chronid-prime',
    name: 'Chronid Prime',
    universeType: 'high-gravity',
    star: {
      type: 'M', // long-lived red dwarf → billion-year civilization possible
      massSolar: 0.4,
      temperatureK: 3400,
      ageGyr: 9,
    },
    planets: [
      {
        id: 'chronid-prime-b',
        name: 'Chronid Prime',
        massEarth: 4.5, // super-earth → high gravity
        radiusEarth: 1.6,
        gravityG: 1, // recomputed by the graph from mass/radius + universe
        orbitAU: 0.7, // farther effective → cold given the dim M-dwarf
        atmospherePressureAtm: 12, // thick, exotic atmosphere
        atmosphereComposition: { N2: 0.6, CO2: 0.25, CH4: 0.1, Ar: 0.05 },
        temperatureK: 120, // frozen world
        escapeVelocityKmS: 11.2, // recomputed
        magnetosphereStrength: 0.7,
        albedo: 0.6, // icy / reflective
        ageGyr: 8.5,
        waterCoverage: 0.05, // mostly frozen; trace liquid
      },
    ],
    chemistry: {
      solvent: 'ammonia', // liquid at the low temperatures here
      metabolism: 'cryogenic mineral redox',
      replication: 'crystal lattice templating',
      stabilityIndex: 0.7,
    },
    biology: {
      cellStructure: 'silicate-mineral aggregate',
      geneticsSubstrate: 'crystal',
      evolutionRate: 0.08, // extremely slow
      complexityIndex: 0.6,
      biomes: ['ice plains', 'mineral spires', 'subglacial brine'],
    },
    intelligence: {
      present: true,
      cognitiveRateHz: CHRONID_COGNITIVE_RATE_HZ, // ~1 thought / 1000 yr
      substrate: 'geological mineral neural network',
      problemSolvingIndex: 0.85, // slow but deeply capable
    },
    civilization: {
      present: true,
      society: 'monolithic geological collective',
      laws: 'crystalline covenant (changes over millennia)',
      mathematicsLevel: 0.9,
      technologyLevel: 0.6,
      riskManagementIndex: 0.8, // a billion years of foresight
      populationOrders: 6, // ~a million slow minds
    },
    risks: {
      extinctionIndex: 0.05,
      climateInstability: 0.1, // glacial stability
      asteroidExposure: 0.15,
      stellarLifetimeRemainingGyr: 80, // red dwarfs live for trillions of years
      selfDestructionRisk: 0.02,
    },
  });
}
