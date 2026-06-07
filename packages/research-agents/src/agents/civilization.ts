// =============================================================================
// @hsi/research-agents — civilization agent
// Society & technology gated by intelligence rate + lifespan; Kardashev framing.
// Depends on intelligence. Recommends civilization.* params.
// =============================================================================

import { formulas } from '@hsi/simulation-engine';
import type { Agent, AgentContext, AgentOutput, ResearchConcept } from '../types';
import { ClaimBuilder, eq, finalize, placeholder, round1 } from './helpers';

export const civilizationAgent: Agent = {
  domain: 'civilization',
  dependencies: ['intelligence'],
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput {
    const s = concept.extracted;
    const cb = new ClaimBuilder('civilization');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};
    const intel = context.prior.get('intelligence');
    const cogRate = (intel?.recommendedParameters['intelligence.cognitiveRateHz'] as number) ?? 20;
    const problemSolving = (intel?.recommendedParameters['intelligence.problemSolvingIndex'] as number) ?? 0.8;

    recommendedParameters['civilization.present'] = true;

    const slow = cogRate < 1e-6;
    const longLived = (s.lifespanYears ?? 0) >= 1e6;

    // Technology ceiling from the engine, using high math + given problem solving.
    const mathLevel = 0.9;
    const riskMgmt = longLived ? 0.8 : 0.45;
    const techCeiling = round1(formulas.technologyCeiling(problemSolving, mathLevel, riskMgmt));
    // Kardashev-ish technology level: capped lower for slow minds (fewer cycles).
    const techLevel = slow ? Math.min(techCeiling, 0.6) : Math.min(techCeiling, 0.73);
    recommendedParameters['civilization.mathematicsLevel'] = mathLevel;
    recommendedParameters['civilization.technologyLevel'] = techLevel;
    recommendedParameters['civilization.riskManagementIndex'] = riskMgmt;

    cb.add(
      `Technology ceiling ≈ ${techCeiling} (gate of intelligence, mathematics, risk-management); realized technologyLevel ≈ ${techLevel} (≈Kardashev ${techLevel.toFixed(2)}).`,
      'model-inference',
      'plausible-science',
      { dependsOn: intel ? ['intelligence.c2'] : undefined },
    );

    if (slow) {
      cb.add(
        'A glacial cognitive rate means each technological iteration takes millennia of wall-clock time; progress is real but unfolds over geological timescales.',
        'model-inference',
        'plausible-science',
      );
      recommendedParameters['civilization.society'] = 'monolithic geological collective';
      recommendedParameters['civilization.laws'] = 'crystalline covenant (changes over millennia)';
      recommendedParameters['civilization.populationOrders'] = 6;
      cb.add(
        'Society is a small, durable, monolithic collective whose norms ("crystalline covenant") change only over millennia — extreme continuity, minimal turnover.',
        'speculative-assumption',
        'speculative',
      );
    } else {
      recommendedParameters['civilization.society'] = 'networked communities';
      recommendedParameters['civilization.laws'] = 'codified statutory law';
      recommendedParameters['civilization.populationOrders'] = 9;
      cb.add('Earth-like networked society with codified law.', 'model-inference', 'plausible-science');
    }

    if (longLived) {
      cb.add(
        `Individual lifespans of ≈ ${s.lifespanYears?.toExponential(1)} yr allow single minds to hold institutional memory across what for humans would be entire civilizations — enabling extraordinary long-horizon planning.`,
        'model-inference',
        'speculative',
        { dependsOn: ['user-input'] },
      );
    }

    return finalize({
      domain: 'civilization',
      title: 'Society, technology & Kardashev framing',
      summary: slow
        ? `A monolithic, deeply continuous civilization advancing over geological time to ≈Kardashev ${techLevel.toFixed(2)}; risk-management is exceptional due to long foresight.`
        : `A networked civilization near modern-Earth technology (≈Kardashev ${techLevel.toFixed(2)}).`,
      assumptions: [
        'Technological progress rate scales with cognitive cycles per unit wall-clock time.',
        'Long individual lifespans improve institutional memory and risk-management.',
      ],
      equations: [
        eq(
          'Technology ceiling',
          'T = 0.5·I + 0.35·M + 0.15·R',
          'Kardashev-ish ceiling from intelligence, mathematics, and risk-management (engine formula).',
          'plausible-science',
        ),
      ],
      citations: [placeholder('civ-1', 'Kardashev scale framing (placeholder)')],
      dependencies: ['intelligence'],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });
  },
};
