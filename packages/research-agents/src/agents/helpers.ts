// =============================================================================
// @hsi/research-agents — agent helpers
// Shared, deterministic utilities for building traceable claims and deriving
// consistent uncertainty/confidence scores. Reuses the @hsi scientific-confidence
// ladder so tiers stay consistent across the whole stack.
// =============================================================================

import { scientificConfidence } from '@hsi/world-models';
import type {
  AgentDomain,
  AgentOutput,
  Citation,
  Claim,
  Equation,
  ProvenanceSource,
  ScientificConfidenceTier,
} from '../types';

/** Build a deterministic claim id from a domain + ordinal. */
export function claimId(domain: AgentDomain, n: number): string {
  return `${domain}.c${n}`;
}

/** A small stateful builder so each agent emits sequential, traceable claims. */
export class ClaimBuilder {
  private claims: Claim[] = [];
  private n = 0;
  constructor(private readonly domain: AgentDomain) {}

  /** Add a claim; confidence is derived from the tier unless overridden. */
  add(
    text: string,
    source: ProvenanceSource,
    tier: ScientificConfidenceTier,
    opts: { dependsOn?: string[]; confidence?: number } = {},
  ): string {
    const id = claimId(this.domain, this.n++);
    const confidence = opts.confidence ?? scientificConfidence(tier, '').confidence;
    this.claims.push({
      id,
      text,
      source,
      tier,
      confidence: clampUnit(confidence),
      dependsOn: opts.dependsOn,
    });
    return id;
  }

  all(): Claim[] {
    return this.claims;
  }
}

/** A citation placeholder helper. */
export function placeholder(id: string, label: string, note?: string): Citation {
  return { id, label, kind: 'placeholder', note };
}

/** A known-science equation helper. */
export function eq(
  name: string,
  expression: string,
  explanation: string,
  tier: ScientificConfidenceTier = 'known-science',
): Equation {
  return { name, expression, explanation, tier };
}

function clampUnit(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Round to 1 decimal for display-stable scores. */
export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Derive consistent 0..100 uncertainty + confidence scores from a claim set.
 * More speculative/fictional/violating claims raise uncertainty and lower
 * confidence; grounded (known/plausible) claims do the reverse. The two are not
 * forced to sum to 100 — they are independent axes — but they move oppositely.
 */
export function scoresFromClaims(claims: Claim[]): {
  uncertaintyScore: number;
  confidenceScore: number;
} {
  if (claims.length === 0) {
    return { uncertaintyScore: 50, confidenceScore: 50 };
  }
  // Average claim confidence drives the confidence axis directly.
  const avgConfidence =
    claims.reduce((s, c) => s + c.confidence, 0) / claims.length;
  // Tier-weighted "speculativeness" drives uncertainty.
  const TIER_RISK: Record<ScientificConfidenceTier, number> = {
    'known-science': 0.05,
    'plausible-science': 0.3,
    speculative: 0.65,
    fictional: 0.85,
    'violates-known-physics': 0.98,
  };
  const avgRisk =
    claims.reduce((s, c) => s + TIER_RISK[c.tier], 0) / claims.length;
  return {
    uncertaintyScore: round1(clampUnit(avgRisk) * 100),
    confidenceScore: round1(clampUnit(avgConfidence) * 100),
  };
}

/**
 * Finalize an AgentOutput by computing scores from its claims and bucketing
 * claim texts into the known/plausible/speculative arrays for the UI.
 */
export function finalize(
  partial: Omit<
    AgentOutput,
    'uncertaintyScore' | 'confidenceScore' | 'knownScience' | 'plausibleExtrapolations' | 'speculativeClaims'
  > &
    Partial<Pick<AgentOutput, 'knownScience' | 'plausibleExtrapolations' | 'speculativeClaims'>>,
): AgentOutput {
  const { uncertaintyScore, confidenceScore } = scoresFromClaims(partial.claims);
  const known =
    partial.knownScience ??
    partial.claims.filter((c) => c.tier === 'known-science').map((c) => c.text);
  const plausible =
    partial.plausibleExtrapolations ??
    partial.claims.filter((c) => c.tier === 'plausible-science').map((c) => c.text);
  const speculative =
    partial.speculativeClaims ??
    partial.claims
      .filter(
        (c) =>
          c.tier === 'speculative' ||
          c.tier === 'fictional' ||
          c.tier === 'violates-known-physics',
      )
      .map((c) => c.text);
  return {
    ...partial,
    knownScience: known,
    plausibleExtrapolations: plausible,
    speculativeClaims: speculative,
    uncertaintyScore,
    confidenceScore,
  };
}

/** Format a tiny Hz rate as a human period (mirrors temporal-niche style). */
export function fmtRateHz(hz: number): string {
  if (hz >= 1) return `${hz.toPrecision(3)} Hz`;
  const period = 1 / hz;
  const yr = period / (365 * 86400);
  if (yr >= 1) return `~1 event / ${yr.toPrecision(3)} yr`;
  const days = period / 86400;
  if (days >= 1) return `~1 event / ${days.toPrecision(3)} days`;
  return `~1 event / ${period.toPrecision(3)} s`;
}
