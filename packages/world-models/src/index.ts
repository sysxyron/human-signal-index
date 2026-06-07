// =============================================================================
// @hsi/world-models — public API (FOUNDATION layer)
// Pure world primitives: PRNG/math utilities, scientific-confidence classifier,
// universe presets, the canonical WorldState model + factories, and provenance.
// Zero @hsi dependencies; everything else in the simulation stack builds on this.
// =============================================================================

// ---- util ------------------------------------------------------------------
export { createRng, seedFromString, type Rng } from './util/prng';
export {
  clamp,
  clamp01,
  lerp,
  remap,
  logistic,
  gaussianBand,
  safeLog10,
  sigFigs,
} from './util/math';

// ---- scientific confidence -------------------------------------------------
export {
  classifyStatement,
  scientificConfidence,
  KNOWN,
  PLAUSIBLE,
  SPECULATIVE,
  FICTIONAL,
  VIOLATES,
  type ScientificConfidence,
  type ScientificConfidenceTier,
} from './scientific-confidence';

// ---- universe forge --------------------------------------------------------
export {
  UNIVERSE_PRESETS,
  getUniverse,
  defineUniverse,
  type Universe,
  type UniverseType,
  type UniverseConstants,
} from './universe/universe';

// ---- world state -----------------------------------------------------------
export {
  createEarthState,
  createWorld,
  createSun,
  createEarth,
  cloneState,
} from './state/factory';
export type {
  WorldState,
  WorldMeta,
  Star,
  StarType,
  Planet,
  AtmosphereComposition,
  Solvent,
  Chemistry,
  Biology,
  GeneticsSubstrate,
  Intelligence,
  Civilization,
  Risks,
} from './state/types';

// ---- chronid prime (pure world factory) ------------------------------------
export { createChronidPrime, CHRONID_COGNITIVE_RATE_HZ } from './state/chronid';

// ---- provenance ------------------------------------------------------------
export { buildProvenance, type Provenance } from './provenance/provenance';
