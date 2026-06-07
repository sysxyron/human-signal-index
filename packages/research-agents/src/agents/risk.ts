// =============================================================================
// @hsi/research-agents — risk agent
// Extinction/stability risks AND a RISK COMPARISON vs humans (Earth baseline).
// Depends on civilization. Recommends risks.* params and emits a small comparison.
// =============================================================================

import { createEarthState } from '@hsi/world-models';
import { formulas } from '@hsi/simulation-engine';
import type { Agent, AgentContext, AgentOutput, ResearchConcept } from '../types';
import { ClaimBuilder, eq, finalize, placeholder, round1 } from './helpers';

/** A single line of the human-vs-concept risk comparison. */
export interface RiskComparisonRow {
  factor: string;
  human: number;
  concept: number;
  verdict: 'lower-risk' | 'higher-risk' | 'similar';
}

export const riskAgent: Agent = {
  domain: 'risk',
  dependencies: ['civilization'],
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput {
    const s = concept.extracted;
    const cb = new ClaimBuilder('risk');
    const recommendedParameters: AgentOutput['recommendedParameters'] = {};
    const civ = context.prior.get('civilization');
    const riskMgmt =
      (civ?.recommendedParameters['civilization.riskManagementIndex'] as number) ?? 0.45;

    // Long-lived red dwarf vs Sun.
    const longLivedStar = s.starType === 'M' || (s.frozen && (s.lifespanYears ?? 0) >= 1e6);
    const stellarLifetimeRemainingGyr = longLivedStar ? 80 : 5;
    recommendedParameters['risks.stellarLifetimeRemainingGyr'] = stellarLifetimeRemainingGyr;

    // Frozen, glacial worlds are climatically stable; low self-destruction for a
    // slow, far-sighted civilization.
    const climateInstability = s.frozen ? 0.1 : 0.4;
    const asteroidExposure = 0.12;
    const selfDestructionRisk = riskMgmt >= 0.8 ? 0.02 : 0.2;
    recommendedParameters['risks.climateInstability'] = climateInstability;
    recommendedParameters['risks.asteroidExposure'] = asteroidExposure;
    recommendedParameters['risks.selfDestructionRisk'] = selfDestructionRisk;

    const extinction = round1(
      formulas.extinctionIndex({
        climateInstability,
        asteroidExposure,
        selfDestructionRisk,
        stellarLifetimeRemainingGyr,
        riskManagement: riskMgmt,
      }),
    );
    recommendedParameters['risks.extinctionIndex'] = extinction;

    cb.add(
      `Aggregate extinction index ≈ ${extinction} (engine: climate, asteroid, self-destruction, stellar pressure, discounted by risk-management ≈ ${riskMgmt}).`,
      'model-inference',
      'plausible-science',
      { dependsOn: civ ? ['civilization.c0'] : undefined },
    );
    cb.add(
      `Host star has ≈ ${stellarLifetimeRemainingGyr} Gyr of main-sequence life left, so stellar-end risk is negligible on civilization timescales.`,
      'model-inference',
      longLivedStar ? 'plausible-science' : 'known-science',
    );

    // --- RISK COMPARISON vs humans -------------------------------------------
    const earth = createEarthState();
    const humanExtinction = earth.risks.extinctionIndex;
    const comparison: RiskComparisonRow[] = [
      mkRow('Extinction index', humanExtinction, extinction),
      mkRow('Climate instability', earth.risks.climateInstability, climateInstability),
      mkRow('Self-destruction', earth.risks.selfDestructionRisk, selfDestructionRisk),
      mkRow(
        'Stellar-end pressure',
        round1(formulas.stellarRiskPressure(earth.risks.stellarLifetimeRemainingGyr)),
        round1(formulas.stellarRiskPressure(stellarLifetimeRemainingGyr)),
      ),
    ];
    // Stash a compact, parameter-safe summary of the comparison.
    const safer = comparison.filter((r) => r.verdict === 'lower-risk').length;
    recommendedParameters['risk.comparison.factorsSaferThanHumans'] = safer;
    recommendedParameters['risk.comparison.total'] = comparison.length;

    cb.add(
      `Risk comparison vs humans: lower risk on ${safer}/${comparison.length} factors. The dominant advantage is climatic/stellar stability and far-sighted risk-management; the dominant residual risk is dependence on a single fragile substrate.`,
      'model-inference',
      'plausible-science',
    );
    cb.add(
      'A slow civilization that cannot react within a human-fast crisis window (e.g. a sudden impact) is structurally MORE vulnerable to fast catastrophes than humans, even while being safer against slow ones.',
      'model-inference',
      'speculative',
    );

    return finalize({
      domain: 'risk',
      title: 'Existential risk & human comparison',
      summary: `Extinction index ≈ ${extinction} vs human ≈ ${humanExtinction}; safer on ${safer}/${comparison.length} factors. Strong against slow threats, weak against fast ones.`,
      assumptions: [
        'Risk-management capability scales with cognitive foresight and lifespan.',
        'Single-substrate dependence is itself a systemic risk.',
      ],
      equations: [
        eq(
          'Extinction index',
          'X = (0.3·climate + 0.2·asteroid + 0.3·selfDestruct + 0.2·stellar)·(1 − 0.5·R)',
          'Aggregate extinction risk discounted by risk-management R (engine formula).',
          'plausible-science',
        ),
      ],
      citations: [placeholder('risk-1', 'Existential-risk taxonomy (placeholder)')],
      dependencies: ['civilization'],
      counterarguments: [],
      recommendedParameters,
      claims: cb.all(),
    });

    function mkRow(factor: string, human: number, conceptVal: number): RiskComparisonRow {
      const delta = conceptVal - human;
      const verdict: RiskComparisonRow['verdict'] =
        Math.abs(delta) < 0.05 ? 'similar' : delta < 0 ? 'lower-risk' : 'higher-risk';
      return { factor, human: round1(human), concept: round1(conceptVal), verdict };
    }
  },
};
