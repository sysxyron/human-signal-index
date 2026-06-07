// =============================================================================
// @hsi/research-agents — biology agent
// Cell architecture, genetics-substrate plausibility, and slow-metabolism
// biology. Depends on chemistry. Recommends biology.* params.
// =============================================================================

import type { Agent, AgentContext, AgentOutput, ResearchConcept } from '../types';
import { ClaimBuilder, eq, finalize, placeholder } from './helpers';

export const biologyAgent: Agent = {
  domain: 'biology',
  dependencies: ['chemistry'],
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput {
    const s = concept.extracted;
    const cb = new ClaimBuilder('biology');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};
    const chem = context.prior.get('chemistry');
    const substrate =
      (chem?.recommendedParameters['biology.geneticsSubstrate'] as string) ??
      (s.geneticsSubstrate === 'crystal' || s.geneticsSubstrate === 'silicon' ? 'crystal' : 'DNA');

    recommendedParameters['biology.geneticsSubstrate'] = substrate;

    // --- cell structure -------------------------------------------------------
    const cryo = s.frozen === true;
    const cellStructure =
      substrate === 'crystal'
        ? 'silicate-mineral aggregate (non-cellular lattice colony)'
        : 'membrane-bound eukaryote';
    recommendedParameters['biology.cellStructure'] = cellStructure;
    cb.add(
      substrate === 'crystal'
        ? 'Body plan is a growing mineral/silicate aggregate rather than a soft membrane-bound cell — structure and information are the same lattice.'
        : 'Standard membrane-bound cellular architecture with template-polymer genetics.',
      substrate === 'crystal' ? 'prior-agent' : 'known-science',
      substrate === 'crystal' ? 'speculative' : 'known-science',
      { dependsOn: chem ? ['chemistry.c1'] : undefined },
    );

    // --- genetics plausibility ------------------------------------------------
    if (substrate === 'crystal') {
      cb.add(
        'Crystal genetics can in principle store and copy information via lattice defects, but mutation/repair fidelity and the achievable information density are unverified.',
        'speculative-assumption',
        'speculative',
      );
      recommendedParameters['biology.complexityIndex'] = 0.6;
    } else {
      cb.add(
        'Template-polymer genetics support high information density and proofreading, enabling complex multicellular life.',
        'known-science',
        'known-science',
      );
      recommendedParameters['biology.complexityIndex'] = 0.85;
    }

    // --- slow-metabolism biology ----------------------------------------------
    const rate = s.metabolismRate ?? (cryo ? 'ultra-slow' : 'normal');
    recommendedParameters['biology.metabolismRate'] = rate;
    const evoRate = rate === 'ultra-slow' ? 0.08 : rate === 'slow' ? 0.2 : rate === 'fast' ? 0.8 : 0.5;
    recommendedParameters['biology.evolutionRate'] = evoRate;
    cb.add(
      `Metabolic pace is "${rate}" → evolutionRate ≈ ${evoRate} (Earth baseline 0.5). Slow chemistry means slow growth, slow signalling, and long generation times.`,
      'model-inference',
      cryo ? 'plausible-science' : 'known-science',
    );
    if (rate === 'ultra-slow') {
      cb.add(
        'An ultra-slow metabolism makes a vastly long subjective day biologically coherent: if internal processes run ~10^? times slower, a "day" of experience spans many Earth years.',
        'model-inference',
        'plausible-science',
        { dependsOn: ['user-input'] },
      );
      recommendedParameters['biology.biomes'] = 'ice plains, mineral spires, subglacial brine';
    }

    return finalize({
      domain: 'biology',
      title: 'Cell architecture, genetics & metabolic biology',
      summary:
        substrate === 'crystal'
          ? `A non-cellular silicate-mineral organism with crystal genetics and an ${rate} metabolism — coherent but speculative.`
          : `Membrane-bound carbon life with template-polymer genetics and an ${rate} metabolism.`,
      assumptions: [
        'Biological complexity is gated by genetic fidelity and available time.',
        'Subjective-time scaling is assumed to arise from metabolic pace, not relativity.',
      ],
      equations: [
        eq(
          'Metabolic scaling',
          'B ∝ M^¾',
          'Kleiber-like allometric metabolic scaling; sets baseline pace from body mass.',
          'plausible-science',
        ),
      ],
      citations: [placeholder('bio-1', 'Crystal/mineral genetics plausibility (placeholder)')],
      dependencies: ['chemistry'],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });
  },
};
