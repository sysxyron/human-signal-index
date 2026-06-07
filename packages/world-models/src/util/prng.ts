// =============================================================================
// @hsi/simulation-engine — seeded PRNG
// Deterministic stochastic helper. Pure compute functions must NOT call
// Math.random() / Date.now(); they accept a seed and use this generator so
// every simulation run is reproducible and auditable.
//
// Algorithm: mulberry32 — a fast, well-distributed 32-bit PRNG. Good enough for
// jitter / sampling in a science toy; not cryptographic.
// =============================================================================

/** A deterministic random source produced from a numeric seed. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Standard-normal-ish sample (Box-Muller), mean 0 sd 1. */
  gaussian(): number;
}

/** Create a deterministic Rng from a 32-bit integer seed. */
export function createRng(seed: number): Rng {
  // Normalize seed to a uint32.
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    gaussian: () => {
      // Box-Muller transform from two uniforms.
      const u1 = Math.max(next(), 1e-12);
      const u2 = next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

/** Hash an arbitrary string into a 32-bit seed (FNV-1a). Useful for seeding from ids. */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
