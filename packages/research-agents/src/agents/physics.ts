// =============================================================================
// @hsi/research-agents — physics agent
// Frames the physical regime of the concept: gravity, energy, time. Cites real
// constants/relations (formulas) and recommends WorldState star/planet params.
// =============================================================================

import { getUniverse } from '@hsi/world-models';
import { formulas } from '@hsi/simulation-engine';
import type { Agent, AgentContext, AgentOutput, ResearchConcept } from '../types';
import { ClaimBuilder, eq, finalize, placeholder, round1 } from './helpers';

export const physicsAgent: Agent = {
  domain: 'physics',
  dependencies: [],
  analyze(concept: ResearchConcept): AgentOutput {
    const s = concept.extracted;
    const cb = new ClaimBuilder('physics');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};

    const highGravity = (s.gravityG ?? 1) >= 2 || s.superEarth === true;
    const universeType = highGravity ? 'high-gravity' : 'standard-physics';
    const u = getUniverse(universeType).constants;
    recommendedParameters['universeType'] = universeType;

    cb.add(
      'Newtonian gravity and special relativity govern this world; no faster-than-light or perpetual-motion mechanism is assumed.',
      'known-science',
      'known-science',
    );

    // Gravity framing.
    if (s.gravityG !== undefined) {
      cb.add(
        `User specifies surface gravity ≈ ${s.gravityG}g.`,
        'user-input',
        'known-science',
        { dependsOn: ['user-input'] },
      );
      recommendedParameters['planet.gravityG'] = round1(s.gravityG);
      // Reverse-derive a plausible mass for a 1.6 R⊕ super-Earth: g = M/R².
      const radiusEarth = s.superEarth ? 1.6 : 1;
      const massEarth = round1(s.gravityG * radiusEarth * radiusEarth);
      recommendedParameters['planet.massEarth'] = massEarth;
      recommendedParameters['planet.radiusEarth'] = radiusEarth;
      const esc = formulas.escapeVelocityKmS(s.gravityG, radiusEarth, u);
      cb.add(
        `Escape velocity ≈ ${esc.toFixed(1)} km/s from v_esc = 11.2·√(g·R)·⁴√(G_mult), implying strong atmospheric retention.`,
        'model-inference',
        'known-science',
      );
    } else {
      recommendedParameters['planet.gravityG'] = 1;
    }

    // Time framing — subjective time is biological, not relativistic, unless stated.
    if (s.subjectiveDayYears !== undefined) {
      cb.add(
        `A subjective day ≈ ${s.subjectiveDayYears} Earth years is a COGNITIVE/biological time-scaling, not relativistic time dilation; at non-relativistic speeds proper time tracks coordinate time.`,
        'model-inference',
        'plausible-science',
      );
      cb.add(
        'Achieving such slow subjective time via gravitational/velocity time dilation would require near-event-horizon or near-c regimes inconsistent with a habitable surface.',
        'known-science',
        'known-science',
      );
    }

    const eqs = [
      eq('Surface gravity', 'g = G·M / R²', 'Gravity scales with mass and inversely with radius squared.'),
      eq('Escape velocity', 'v_esc = √(2·g·R)', 'Threshold speed to leave the gravity well; sets atmospheric retention.'),
      eq(
        'Gravitational time dilation',
        'dτ/dt = √(1 − 2GM/rc²)',
        'Proper time slows only near compact masses — not a mechanism for habitable-surface slow cognition.',
      ),
    ];

    return finalize({
      domain: 'physics',
      title: 'Physical regime & constants',
      summary: highGravity
        ? 'A high-gravity regime: heavier worlds, higher escape velocity, thicker retained atmospheres. Subjective slow time is biological, not relativistic.'
        : 'A standard-physics regime. Subjective time scaling (if any) is cognitive/biological rather than relativistic.',
      assumptions: [
        'Constants follow the selected universe preset; no exotic matter.',
        'Subjective time refers to perception/metabolism, not coordinate time.',
      ],
      equations: eqs,
      citations: [placeholder('phys-1', 'Standard gravitation & relativity (placeholder)')],
      dependencies: [],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });
  },
};
