// =============================================================================
// @hsi/research-agents — claim reliability model (WorldForge Phase 5)
// Per-claim companion to evidence-weighted consensus. For a single claim it
// blends the claim's own confidence with an evidence confidence, modulated by
// how the evidence COVERS the claim (supported / contradicted / background /
// unsupported) and by the claim's ScientificConfidenceTier.
//
// HONESTY PRINCIPLE: evidence can never make a physics-violating (or purely
// fictional) claim "reliable". A high tier ceiling caps reliabilityScore no
// matter how much corroboration is gathered — so we don't launder fiction into
// fact by citing sources for it.
//
// Pure, deterministic, zero runtime deps. Imports only the tier TYPE from the
// research-agents types (which re-exports it from @hsi/world-models).
// =============================================================================

import type { ScientificConfidenceTier } from '../types';

/** Clamp `n` into the inclusive range [lo, hi]. */
const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/** Round to one decimal place. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** How evidence relates to a single claim. */
export type ClaimCoverage =
  | 'supported'
  | 'contradicted'
  | 'background'
  | 'unsupported';

/** The reliability verdict for one claim. */
export interface ClaimReliability {
  claimId: string;
  tier: ScientificConfidenceTier;
  /** 0..1 — the claim's own (agent) confidence. */
  claimConfidence: number;
  /** 0..1 — confidence contributed by the gathered evidence. */
  evidenceConfidence: number;
  /** 0..1 — blended + coverage-modulated confidence (before tier ceiling). */
  finalConfidence: number;
  /** 0..100 — finalConfidence*100, then capped by the tier ceiling. */
  reliabilityScore: number;
  coverage: ClaimCoverage;
  /** One-line explanation of the math. */
  rationale: string;
}

// -----------------------------------------------------------------------------
// Model constants (documented)
// -----------------------------------------------------------------------------

/**
 * Tier ceilings (0..1). Reliability can never exceed the ceiling for the claim's
 * tier — this is the HONESTY guarantee. Mirrors the spirit of @hsi/world-models
 * TIER_META: known science can be fully reliable; fiction and physics-violations
 * are capped near zero regardless of how much "evidence" is attached to them.
 */
const TIER_CEILING: Record<ScientificConfidenceTier, number> = {
  'known-science': 1.0,
  'plausible-science': 0.85,
  speculative: 0.55,
  fictional: 0.18,
  'violates-known-physics': 0.08,
};

/**
 * Base blend of claim vs evidence confidence (a weighted mean). Coverage then
 * nudges this up or down, then the tier ceiling caps the result.
 */
const CLAIM_BLEND = 0.5;
const EVIDENCE_BLEND = 0.5;

/**
 * Coverage modulation applied to the blended confidence:
 *   - supported   : multiply up (corroboration lifts confidence)
 *   - background  : neutral
 *   - contradicted: multiply down hard (evidence fights the claim)
 *   - unsupported : hard CAP at UNSUPPORTED_CAP (absence of evidence caps trust)
 */
const SUPPORTED_LIFT = 1.15;
const CONTRADICTED_DRAG = 0.4;
const UNSUPPORTED_CAP = 0.45;
/** Extra per-source lift for supported claims, saturating at this many sources. */
const SOURCE_LIFT_PER = 0.03;
const SOURCE_LIFT_MAX = 0.12;

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

/** Input for a single claim's reliability computation. */
export interface ComputeClaimReliabilityInput {
  claimId: string;
  tier: ScientificConfidenceTier;
  /** 0..1 — the claim's own (agent) confidence. */
  claimConfidence: number;
  coverage: ClaimCoverage;
  /** 0..1 — confidence the evidence itself carries. */
  evidenceConfidence: number;
  /** Number of corroborating sources (only used for 'supported' coverage). */
  supportingSources?: number;
}

/**
 * Compute a single claim's reliability. finalConfidence blends claimConfidence
 * with evidenceConfidence, is modulated by coverage, then the tier ceiling caps
 * the resulting reliabilityScore.
 */
export function computeClaimReliability(
  input: ComputeClaimReliabilityInput,
): ClaimReliability {
  const claimConfidence = clamp(input.claimConfidence, 0, 1);
  const evidenceConfidence = clamp(input.evidenceConfidence, 0, 1);
  const sources = Math.max(0, Math.floor(input.supportingSources ?? 0));

  // 1) base weighted-mean blend.
  let blended = CLAIM_BLEND * claimConfidence + EVIDENCE_BLEND * evidenceConfidence;

  // 2) coverage modulation.
  let coverageNote: string;
  switch (input.coverage) {
    case 'supported': {
      const sourceLift = Math.min(SOURCE_LIFT_MAX, sources * SOURCE_LIFT_PER);
      blended = blended * SUPPORTED_LIFT + sourceLift;
      coverageNote = `supported (x${SUPPORTED_LIFT}${sourceLift > 0 ? ` +${round1(sourceLift * 100) / 100} from ${sources} sources` : ''})`;
      break;
    }
    case 'contradicted': {
      blended = blended * CONTRADICTED_DRAG;
      coverageNote = `contradicted (x${CONTRADICTED_DRAG})`;
      break;
    }
    case 'unsupported': {
      blended = Math.min(blended, UNSUPPORTED_CAP);
      coverageNote = `unsupported (capped at ${UNSUPPORTED_CAP})`;
      break;
    }
    case 'background':
    default: {
      coverageNote = 'background (neutral)';
      break;
    }
  }

  const finalConfidence = clamp(blended, 0, 1);

  // 3) tier ceiling — the HONESTY cap. Evidence cannot push a claim above the
  //    ceiling for its scientific tier.
  const ceiling = TIER_CEILING[input.tier];
  const cappedScore01 = Math.min(finalConfidence, ceiling);
  const reliabilityScore = round1(clamp(cappedScore01 * 100, 0, 100));

  const ceilingHit = finalConfidence > ceiling;
  const rationale =
    `blend(claim ${round1(claimConfidence * 100) / 100}, evidence ${round1(evidenceConfidence * 100) / 100}) ` +
    `→ ${coverageNote} = ${round1(finalConfidence * 100) / 100}; ` +
    `tier '${input.tier}' ceiling ${ceiling}` +
    (ceilingHit ? ` CAPS reliability at ${reliabilityScore}/100 (evidence cannot make this reliable)` : ` → ${reliabilityScore}/100`);

  return {
    claimId: input.claimId,
    tier: input.tier,
    claimConfidence: round1(claimConfidence * 100) / 100,
    evidenceConfidence: round1(evidenceConfidence * 100) / 100,
    finalConfidence: round1(finalConfidence * 100) / 100,
    reliabilityScore,
    coverage: input.coverage,
    rationale,
  };
}

/** Batch helper: compute reliability for many claims. */
export function computeClaimReliabilities(
  inputs: readonly ComputeClaimReliabilityInput[],
): ClaimReliability[] {
  return inputs.map((i) => computeClaimReliability(i));
}
