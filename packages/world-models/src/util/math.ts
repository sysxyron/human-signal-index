// =============================================================================
// @hsi/simulation-engine — math helpers
// Small pure numeric utilities shared by the compute functions. No deps.
// =============================================================================

/** Clamp x into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Clamp into [0, 1]. */
export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map x from [inMin,inMax] onto [outMin,outMax] (unclamped). */
export function remap(
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  return outMin + ((x - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** Logistic squash centered at `mid` with steepness `k`, returns 0..1. */
export function logistic(x: number, mid: number, k: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

/**
 * Gaussian "tolerance" bump: 1 at x===center, falling off with width sigma.
 * Used to score how close a value sits to an ideal band (e.g. temperature for
 * liquid water). Returns 0..1.
 */
export function gaussianBand(x: number, center: number, sigma: number): number {
  if (sigma <= 0) return x === center ? 1 : 0;
  const d = (x - center) / sigma;
  return Math.exp(-0.5 * d * d);
}

/** Safe log10 that never returns -Infinity for non-positive input. */
export function safeLog10(x: number): number {
  return Math.log10(Math.max(x, 1e-300));
}

/** Round to `n` significant figures (for tidy display values). */
export function sigFigs(x: number, n: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const d = Math.ceil(safeLog10(Math.abs(x)));
  const power = n - d;
  const mag = Math.pow(10, power);
  return Math.round(x * mag) / mag;
}
