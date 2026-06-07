// =============================================================================
// @hsi/simulation-engine — scientific formulas
// Real (order-of-magnitude) physical relations expressed in Earth/solar units so
// Earth inputs reproduce Earth outputs. Each function notes the relation it
// encodes. Universe constant multipliers are applied where physically relevant.
// =============================================================================

import { clamp, clamp01, gaussianBand, remap, safeLog10, type UniverseConstants } from '@hsi/world-models';

// --- Stellar ----------------------------------------------------------------

/**
 * Stellar luminosity from mass via the mass-luminosity relation L ∝ M^3.5
 * (main sequence), scaled by the universe's fusion efficiency. Solar units.
 */
export function luminosityFromMass(massSolar: number, u: UniverseConstants): number {
  return Math.pow(Math.max(massSolar, 1e-3), 3.5) * u.fusionEfficiency;
}

/**
 * Main-sequence lifetime ∝ M / L (fuel / burn-rate). With L ∝ M^3.5 this gives
 * ~10 Gyr for the Sun and far less for massive stars. Gyr. Lower entropy rate
 * stretches lifetimes (order persists longer).
 */
export function stellarLifetimeGyr(massSolar: number, u: UniverseConstants): number {
  const L = luminosityFromMass(massSolar, u);
  const base = 10 * (massSolar / L); // 10 Gyr solar anchor
  return base / u.entropyRate;
}

/**
 * Habitable-zone edges scale with sqrt(L) (flux ∝ L / d²). AU. Returns inner
 * and outer using conservative solar anchors (0.95 / 1.67 AU at L=1).
 */
export function habitableZoneAU(luminositySolar: number): {
  inner: number;
  outer: number;
} {
  const root = Math.sqrt(Math.max(luminositySolar, 1e-6));
  return { inner: 0.95 * root, outer: 1.67 * root };
}

/** Normalized stellar radiation index from temperature & luminosity (0..1). */
export function radiationIndex(temperatureK: number, luminositySolar: number): number {
  // Hotter, brighter stars emit harder & more radiation. Anchor Sun ≈ 0.25.
  const tTerm = temperatureK / 5772;
  return clamp01(0.25 * tTerm * Math.sqrt(Math.max(luminositySolar, 1e-6)));
}

// --- Planetary physics ------------------------------------------------------

/**
 * Surface gravity in g from mass & radius: g ∝ M / R² (in Earth units), scaled
 * by the universe gravity multiplier.
 */
export function surfaceGravityG(
  massEarth: number,
  radiusEarth: number,
  u: UniverseConstants,
): number {
  const r = Math.max(radiusEarth, 1e-3);
  return (massEarth / (r * r)) * u.gravity;
}

/**
 * Escape velocity in km/s: v_esc = sqrt(2 g R). In Earth units, with Earth's
 * 11.2 km/s anchor: v ∝ sqrt(g·R) → 11.2·sqrt(gravityG·radiusEarth).
 */
export function escapeVelocityKmS(
  gravityG: number,
  radiusEarth: number,
  u: UniverseConstants,
): number {
  return 11.2 * Math.sqrt(Math.max(gravityG * radiusEarth, 0) * Math.sqrt(u.gravity));
}

/**
 * Planetary equilibrium temperature, kelvin:
 *   T_eq = 278.5 · ((1 - albedo)·L)^0.25 / sqrt(d_AU)
 * 278.5 K is the standard solar anchor. A simple greenhouse offset is added
 * from atmospheric pressure (CO2/H2O proxy).
 */
export function equilibriumTemperatureK(
  luminositySolar: number,
  orbitAU: number,
  albedo: number,
  pressureAtm: number,
): number {
  const d = Math.max(orbitAU, 1e-3);
  const Teq =
    278.5 * Math.pow((1 - clamp01(albedo)) * Math.max(luminositySolar, 1e-6), 0.25) / Math.sqrt(d);
  // Greenhouse warming saturates with pressure. Tuned so Earth (albedo 0.306,
  // 1 atm) lands at ~288 K: bare T_eq ≈ 255 K, greenhouse ≈ +33 K.
  const greenhouse = 64 * (1 - Math.exp(-clamp(pressureAtm, 0, 200) / 1.3));
  return Teq + greenhouse;
}

/**
 * Atmospheric retention (0..1): heavy gases are retained when escape velocity
 * greatly exceeds thermal velocity. Jeans-escape intuition: retention rises with
 * v_esc and falls with temperature. Anchored so Earth (11.2 km/s, 288 K) ≈ 0.9.
 */
export function atmosphericRetention(escapeVelocityKmS: number, temperatureK: number): number {
  // Thermal speed proxy ∝ sqrt(T). Ratio of escape to thermal drives retention.
  const thermal = Math.sqrt(Math.max(temperatureK, 1)) * 0.66; // tuned anchor
  const ratio = escapeVelocityKmS / thermal;
  // Logistic in the ratio; Earth ratio ≈ 1.0 maps near 0.9.
  return clamp01(1 / (1 + Math.exp(-3.2 * (ratio - 0.3))));
}

/**
 * Effective atmospheric density/pressure given a base pressure modulated by how
 * much of it is actually retained. Returns atm.
 */
export function effectiveAtmosphereAtm(
  basePressureAtm: number,
  retention: number,
): number {
  return Math.max(0, basePressureAtm) * clamp01(retention);
}

/**
 * Magnetosphere protection (0..1): a dynamo needs mass (heat) and rotation; we
 * proxy from planetary mass and stellar radiation (it must out-compete stripping).
 */
export function magnetosphereProtection(
  declaredStrength: number,
  massEarth: number,
  stellarRadiation: number,
): number {
  const dynamo = clamp01(declaredStrength * (0.5 + 0.5 * clamp01(massEarth / 1.5)));
  // Net protection is the field strength discounted by incident radiation.
  return clamp01(dynamo * (1 - 0.5 * clamp01(stellarRadiation)));
}

// --- Habitability / chemistry ----------------------------------------------

/** Oxygen fraction lookup helper for atmosphere maps. */
export function gasFraction(comp: Record<string, number>, gas: string): number {
  return clamp01(comp[gas] ?? 0);
}

/**
 * Solvent viability (0..1): how well the chosen solvent stays liquid at the
 * planet's temperature. Each solvent has a liquid band; we score with a gaussian
 * around the band center. Fine-structure tweaks bond strength → band width.
 */
export function solventViability(
  solvent: string,
  temperatureK: number,
  u: UniverseConstants,
): number {
  // [centerK, sigmaK] liquid ranges (approx, 1 atm).
  const bands: Record<string, [number, number]> = {
    water: [310, 45], // ~273-373 K
    ammonia: [210, 35], // ~195-240 K
    methane: [100, 18], // ~91-112 K
    silicate: [1800, 350], // molten rock
    supercriticalCO2: [320, 60], // needs high pressure too
  };
  const [center, sigma] = bands[solvent] ?? [300, 50];
  // Stronger chemistry (higher fine-structure) widens the usable band slightly.
  return gaussianBand(temperatureK, center, sigma * (0.85 + 0.15 * u.fineStructure));
}

/**
 * Habitability index (0..1): blend of being in the habitable zone, having a
 * viable solvent, retained atmosphere, magnetosphere protection, and water
 * coverage. This is the headline "can life persist here" score.
 */
export function habitabilityIndex(args: {
  inHZ: number; // 0..1 how centrally in the habitable zone
  solventViability: number;
  atmosphereRetention: number;
  magnetosphere: number;
  waterCoverage: number;
  gravityG: number;
}): number {
  const gravityComfort = gaussianBand(args.gravityG, 1.0, 1.4); // life tolerates a range
  return clamp01(
    0.28 * args.inHZ +
      0.24 * args.solventViability +
      0.18 * args.atmosphereRetention +
      0.12 * args.magnetosphere +
      0.1 * args.waterCoverage +
      0.08 * gravityComfort,
  );
}

/**
 * 0..1 habitable-zone membership. Full credit anywhere comfortably inside the
 * zone, with a smooth fall-off across a margin just outside each edge (so Earth,
 * which sits near the conservative inner edge, still scores ~1). 0 well outside.
 */
export function habitableZonePosition(orbitAU: number, inner: number, outer: number): number {
  if (outer <= inner) return 0;
  const margin = 0.15 * (outer - inner); // soft edge band
  if (orbitAU >= inner && orbitAU <= outer) return 1;
  if (orbitAU < inner) return clamp01(1 - (inner - orbitAU) / margin);
  return clamp01(1 - (orbitAU - outer) / margin);
}

// --- Biology / intelligence / civilization ---------------------------------

/**
 * Life-plausibility (0..1): habitability gated by chemistry stability and the
 * entropy/time-arrow of the universe (faster decay → harder for life to form).
 */
export function lifePlausibility(
  habitability: number,
  chemistryStability: number,
  u: UniverseConstants,
): number {
  const entropyPenalty = clamp01(1 / u.entropyRate); // low entropy helps
  return clamp01(habitability * (0.5 + 0.5 * chemistryStability) * (0.6 + 0.4 * entropyPenalty));
}

/**
 * Realized biological complexity (0..1): grows with available time (planet age)
 * and evolutionRate, gated by life plausibility. Log-scaled in age (eons matter
 * less linearly than the first billion years did).
 */
export function realizedComplexity(
  lifePlausibility: number,
  evolutionRate: number,
  ageGyr: number,
): number {
  const timeFactor = clamp01(safeLog10(Math.max(ageGyr, 0.01) + 1) / safeLog10(11)); // ~10 Gyr ceiling
  return clamp01(lifePlausibility * (0.4 + 0.6 * evolutionRate) * timeFactor);
}

/**
 * Intelligence plausibility (0..1): emerges from sustained complexity and a
 * cognitive substrate. The cognitiveRateHz itself is NOT required to be fast —
 * even glacial cognition counts as intelligence if present.
 */
export function intelligencePlausibility(
  complexity: number,
  problemSolvingIndex: number,
): number {
  // Needs high complexity; problem-solving lifts it further.
  return clamp01(Math.pow(complexity, 1.3) * (0.5 + 0.5 * problemSolvingIndex));
}

/**
 * Civilization / technology gating (0..1): a Kardashev-ish technology ceiling
 * gated by intelligence, mathematics, and risk-management. You cannot have high
 * tech without the cognition and formal tools to build it.
 */
export function technologyCeiling(
  intelligence: number,
  mathematicsLevel: number,
  riskManagement: number,
): number {
  const gate = clamp01(0.5 * intelligence + 0.35 * mathematicsLevel + 0.15 * riskManagement);
  // Map to ~0..3 Kardashev-ish then normalize back to 0..1 for the node value.
  return clamp01(gate);
}

// --- Risk -------------------------------------------------------------------

/**
 * Aggregate extinction index (0..1): rises with climate instability, asteroid
 * exposure, self-destruction risk, and shrinking stellar lifetime; falls with
 * risk-management capability.
 */
export function extinctionIndex(args: {
  climateInstability: number;
  asteroidExposure: number;
  selfDestructionRisk: number;
  stellarLifetimeRemainingGyr: number;
  riskManagement: number;
}): number {
  const stellarPressure = clamp01(1 - clamp01(args.stellarLifetimeRemainingGyr / 5));
  const raw =
    0.3 * args.climateInstability +
    0.2 * args.asteroidExposure +
    0.3 * args.selfDestructionRisk +
    0.2 * stellarPressure;
  return clamp01(raw * (1 - 0.5 * clamp01(args.riskManagement)));
}

/** Remaining-lifetime risk pressure, used as a node value (0..1). */
export function stellarRiskPressure(stellarLifetimeRemainingGyr: number): number {
  return clamp01(1 - clamp01(stellarLifetimeRemainingGyr / 10));
}

/** Convenience: normalize an arbitrary positive value to 0..1 vs a reference. */
export function normalizeTo(value: number, reference: number): number {
  return clamp01(remap(value, 0, reference * 2, 0, 1));
}
