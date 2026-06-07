// =============================================================================
// @hsi/research-agents — chemistry agent
// Picks a viable solvent for the concept's temperature, frames metabolism
// chemistry, and assesses the replication substrate (crystal vs carbon polymer).
// Depends on planetology (for temperature). Recommends chemistry.* params.
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

type Solvent = 'water' | 'ammonia' | 'methane' | 'silicate' | 'supercriticalCO2';

/** Pick the solvent with the best viability at the given temperature. */
function bestSolvent(tempK: number, u: ReturnType<typeof getUniverse>['constants']): {
  solvent: Solvent;
  viability: number;
} {
  const candidates: Solvent[] = ['water', 'ammonia', 'methane', 'silicate', 'supercriticalCO2'];
  let best: Solvent = 'water';
  let bestV = -1;
  for (const c of candidates) {
    const v = formulas.solventViability(c, tempK, u);
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return { solvent: best, viability: bestV };
}

export const chemistryAgent: Agent = {
  domain: 'chemistry',
  dependencies: ['planetology'],
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput {
    const s = concept.extracted;
    const cb = new ClaimBuilder('chemistry');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};
    const planet = context.prior.get('planetology');
    const universeType = (planet?.recommendedParameters['universeType'] as string) ?? 'standard-physics';
    const u = getUniverse(universeType as Parameters<typeof getUniverse>[0]).constants;
    const tempK =
      (planet?.recommendedParameters['planet.temperatureK'] as number) ??
      (s.frozen ? 120 : 288);

    // --- solvent --------------------------------------------------------------
    const { solvent, viability } = bestSolvent(tempK, u);
    recommendedParameters['chemistry.solvent'] = solvent;
    const solventTier: ScientificConfidenceTier =
      solvent === 'water' ? 'known-science' : solvent === 'silicate' || solvent === 'supercriticalCO2' ? 'speculative' : 'plausible-science';
    cb.add(
      `At ≈ ${round1(tempK)} K the most viable biochemical solvent is ${solvent} (liquid-band viability ≈ ${viability.toFixed(2)}).`,
      'model-inference',
      solventTier,
      { dependsOn: planet ? ['planetology.c0'] : undefined },
    );
    if (s.frozen && solvent === 'ammonia') {
      cb.add(
        'Ammonia stays liquid (~195–240 K) where water is frozen solid, making it a researched cryo-solvent for cold-world biochemistry.',
        'known-science',
        'plausible-science',
      );
    }

    // --- replication substrate ------------------------------------------------
    const substrate = s.geneticsSubstrate;
    if (substrate === 'crystal') {
      recommendedParameters['chemistry.replication'] = 'crystal lattice templating';
      recommendedParameters['biology.geneticsSubstrate'] = 'crystal';
      cb.add(
        'Replication via crystal-lattice templating (Cairns-Smith clay/mineral-genome hypothesis): defects propagate as heritable information.',
        'speculative-assumption',
        'speculative',
        { dependsOn: ['user-input'] },
      );
    } else if (substrate === 'silicon') {
      recommendedParameters['chemistry.replication'] = 'silicate polymer templating';
      recommendedParameters['biology.geneticsSubstrate'] = 'crystal';
      cb.add(
        'Silicon/silicate-based information storage is imaginable but lacks the redox versatility and bond lability carbon offers at habitable temperatures.',
        'speculative-assumption',
        'speculative',
        { dependsOn: ['user-input'] },
      );
    } else {
      recommendedParameters['chemistry.replication'] = 'template polymer (DNA)';
      recommendedParameters['biology.geneticsSubstrate'] = 'DNA';
      cb.add(
        'Carbon template-polymer replication (DNA/RNA analog) is the most thermodynamically supported information substrate.',
        'known-science',
        'known-science',
      );
    }

    // --- metabolism -----------------------------------------------------------
    const metabolismDesc =
      s.frozen && substrate === 'crystal'
        ? 'cryogenic mineral redox'
        : s.frozen
          ? 'low-temperature ammonia-mediated redox'
          : 'aerobic carbon';
    recommendedParameters['chemistry.metabolism'] = metabolismDesc;
    const stability = round1(formulas.solventViability(solvent, tempK, u) * (substrate === 'crystal' ? 0.85 : 1));
    recommendedParameters['chemistry.stabilityIndex'] = round1(Math.max(0.3, stability));
    cb.add(
      `Metabolism framed as "${metabolismDesc}"; reaction rates fall ~exponentially with temperature (Arrhenius), so cold worlds imply intrinsically slow chemistry.`,
      'model-inference',
      'known-science',
    );
    if (s.frozen) {
      cb.add(
        'Arrhenius slowdown at cryogenic temperatures is consistent with — and a likely CAUSE of — an ultra-slow metabolism and long subjective time.',
        'model-inference',
        'plausible-science',
      );
    }

    return finalize({
      domain: 'chemistry',
      title: 'Solvent, metabolism & replication chemistry',
      summary: `${solvent[0].toUpperCase() + solvent.slice(1)} as solvent at ${round1(tempK)} K, ${metabolismDesc} metabolism, ${recommendedParameters['chemistry.replication']} as the replication substrate.`,
      assumptions: [
        'Solvent must remain liquid at mean surface temperature.',
        'Crystal genetics treated as an explicit speculative assumption, not established chemistry.',
      ],
      equations: [
        eq('Arrhenius rate', 'k = A·e^(−Ea/RT)', 'Reaction rate drops exponentially as temperature falls — cold worlds are slow.'),
        eq('Solvent viability', 'V = gaussian(T; band_center, band_width)', 'How well a solvent stays liquid at the surface temperature.'),
      ],
      citations: [
        placeholder('chem-1', 'Cairns-Smith mineral-genome hypothesis (placeholder)'),
        placeholder('chem-2', 'Ammonia-solvent astrobiology (placeholder)'),
      ],
      dependencies: ['planetology'],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });
  },
};
