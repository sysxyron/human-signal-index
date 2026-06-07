// =============================================================================
// @hsi/research-agents — intelligence agent
// Cognitive substrate (e.g. geological neural networks), cognitive RATE derived
// from the subjective-day signal, and problem-solving framing. Depends on
// evolution. Recommends intelligence.* params (esp. cognitiveRateHz).
// =============================================================================

import { formulas } from '@hsi/simulation-engine';
import type { Agent, AgentContext, AgentOutput, ResearchConcept } from '../types';
import { ClaimBuilder, eq, finalize, fmtRateHz, placeholder } from './helpers';

/** Seconds in a year (Julian-ish, matches the rest of the engine). */
const SECONDS_PER_YEAR = 365 * 86400;

export const intelligenceAgent: Agent = {
  domain: 'intelligence',
  dependencies: ['evolution'],
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput {
    const s = concept.extracted;
    const cb = new ClaimBuilder('intelligence');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};
    const evo = context.prior.get('evolution');
    const complexity = (evo?.recommendedParameters['biology.complexityIndex'] as number) ?? 0.6;

    recommendedParameters['intelligence.present'] = true;

    // --- cognitive rate -------------------------------------------------------
    // Model: a "subjective day" is one perceptual cycle. If that day spans N
    // Earth years, the organism completes ~1 high-level cognitive cycle per N
    // years → cognitiveRateHz ≈ 1 / (N · seconds_per_year).
    let cognitiveRateHz: number;
    if (s.subjectiveDayYears !== undefined && s.subjectiveDayYears > 0) {
      cognitiveRateHz = 1 / (s.subjectiveDayYears * SECONDS_PER_YEAR);
      cb.add(
        `Subjective day ≈ ${s.subjectiveDayYears} Earth years ⇒ cognitive rate ≈ ${cognitiveRateHz.toExponential(2)} Hz (${fmtRateHz(cognitiveRateHz)}).`,
        'model-inference',
        'plausible-science',
        { dependsOn: ['user-input'] },
      );
    } else {
      cognitiveRateHz = 20; // Earth-like conscious cadence, order of magnitude
      cb.add(
        'No subjective-time signal: cognitive rate defaults to an Earth-like ~20 Hz conscious cadence.',
        'model-inference',
        'known-science',
      );
    }
    recommendedParameters['intelligence.cognitiveRateHz'] = cognitiveRateHz;

    // --- substrate ------------------------------------------------------------
    const substrate =
      s.neuralSubstrate ??
      (s.geneticsSubstrate === 'crystal' || s.geneticsSubstrate === 'silicon'
        ? 'geological mineral neural network'
        : 'neuronal');
    recommendedParameters['intelligence.substrate'] = substrate;
    if (substrate.includes('geological') || substrate.includes('mineral')) {
      cb.add(
        'Cognition is hosted in a geological mineral neural network: information propagates as slow phase/defect changes through a crystalline lattice rather than fast electrochemical spikes.',
        s.neuralSubstrate ? 'user-input' : 'prior-agent',
        'speculative',
        { dependsOn: s.neuralSubstrate ? ['user-input'] : ['evolution.c0'] },
      );
      cb.add(
        'Such a substrate trades speed for stability and energy-efficiency — physically imaginable but with no empirical precedent.',
        'speculative-assumption',
        'speculative',
      );
    } else {
      cb.add('Cognition uses a fast electrochemical neuronal substrate.', 'known-science', 'known-science');
    }

    // --- problem solving ------------------------------------------------------
    const problemSolving = formulas.intelligencePlausibility(complexity, 0.85);
    const psIndex = Math.round(Math.max(0.5, problemSolving) * 100) / 100;
    recommendedParameters['intelligence.problemSolvingIndex'] = psIndex;
    cb.add(
      `Problem-solving capability ≈ ${psIndex}: slow but deeply capable — long deliberation per "thought" can favor very high-quality, far-sighted reasoning.`,
      'model-inference',
      'plausible-science',
      { dependsOn: evo ? ['evolution.c0'] : undefined },
    );

    return finalize({
      domain: 'intelligence',
      title: 'Cognitive substrate & rate',
      summary:
        s.subjectiveDayYears !== undefined
          ? `Intelligence on a ${substrate}, thinking at ≈ ${cognitiveRateHz.toExponential(2)} Hz (one cycle per ~${s.subjectiveDayYears} yr) — slow, stable, far-sighted.`
          : `Earth-like intelligence on a ${substrate} at ≈ ${cognitiveRateHz} Hz.`,
      assumptions: [
        'A subjective day maps to one high-level cognitive cycle.',
        'Cognitive rate is decoupled from problem-solving QUALITY.',
      ],
      equations: [
        eq(
          'Cognitive rate',
          'C(Hz) = 1 / (subjectiveDayYears · seconds_per_year)',
          'One perceptual cycle per subjective day sets the cognitive throughput in Hz.',
          'plausible-science',
        ),
        eq(
          'Intelligence plausibility',
          'I = complexity^1.3 · (0.5 + 0.5·problemSolving)',
          'Emergence of intelligence from sustained biological complexity (engine formula).',
          'plausible-science',
        ),
      ],
      citations: [placeholder('intel-1', 'Substrate-independent cognition (placeholder)')],
      dependencies: ['evolution'],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });
  },
};
