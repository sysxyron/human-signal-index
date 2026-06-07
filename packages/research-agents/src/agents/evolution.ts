// =============================================================================
// @hsi/research-agents — evolution agent
// Evolutionary timescales given the environment + metabolism; mutation and
// selection rates. Depends on biology. Recommends biology.evolutionRate refinement
// and emits a time-to-complexity estimate.
// =============================================================================

import { formulas } from '@hsi/simulation-engine';
import type { Agent, AgentContext, AgentOutput, ResearchConcept } from '../types';
import { ClaimBuilder, eq, finalize, placeholder, round1 } from './helpers';

export const evolutionAgent: Agent = {
  domain: 'evolution',
  dependencies: ['biology'],
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput {
    const s = concept.extracted;
    const cb = new ClaimBuilder('evolution');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};
    const bio = context.prior.get('biology');
    const evoRate = (bio?.recommendedParameters['biology.evolutionRate'] as number) ?? 0.5;
    const substrate = (bio?.recommendedParameters['biology.geneticsSubstrate'] as string) ?? 'DNA';

    // Time available — frozen long-lived worlds get many Gyr.
    const ageGyr = s.frozen ? 8.5 : 4.5;
    recommendedParameters['planet.ageGyr'] = ageGyr;

    // Realized complexity over deep time, using the engine's formula.
    const lifePlausibility = substrate === 'crystal' ? 0.45 : 0.8;
    const complexity = round1(formulas.realizedComplexity(lifePlausibility, evoRate, ageGyr));
    recommendedParameters['biology.complexityIndex'] = complexity;

    cb.add(
      `With evolutionRate ≈ ${evoRate} over ≈ ${ageGyr} Gyr, realized biological complexity ≈ ${complexity} (engine: complexity = f(lifePlausibility, evoRate, log-age)).`,
      'model-inference',
      'plausible-science',
      { dependsOn: bio ? ['biology.c2'] : undefined },
    );

    // A slow clock means evolution needs MORE wall-clock time per adaptive step,
    // but a long-lived world supplies it.
    if (evoRate <= 0.1) {
      cb.add(
        'An ultra-slow metabolism lowers the mutation-and-selection clock rate; reaching complex, intelligent life therefore requires billions of years — which a long-lived red-dwarf system provides.',
        'model-inference',
        'plausible-science',
      );
      cb.add(
        'Slow generations also mean fewer total selective events, so adaptive innovation is rare but each lineage is extremely well-optimized to a stable, glacial environment.',
        'speculative-assumption',
        'speculative',
      );
    } else {
      cb.add(
        'Earth-like mutation and selection rates produce complex life within a few billion years given a stable habitable surface.',
        'known-science',
        'known-science',
      );
    }

    cb.add(
      'Selection pressure tracks environmental change rate: a slowly-changing frozen world selects for endurance and stability over rapid behavioral plasticity.',
      'model-inference',
      'plausible-science',
    );

    return finalize({
      domain: 'evolution',
      title: 'Evolutionary timescales & rates',
      summary:
        evoRate <= 0.1
          ? `Glacially slow evolution over ${ageGyr} Gyr yields complexity ≈ ${complexity}; rare innovation, deep optimization to a stable niche.`
          : `Earth-like evolutionary rates over ${ageGyr} Gyr yield complexity ≈ ${complexity}.`,
      assumptions: [
        'Sufficient stellar lifetime to supply the required wall-clock evolutionary time.',
        'Mutation supply scales with metabolic/generation clock.',
      ],
      equations: [
        eq(
          'Realized complexity',
          'C = lifePlausibility · (0.4 + 0.6·evoRate) · log-age',
          'Complexity accumulates with evolution rate and available time (engine formula).',
          'plausible-science',
        ),
        eq(
          'Mutation supply',
          'U ≈ μ · N · generations',
          'Total adaptive variation scales with mutation rate, population, and number of generations.',
          'known-science',
        ),
      ],
      citations: [placeholder('evo-1', 'Molecular-clock & deep-time evolution (placeholder)')],
      dependencies: ['biology'],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });
  },
};
