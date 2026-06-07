// =============================================================================
// @hsi/research-agents — skeptic agent (the falsification pass)
// Reads ALL prior domain outputs, finds the weakest claims (provenance
// 'speculative-assumption'/'unsupported-generation' or tier speculative/
// fictional/violates-known-physics) and emits Dispute[]. Also expresses itself as
// an AgentOutput whose counterarguments mirror the disputes.
// =============================================================================

import type {
  Agent,
  AgentContext,
  AgentDomain,
  AgentOutput,
  Claim,
  Dispute,
  ResearchConcept,
} from '../types';
import { ClaimBuilder, finalize, placeholder } from './helpers';

/** Severity for a weak claim, from its tier. */
function severityFor(claim: Claim): Dispute['severity'] {
  if (claim.tier === 'violates-known-physics') return 'high';
  if (claim.tier === 'fictional') return 'high';
  if (claim.source === 'unsupported-generation') return 'high';
  if (claim.tier === 'speculative') return 'medium';
  return 'low';
}

/** Decide whether a claim is challengeable. */
function isWeak(claim: Claim): boolean {
  return (
    claim.source === 'speculative-assumption' ||
    claim.source === 'unsupported-generation' ||
    claim.tier === 'speculative' ||
    claim.tier === 'fictional' ||
    claim.tier === 'violates-known-physics'
  );
}

/**
 * Build the disputes the skeptic raises. Exposed so the orchestrator can attach
 * the same Dispute[] to the run result (single source of truth).
 */
export function buildDisputes(context: AgentContext): Dispute[] {
  const disputes: Dispute[] = [];
  let n = 0;
  // Deterministic order: iterate domains in a fixed sequence.
  const order: AgentDomain[] = [
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
  for (const domain of order) {
    const out = context.prior.get(domain);
    if (!out) continue;
    for (const claim of out.claims) {
      if (!isWeak(claim)) continue;
      const severity = severityFor(claim);
      disputes.push({
        id: `dispute.${n++}`,
        raisedBy: 'skeptic',
        targetDomain: domain,
        targetClaimId: claim.id,
        severity,
        challenge: challengeText(domain, claim),
        resolution: resolutionText(severity),
        status: severity === 'high' ? 'open' : 'mitigated',
      });
    }
  }
  return disputes;
}

function challengeText(domain: AgentDomain, claim: Claim): string {
  const lead =
    claim.source === 'unsupported-generation'
      ? 'No grounding was provided for'
      : claim.tier === 'violates-known-physics'
        ? 'This appears to violate known physics'
        : claim.tier === 'fictional'
          ? 'This is a narrative device, not a physical claim'
          : 'This rests on an unverified speculative assumption';
  return `[${domain}] ${lead}: "${claim.text}" — what observable or first-principles argument would distinguish it from the null hypothesis?`;
}

function resolutionText(severity: Dispute['severity']): string | undefined {
  if (severity === 'high') return undefined; // remains open
  return 'Accepted as an explicitly-flagged speculative assumption; carried into the blueprint with reduced confidence.';
}

export const skepticAgent: Agent = {
  domain: 'skeptic',
  dependencies: [
    'physics',
    'planetology',
    'chemistry',
    'biology',
    'evolution',
    'intelligence',
    'civilization',
    'mathematics',
    'risk',
  ],
  analyze(_concept: ResearchConcept, context: AgentContext): AgentOutput {
    const cb = new ClaimBuilder('skeptic');
    const disputes = buildDisputes(context);
    const high = disputes.filter((d) => d.severity === 'high').length;
    const medium = disputes.filter((d) => d.severity === 'medium').length;

    cb.add(
      `Falsification pass examined every prior claim; raised ${disputes.length} disputes (${high} high, ${medium} medium severity).`,
      'model-inference',
      'known-science',
    );
    for (const d of disputes) {
      cb.add(
        d.challenge,
        'model-inference',
        d.severity === 'high' ? 'speculative' : 'plausible-science',
        { dependsOn: d.targetClaimId ? [d.targetClaimId] : undefined },
      );
    }
    if (disputes.length === 0) {
      cb.add('No claim was tagged speculative/fictional/violating — the blueprint is unusually well-grounded.', 'model-inference', 'known-science');
    }

    return finalize({
      domain: 'skeptic',
      title: 'Skeptical review & disputes',
      summary: `Raised ${disputes.length} disputes against the weakest claims (${high} high-severity remain open).`,
      assumptions: ['Any claim not grounded in known science or computed inference is challengeable.'],
      equations: [],
      // The skeptic surfaces nothing as "known/plausible/speculative" content of
      // its own; its substance is the disputes/counterarguments.
      knownScience: [],
      plausibleExtrapolations: [],
      speculativeClaims: [],
      citations: [placeholder('skep-1', 'Falsifiability criterion (placeholder)')],
      dependencies: this.dependencies,
      counterarguments: disputes.map((d) => d.challenge),
      recommendedParameters: {
        'skeptic.disputeCount': disputes.length,
        'skeptic.highSeverity': high,
      },
      claims: cb.all(),
    });
  },
};
