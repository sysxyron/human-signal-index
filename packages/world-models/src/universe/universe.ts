// =============================================================================
// @hsi/simulation-engine — Universe Forge
// A Universe defines multipliers on physical constants. The SAME WorldState run
// under a different Universe produces different derived values, because the
// graph compute functions read these multipliers. This is how "alternative
// constants" / "high gravity" universes change outcomes without editing the world.
// =============================================================================

import {
  scientificConfidence,
  type ScientificConfidence,
} from '../scientific-confidence';

/** Catalogue of universe presets. */
export type UniverseType =
  | 'standard-physics'
  | 'alternative-constants'
  | 'high-gravity'
  | 'low-entropy'
  | 'exotic-matter'
  | 'user-defined';

/**
 * Dimensionless multipliers applied to baseline (our-universe) constants.
 * 1.0 === identical to our universe. Compute functions multiply by these.
 */
export interface UniverseConstants {
  /** Gravitational constant multiplier (affects gravity, escape velocity). */
  gravity: number;
  /** Speed-of-light multiplier (affects energy ceilings, tech limits). */
  lightSpeed: number;
  /** Fine-structure-ish chemistry multiplier (bond strength, reaction rates). */
  fineStructure: number;
  /**
   * Entropy / time-arrow factor. <1 = slower entropy growth (order persists),
   * >1 = faster decay. Affects stability, lifetimes, evolution rate.
   */
  entropyRate: number;
  /** Stellar fusion efficiency multiplier (affects luminosity & lifetime). */
  fusionEfficiency: number;
}

/** A fully described universe. */
export interface Universe {
  type: UniverseType;
  name: string;
  description: string;
  constants: UniverseConstants;
  scientificConfidence: ScientificConfidence;
}

const STANDARD: UniverseConstants = {
  gravity: 1,
  lightSpeed: 1,
  fineStructure: 1,
  entropyRate: 1,
  fusionEfficiency: 1,
};

/** All built-in universe presets keyed by type. */
export const UNIVERSE_PRESETS: Record<UniverseType, Universe> = {
  'standard-physics': {
    type: 'standard-physics',
    name: 'Standard Physics',
    description: 'Our universe. All constants at their measured values.',
    constants: { ...STANDARD },
    scientificConfidence: scientificConfidence(
      'known-science',
      'Constants match observed values in our universe.',
    ),
  },
  'alternative-constants': {
    type: 'alternative-constants',
    name: 'Alternative Constants',
    description:
      'Fine-structure and fusion tuned away from our values — chemistry and stars behave differently.',
    constants: { ...STANDARD, fineStructure: 1.4, fusionEfficiency: 0.8 },
    scientificConfidence: scientificConfidence(
      'speculative',
      'Tuning fundamental constants is a thought experiment, not observed.',
    ),
  },
  'high-gravity': {
    type: 'high-gravity',
    name: 'High-Gravity Universe',
    description: 'Gravitational coupling stronger — heavier worlds, faster collapse, denser life.',
    constants: { ...STANDARD, gravity: 2.5, entropyRate: 1.1 },
    scientificConfidence: scientificConfidence(
      'speculative',
      'A stronger gravitational constant is hypothetical.',
    ),
  },
  'low-entropy': {
    type: 'low-entropy',
    name: 'Low-Entropy Universe',
    description:
      'Time arrow weakened — order persists, stars and civilizations last far longer.',
    constants: { ...STANDARD, entropyRate: 0.35 },
    scientificConfidence: scientificConfidence(
      'speculative',
      'Reducing the entropy growth rate is a speculative cosmological setting.',
    ),
  },
  'exotic-matter': {
    type: 'exotic-matter',
    name: 'Exotic-Matter Universe',
    description:
      'Negative-pressure / exotic matter permitted — enables structures impossible here.',
    constants: { ...STANDARD, gravity: 0.6, fineStructure: 1.2, lightSpeed: 1.5 },
    scientificConfidence: scientificConfidence(
      'violates-known-physics',
      'Stable exotic matter at scale is inconsistent with known energy conditions.',
    ),
  },
  'user-defined': {
    type: 'user-defined',
    name: 'User Defined',
    description: 'Custom constants supplied by the operator.',
    constants: { ...STANDARD },
    scientificConfidence: scientificConfidence(
      'speculative',
      'Operator-defined constants; confidence depends on chosen values.',
    ),
  },
};

/** Get a universe preset (defaults to standard-physics). */
export function getUniverse(type: UniverseType = 'standard-physics'): Universe {
  return UNIVERSE_PRESETS[type] ?? UNIVERSE_PRESETS['standard-physics'];
}

/** Build a user-defined universe from partial constant overrides. */
export function defineUniverse(
  name: string,
  description: string,
  overrides: Partial<UniverseConstants>,
): Universe {
  return {
    type: 'user-defined',
    name,
    description,
    constants: { ...STANDARD, ...overrides },
    scientificConfidence: scientificConfidence(
      'speculative',
      'Operator-defined universe constants.',
    ),
  };
}
