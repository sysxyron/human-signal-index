// =============================================================================
// @hsi/research-agents — planetology agent
// Determines planet class, host star, orbit, temperature, atmosphere, and
// habitable-zone position. Cites stellar/planetary formulas and recommends
// star.* and planet.* WorldState params. Depends on physics.
// =============================================================================

import { getUniverse } from '@hsi/world-models';
import { formulas } from '@hsi/simulation-engine';
import type {
  Agent,
  AgentContext,
  AgentOutput,
  ResearchConcept,
  ScientificConfidenceTier,
} from '../types';
import { ClaimBuilder, eq, finalize, placeholder, round1 } from './helpers';

/** Approximate luminosity for a spectral type (solar units). */
const STAR_LUMINOSITY: Record<string, number> = {
  O: 100000,
  B: 1000,
  A: 20,
  F: 4,
  G: 1,
  K: 0.3,
  M: 0.04,
  whiteDwarf: 0.001,
  redGiant: 1000,
  neutron: 0.0001,
};

const STAR_TEMP: Record<string, number> = {
  O: 35000,
  B: 18000,
  A: 9000,
  F: 6500,
  G: 5772,
  K: 4500,
  M: 3400,
  whiteDwarf: 10000,
  redGiant: 3500,
  neutron: 600000,
};

export const planetologyAgent: Agent = {
  domain: 'planetology',
  dependencies: ['physics'],
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput {
    const s = concept.extracted;
    const cb = new ClaimBuilder('planetology');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};
    const physics = context.prior.get('physics');
    const universeType =
      (physics?.recommendedParameters['universeType'] as string) ??
      (s.superEarth || (s.gravityG ?? 1) >= 2 ? 'high-gravity' : 'standard-physics');
    const u = getUniverse(universeType as Parameters<typeof getUniverse>[0]).constants;

    // --- host star ------------------------------------------------------------
    const starType = s.starType ?? (s.frozen ? 'M' : 'G');
    const luminosity = STAR_LUMINOSITY[starType] ?? 1;
    const starTemp = STAR_TEMP[starType] ?? 5772;
    recommendedParameters['star.type'] = starType;
    recommendedParameters['star.luminositySolar'] = luminosity;
    recommendedParameters['star.temperatureK'] = starTemp;

    const starTier: ScientificConfidenceTier = 'known-science';
    cb.add(
      `Host star modeled as spectral type ${starType} (L ≈ ${luminosity} L☉, T ≈ ${starTemp} K).`,
      s.starType ? 'user-input' : 'model-inference',
      starTier,
      s.starType ? { dependsOn: ['user-input'] } : undefined,
    );

    const hz = formulas.habitableZoneAU(luminosity);
    recommendedParameters['star.habitableZoneInnerAU'] = round1(hz.inner);
    recommendedParameters['star.habitableZoneOuterAU'] = round1(hz.outer);
    cb.add(
      `Habitable zone ≈ ${hz.inner.toFixed(2)}–${hz.outer.toFixed(2)} AU from flux ∝ L/d² (HZ ∝ √L).`,
      'model-inference',
      'known-science',
      { dependsOn: ['planetology.c0'] },
    );

    // --- planet class ---------------------------------------------------------
    const radiusEarth = s.superEarth ? 1.6 : 1;
    const massEarth =
      (physics?.recommendedParameters['planet.massEarth'] as number) ??
      (s.superEarth ? 4.5 : 1);
    recommendedParameters['planet.radiusEarth'] = radiusEarth;
    recommendedParameters['planet.massEarth'] = massEarth;
    if (s.superEarth) {
      cb.add(
        'Planet class: super-Earth (≈4–5 M⊕, ≈1.6 R⊕), giving elevated surface gravity and a deep, well-retained atmosphere.',
        'user-input',
        'known-science',
        { dependsOn: ['user-input'] },
      );
    } else {
      cb.add('Planet class: terrestrial, Earth-mass reference.', 'model-inference', 'known-science');
    }

    // --- temperature & orbit --------------------------------------------------
    // Frozen worlds sit beyond/at the cold edge; otherwise center the HZ.
    const orbitAU = s.frozen ? round1(hz.outer * 1.15) : round1((hz.inner + hz.outer) / 2);
    recommendedParameters['planet.orbitAU'] = orbitAU;
    const albedo = s.frozen ? 0.6 : 0.306;
    const pressure = s.superEarth ? 12 : 1;
    recommendedParameters['planet.albedo'] = albedo;
    recommendedParameters['planet.atmospherePressureAtm'] = pressure;
    const tempK = round1(formulas.equilibriumTemperatureK(luminosity, orbitAU, albedo, pressure));
    recommendedParameters['planet.temperatureK'] = tempK;

    cb.add(
      `Mean surface temperature ≈ ${tempK} K from T_eq = 278.5·((1−albedo)·L)^¼/√d plus a pressure-driven greenhouse term.`,
      'model-inference',
      'known-science',
      { dependsOn: ['planetology.c0'] },
    );
    if (s.frozen) {
      cb.add(
        `World is frozen: orbit pushed to the cold edge (${orbitAU} AU) and high ice albedo (${albedo}) keep surface ≈ ${tempK} K — well below the water freezing point.`,
        'model-inference',
        'known-science',
      );
      recommendedParameters['planet.waterCoverage'] = 0.05;
    }

    cb.add(
      `Atmospheric retention is high (escape velocity scales with gravity); a super-Earth easily holds a ${pressure}-atm atmosphere.`,
      'model-inference',
      'plausible-science',
    );

    return finalize({
      domain: 'planetology',
      title: 'Planet class, star & climate',
      summary: s.frozen
        ? `A frozen ${s.superEarth ? 'super-Earth' : 'terrestrial'} world orbiting a ${starType}-type star near the cold edge of the habitable zone, surface ≈ ${tempK} K.`
        : `A ${s.superEarth ? 'super-Earth' : 'terrestrial'} world orbiting a ${starType}-type star at ${orbitAU} AU, surface ≈ ${tempK} K.`,
      assumptions: [
        'Single dominant planet considered; moons ignored in Phase 3.',
        'Greenhouse forcing approximated from bulk pressure only.',
      ],
      equations: [
        eq('Mass–luminosity', 'L ∝ M^3.5', 'Main-sequence stellar luminosity from mass.'),
        eq('Habitable zone', 'd_HZ ∝ √L', 'Habitable-zone distance scales with the square root of luminosity.'),
        eq('Equilibrium temperature', 'T_eq = 278.5·((1−A)·L)^¼ / √d', 'Surface temperature before/with greenhouse offset.'),
      ],
      citations: [placeholder('plan-1', 'Kopparapu-style habitable zone (placeholder)')],
      dependencies: ['physics'],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });
  },
};
