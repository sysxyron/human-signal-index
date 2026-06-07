// =============================================================================
// @hsi/research-agents — consensus agent
// Reads every agent output + the disputes, computes overallConfidence
// (aggregate agent confidence minus dispute penalties), agreementScore,
// classificationBreakdown (count claims by tier), keyFindings, carries open
// disputes, merges recommendedParameters, and writes blueprintNotes.
// Emits both an AgentOutput and a ConsensusReport (via buildConsensusReport).
// =============================================================================

import type {
  Agent,
  AgentContext,
  AgentDomain,
  AgentOutput,
  ConsensusReport,
  Dispute,
  ResearchConcept,
  ScientificConfidenceTier,
} from '../types';
import { ClaimBuilder, finalize, placeholder, round1 } from './helpers';

/** Domain agents whose outputs feed the consensus (excludes skeptic/consensus). */
const DOMAIN_AGENTS: AgentDomain[] = [
  'physics',
  'planetology',
  'chemistry',
  'biology',
  'evolution',
  'intelligence',
  'civilization',
  'mathematics',
  'risk',
];

const EMPTY_BREAKDOWN = (): Record<ScientificConfidenceTier, number> => ({
  'known-science': 0,
  'plausible-science': 0,
  speculative: 0,
  fictional: 0,
  'violates-known-physics': 0,
});

/** Penalty (confidence points) applied per dispute by severity. */
const DISPUTE_PENALTY: Record<Dispute['severity'], number> = {
  low: 1,
  medium: 3,
  high: 7,
};

/**
 * Build the full ConsensusReport from prior outputs + disputes. Pure; the
 * orchestrator reuses this for the run result.
 */
export function buildConsensusReport(
  context: AgentContext,
): ConsensusReport {
  const outputs = DOMAIN_AGENTS.map((d) => context.prior.get(d)).filter(
    (o): o is AgentOutput => o !== undefined,
  );
  const disputes = context.disputes ?? [];

  // --- classification breakdown (count every claim by tier) -----------------
  const breakdown = EMPTY_BREAKDOWN();
  for (const o of outputs) {
    for (const c of o.claims) breakdown[c.tier]++;
  }

  // --- overall confidence ----------------------------------------------------
  const avgConfidence =
    outputs.length > 0
      ? outputs.reduce((s, o) => s + o.confidenceScore, 0) / outputs.length
      : 50;
  const penalty = disputes.reduce((s, d) => s + DISPUTE_PENALTY[d.severity], 0);
  const overallConfidence = round1(Math.max(0, Math.min(100, avgConfidence - penalty)));

  // --- agreement score (lower = more disagreement) --------------------------
  // Disagreement proxy: spread of per-agent confidence + share of speculative
  // claims. High spread / high speculation → lower agreement.
  const confidences = outputs.map((o) => o.confidenceScore);
  const mean = confidences.reduce((s, x) => s + x, 0) / Math.max(1, confidences.length);
  const variance =
    confidences.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, confidences.length);
  const stddev = Math.sqrt(variance);
  const totalClaims = outputs.reduce((s, o) => s + o.claims.length, 0) || 1;
  const speculativeShare =
    (breakdown.speculative + breakdown.fictional + breakdown['violates-known-physics']) /
    totalClaims;
  const agreementScore = round1(
    Math.max(0, Math.min(100, 100 - stddev - speculativeShare * 60 - disputes.length * 1.5)),
  );

  // --- merge recommended parameters -----------------------------------------
  const merged: Record<string, number | string | boolean> = {};
  for (const o of outputs) {
    for (const [k, v] of Object.entries(o.recommendedParameters)) {
      // Later (more downstream) agents win on conflict; iterate in domain order.
      merged[k] = v;
    }
  }

  // --- key findings ----------------------------------------------------------
  const keyFindings: string[] = outputs.map((o) => `${o.title}: ${o.summary}`);

  // --- blueprint notes -------------------------------------------------------
  const blueprintNotes: string[] = [
    `Aggregate confidence ${overallConfidence}/100 across ${outputs.length} domain agents.`,
    `Claim ledger: ${breakdown['known-science']} known, ${breakdown['plausible-science']} plausible, ${breakdown.speculative} speculative, ${breakdown.fictional} fictional, ${breakdown['violates-known-physics']} violating.`,
    `${disputes.length} disputes raised; ${disputes.filter((d) => d.status === 'open').length} remain open and should be flagged in the generated world.`,
  ];
  if (breakdown['violates-known-physics'] > 0) {
    blueprintNotes.push('WARNING: at least one claim violates known physics — the blueprint requires a non-standard universe preset or should be rejected.');
  }

  const summary = `Synthesis of ${outputs.length} domain agents: overall confidence ${overallConfidence}/100, agreement ${agreementScore}/100, ${disputes.length} disputes (${disputes.filter((d) => d.status === 'open').length} open).`;

  return {
    summary,
    overallConfidence,
    agreementScore,
    classificationBreakdown: breakdown,
    keyFindings,
    openDisputes: disputes.filter((d) => d.status === 'open'),
    recommendedParameters: merged,
    blueprintNotes,
  };
}

export const consensusAgent: Agent = {
  domain: 'consensus',
  dependencies: [...DOMAIN_AGENTS, 'skeptic'],
  analyze(_concept: ResearchConcept, context: AgentContext): AgentOutput {
    const cb = new ClaimBuilder('consensus');
    const report = buildConsensusReport(context);

    cb.add(report.summary, 'model-inference', 'known-science');
    cb.add(
      `Overall confidence ${report.overallConfidence}/100 (mean agent confidence minus dispute penalties).`,
      'model-inference',
      'known-science',
    );
    cb.add(
      `Agreement score ${report.agreementScore}/100 (lower = more disagreement); driven by confidence spread and speculative-claim share.`,
      'model-inference',
      'plausible-science',
    );

    return finalize({
      domain: 'consensus',
      title: 'Consensus synthesis',
      summary: report.summary,
      assumptions: ['Dispute penalties and agreement weighting are heuristic, not calibrated.'],
      equations: [],
      knownScience: report.keyFindings,
      plausibleExtrapolations: report.blueprintNotes,
      speculativeClaims: report.openDisputes.map((d) => d.challenge),
      citations: [placeholder('cons-1', 'Aggregation heuristic (placeholder)')],
      dependencies: this.dependencies,
      counterarguments: [],
      recommendedParameters: report.recommendedParameters,
      claims: cb.all(),
    });
  },
};
