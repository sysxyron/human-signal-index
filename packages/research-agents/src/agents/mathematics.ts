// =============================================================================
// @hsi/research-agents — mathematics agent
// The quantitative backbone of the run: the Temporal Niche relation C(t) ≈ E(t)
// (an organism is adapted when its cognitive response rate matches its
// environment's change rate). Produces equations + a temporal-adaptation estimate
// across reference environments. Depends on intelligence.
// =============================================================================

import {
  adaptationAcrossEnvironments,
  computeTemporalAdaptation,
  ENVIRONMENT_RATES,
} from '@hsi/simulation-engine';
import type { Agent, AgentContext, AgentOutput, ResearchConcept } from '../types';
import { ClaimBuilder, eq, finalize, placeholder } from './helpers';

export const mathematicsAgent: Agent = {
  domain: 'mathematics',
  dependencies: ['intelligence'],
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput {
    const cb = new ClaimBuilder('mathematics');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};
    const intel = context.prior.get('intelligence');
    const cogRate =
      (intel?.recommendedParameters['intelligence.cognitiveRateHz'] as number) ?? 20;

    cb.add(
      'Temporal Niche Theory: an organism is temporally ADAPTED when its cognitive response rate C(t) ≈ its environment\'s change rate E(t); C ≪ E is under-adapted, C ≫ E is over-reactive.',
      'model-inference',
      'speculative',
    );

    // Evaluate the concept's cognitive rate against all reference environments.
    const across = adaptationAcrossEnvironments(cogRate);
    recommendedParameters['temporal.adaptation.fast'] = across.fast.score;
    recommendedParameters['temporal.adaptation.ecological'] = across.ecological.score;
    recommendedParameters['temporal.adaptation.climatic'] = across.climatic.score;
    recommendedParameters['temporal.adaptation.geological'] = across.geological.score;

    cb.add(
      `Against a FAST (sub-second) environment the mind scores ${across.fast.score}/100 (${across.fast.label}).`,
      'model-inference',
      'plausible-science',
      { dependsOn: intel ? ['intelligence.c0'] : undefined },
    );
    cb.add(
      `Against a GEOLOGICAL environment it scores ${across.geological.score}/100 (${across.geological.label}).`,
      'model-inference',
      'plausible-science',
    );

    // Find the best-matched environment (the niche the organism actually fits).
    const entries = Object.entries(across) as Array<
      [keyof typeof ENVIRONMENT_RATES, (typeof across)['fast']]
    >;
    const best = entries.reduce((a, b) => (b[1].score > a[1].score ? b : a));
    recommendedParameters['temporal.bestNiche'] = best[0];
    cb.add(
      `Best-matched temporal niche: "${best[0]}" (score ${best[1].score}/100). This is the regime the organism is actually built for.`,
      'model-inference',
      'plausible-science',
    );

    // A direct C≈E balance check at the best niche.
    const balanced = computeTemporalAdaptation({
      cognitiveRateHz: cogRate,
      environmentalChangeRate: ENVIRONMENT_RATES[best[0]],
    });
    cb.add(
      `At its best niche the log-ratio log10(C/E) ≈ ${balanced.logRatio.toFixed(2)}; |log-ratio| < 1 ⇒ balanced.`,
      'model-inference',
      'plausible-science',
    );

    return finalize({
      domain: 'mathematics',
      title: 'Temporal Niche model C(t) ≈ E(t)',
      summary: `The run\'s central quantitative model: cognition at ${cogRate.toExponential(2)} Hz is ${across.fast.label} to fast environments and ${across.geological.label} to geological ones; best niche = "${best[0]}".`,
      assumptions: [
        'Adaptation is well-modeled by the log-distance between cognitive and environmental rates.',
        'A 1.5-decade tolerance (σ) separates "balanced" from "mismatched".',
      ],
      equations: [
        eq(
          'Temporal niche balance',
          'C(t) ≈ E(t)',
          'Adaptation occurs when cognitive response rate matches environmental change rate.',
          'speculative',
        ),
        eq(
          'Adaptation score',
          'A = exp(−½·(log10(C/E)/σ)²)·100',
          'Gaussian-in-log-space adaptation score; σ ≈ 1.5 orders of magnitude.',
          'plausible-science',
        ),
      ],
      citations: [placeholder('math-1', 'Temporal Niche Theory (WorldForge, placeholder)')],
      dependencies: ['intelligence'],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });
  },
};
