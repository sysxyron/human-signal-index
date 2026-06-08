// =============================================================================
// @hsi/research-agents — governed confidence (WorldForge Phase 6)
// Human Review & Governance layer. ADDITIVE and PURE: it sits ON TOP of the
// Phase 5 evidence-weighted consensus and folds in a HUMAN signal — reviewer
// verdicts and reviewer trust — to produce a final "Governed Confidence":
//
//     Governed Confidence = Research + Evidence + Reviewer
//
// The reviewer term is centered at "neutral" (0.5): an unreviewed item is NOT
// penalised, it simply leaves the evidence-weighted baseline untouched. Human
// validation lifts the score; human rejection drops it. How much weight the
// human carries grows with the reviewer's TRUST and with how many reviews the
// item received.
//
// IMPORTANT: this file takes only PLAIN NUMERIC INPUTS. It does NOT import from
// '@hsi/evidence-engine' (that package imports '@hsi/research-agents', so an
// import here would create a dependency CYCLE). The app passes us flat numbers.
//
// Pure, deterministic (no Date.now / Math.random), zero runtime deps. All inputs
// clamped. Numbers are 0..100 unless a comment says 0..1.
// =============================================================================

/** Clamp `n` into the inclusive range [lo, hi]. */
const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/** Clamp into [0, 1]. */
const clamp01 = (n: number): number => clamp(n, 0, 1);

/** Round to one decimal place (matches the rest of the package's reporting). */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Round to two decimals (for 0..1 scores). */
const round2 = (n: number): number => Math.round(n * 100) / 100;

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

/** A single human reviewer's verdict on an item. */
export type ReviewerVerdict =
  | 'validated'
  | 'rejected'
  | 'needs_more'
  | 'disputed'
  | 'pending';

/** Raw activity counters used to derive a reviewer's trust. */
export interface ReviewerTrustInput {
  /** How many of this reviewer's verdicts were approvals/validations. */
  approvedCount: number;
  /** How many of this reviewer's past verdicts were later reversed/overturned. */
  reversedCount: number;
  /** Total number of reviews this reviewer has performed. */
  reviewCount: number;
}

/** A reviewer's derived trust score with a one-line explanation. */
export interface ReviewerTrust {
  /** 0..1 — higher = more trusted. ~0.5 is neutral / unknown. */
  trustScore: number;
  /** Plain-language summary of how the trust was derived. */
  explanation: string;
}

/** Flat numeric inputs for the headline governedConfidence() call. */
export interface GovernanceInput {
  /** 0..100 — agent/consensus research confidence. */
  researchConfidence: number;
  /** 0..100 — evidence-derived confidence (e.g. from Phase 5). */
  evidenceConfidence: number;
  /**
   * 0..1 — AGGREGATE reviewer signal. 0.5 = neutral / unreviewed,
   * → 1 = reviewers validated, → 0 = reviewers rejected. See
   * aggregateReviewerValidation() for how to build this from decisions.
   */
  reviewerValidation: number;
  /** 0..1 — aggregate reviewer trust. Defaults to 0.5 (neutral). */
  reviewerTrust?: number;
  /** How many human reviews informed reviewerValidation. Defaults to 0. */
  reviewCount?: number;
}

/** The explained governed-confidence result. */
export interface GovernedConfidenceResult {
  /** 0..100 — echoed research confidence. */
  researchConfidence: number;
  /** 0..100 — echoed evidence confidence. */
  evidenceConfidence: number;
  /** 0..1 — echoed reviewer validation signal. */
  reviewerValidation: number;
  /** 0..100 — the final, human-governed confidence to display/use. */
  governedConfidence: number;
  /** Effective contribution weights (sum ~1) for transparency. */
  weights: { research: number; evidence: number; reviewer: number };
  /** governedConfidence - baseline (signed; baseline = research/evidence blend). */
  delta: number;
  /** True when a human review actually moved (or could move) the score. */
  reviewed: boolean;
  /** Human-readable reasons. First entry is the directional headline. */
  explanation: string[];
}

// -----------------------------------------------------------------------------
// 1) computeReviewerTrust
// -----------------------------------------------------------------------------

/**
 * Derive a reviewer's trust (0..1) from their activity.
 *
 *   approvalRate    = approvedCount / max(1, reviewCount)        // 0..1
 *   reversalPenalty = reversedCount / max(1, reviewCount)        // 0..1
 *   activityBonus   = reviewCount / (reviewCount + 10)           // 0..1, saturating
 *
 *   trustScore = clamp01(
 *       0.5                                          // neutral anchor
 *     + 0.4 * (approvalRate - 2 * reversalPenalty)   // approvals up, reversals 2x down
 *     + 0.1 * activityBonus                          // sustained activity nudges up
 *   )
 *
 * Tuning notes:
 *   - 0 reviews → approvalRate 0, reversal 0, activity 0 → trust = 0.5 (neutral).
 *   - Many clean approvals → approvalRate→1, activity→1 → trust ≈ 0.5+0.4+0.1 = 1.0.
 *   - Many reversals → the 2x penalty drives the bracket negative → trust → low.
 */
export function computeReviewerTrust(input: ReviewerTrustInput): ReviewerTrust {
  const reviewCount = Math.max(0, Math.floor(input.reviewCount));
  const approved = clamp(Math.floor(input.approvedCount), 0, Math.max(reviewCount, Math.floor(input.approvedCount)));
  const reversed = clamp(Math.floor(input.reversedCount), 0, Math.max(reviewCount, Math.floor(input.reversedCount)));

  if (reviewCount === 0) {
    return {
      trustScore: 0.5,
      explanation: 'No reviews yet — neutral trust (0.5).',
    };
  }

  const approvalRate = clamp01(approved / reviewCount);
  const reversalPenalty = clamp01(reversed / reviewCount);
  const activityBonus = reviewCount / (reviewCount + 10);

  const trustScore = clamp01(
    0.5 + 0.4 * (approvalRate - 2 * reversalPenalty) + 0.1 * activityBonus,
  );

  const explanation =
    `Trust ${round2(trustScore)} from ${reviewCount} review${reviewCount === 1 ? '' : 's'}: ` +
    `${Math.round(approvalRate * 100)}% approvals` +
    (reversed > 0 ? `, ${Math.round(reversalPenalty * 100)}% reversed (2x penalty)` : ', no reversals') +
    `, activity ${round2(activityBonus)}.`;

  return { trustScore: round2(trustScore), explanation };
}

// -----------------------------------------------------------------------------
// 2) applyReviewerVerdictToEvidence
// -----------------------------------------------------------------------------

/**
 * Verdict anchors (0..1) toward which a trusted human pulls the evidence
 * confidence. A higher trust pulls harder toward the anchor.
 *
 *   validated  : anchor 0.95 (lift toward strongly-confirmed)
 *   rejected   : anchor 0.15 (pull down hard toward refuted)
 *   needs_more : anchor 0.45 (mild reduction toward "not enough yet")
 *   disputed   : anchor 0.40 (moderate reduction + added uncertainty)
 *   pending    : unchanged (no human signal applied)
 *
 * Trust-weighted interpolation toward the anchor:
 *
 *   factor = clamp01(0.5 + 0.5 * reviewerTrust)        // 0.5 (no trust) .. 1.0 (full)
 *   result = clamp01( evidence + factor * (anchor - evidence) )
 *
 * SPEC EXAMPLE: applyReviewerVerdictToEvidence(0.75, 'validated', 0.5)
 *   factor = 0.5 + 0.5*0.5 = 0.75
 *   result = 0.75 + 0.75 * (0.95 - 0.75) = 0.75 + 0.15 = 0.90  ✓
 *
 * @param evidenceConfidence 0..1 evidence confidence to govern
 * @param verdict the human reviewer's verdict
 * @param reviewerTrust 0..1 (default 0.5 neutral)
 * @returns governed evidence confidence, 0..1
 */
export function applyReviewerVerdictToEvidence(
  evidenceConfidence: number,
  verdict: ReviewerVerdict,
  reviewerTrust = 0.5,
): number {
  const ev = clamp01(evidenceConfidence);
  const trust = clamp01(reviewerTrust);

  if (verdict === 'pending') return round2(ev);

  const ANCHORS: Record<Exclude<ReviewerVerdict, 'pending'>, number> = {
    validated: 0.95,
    rejected: 0.15,
    needs_more: 0.45,
    disputed: 0.4,
  };
  const anchor = ANCHORS[verdict];

  const factor = clamp01(0.5 + 0.5 * trust);
  const result = clamp01(ev + factor * (anchor - ev));
  return round2(result);
}

// -----------------------------------------------------------------------------
// 3) governedConfidence — the headline
// -----------------------------------------------------------------------------

/**
 * Blend weights & span for the governed confidence model:
 *
 *   baseline   = BASE_RESEARCH * research + BASE_EVIDENCE * evidence   // 0..100
 *                (an evidence-weighted-style 50/50 blend)
 *
 *   reviewerWeight = clamp01( reviewerTrust * countConfidence )        // 0..1
 *     where countConfidence = reviewCount / (reviewCount + REVIEW_SAT)  // saturating
 *     → no reviews ⇒ reviewerWeight 0 ⇒ baseline untouched.
 *
 *   governed   = clamp(
 *       baseline + reviewerWeight * (reviewerValidation - 0.5) * SPAN,
 *       0, 100)
 *
 * (reviewerValidation - 0.5) is centered: 0.5 ⇒ no move, 1 ⇒ +0.5*SPAN*weight,
 * 0 ⇒ -0.5*SPAN*weight. With SPAN=80 a fully-trusted, fully-validated review can
 * lift up to +40 pts; a fully-trusted rejection can drop up to -40 pts.
 */
const BASE_RESEARCH = 0.5;
const BASE_EVIDENCE = 0.5;
const SPAN = 80; // full peak-to-peak reviewer swing (pts) at weight 1
const REVIEW_SAT = 3; // reviews needed to reach ~half count-confidence
/** Validation within this band of 0.5 counts as "neutral / unreviewed". */
const NEUTRAL_BAND = 0.02;

export function governedConfidence(
  input: GovernanceInput,
): GovernedConfidenceResult {
  const research = clamp(input.researchConfidence, 0, 100);
  const evidence = clamp(input.evidenceConfidence, 0, 100);
  const reviewerValidation = clamp01(input.reviewerValidation);
  const reviewerTrust = clamp01(input.reviewerTrust ?? 0.5);
  const reviewCount = Math.max(0, Math.floor(input.reviewCount ?? 0));

  // --- baseline: research/evidence blend ------------------------------------
  const baseline = BASE_RESEARCH * research + BASE_EVIDENCE * evidence;

  // --- reviewer weight: trust x count-confidence ----------------------------
  const countConfidence = reviewCount / (reviewCount + REVIEW_SAT);
  const reviewerWeight = clamp01(reviewerTrust * countConfidence);

  // An item is "reviewed" only if a human actually weighed in (reviews > 0) AND
  // the signal is not perfectly neutral.
  const isNeutral = Math.abs(reviewerValidation - 0.5) <= NEUTRAL_BAND;
  const reviewed = reviewCount > 0 && reviewerWeight > 0 && !isNeutral;

  // --- reviewer adjustment (centered at 0.5) --------------------------------
  const reviewerAdjustment = reviewerWeight * (reviewerValidation - 0.5) * SPAN;

  const governed = clamp(baseline + reviewerAdjustment, 0, 100);
  const delta = governed - baseline;

  // --- effective weights (normalized, for transparency) ---------------------
  // Research & evidence share the (1 - reviewerWeight) remainder per BASE_*,
  // reviewer takes reviewerWeight.
  const remainder = 1 - reviewerWeight;
  const weights = {
    research: round2(BASE_RESEARCH * remainder),
    evidence: round2(BASE_EVIDENCE * remainder),
    reviewer: round2(reviewerWeight),
  };

  // --- explanation -----------------------------------------------------------
  const baseRounded = round1(baseline);
  const governedRounded = round1(governed);
  const direction =
    delta > 0.05 ? 'increased' : delta < -0.05 ? 'decreased' : 'unchanged';
  const headline =
    direction === 'unchanged'
      ? `Governed confidence unchanged at ${governedRounded} (baseline ${baseRounded}).`
      : `Governed confidence ${direction} ${baseRounded} → ${governedRounded}`;

  const explanation: string[] = [headline];

  if (!reviewed) {
    if (reviewCount === 0) {
      explanation.push('no human review yet — baseline carried through unchanged');
    } else if (isNeutral) {
      explanation.push('reviewers were neutral — no adjustment applied');
    } else {
      explanation.push('reviewer weight ~0 — baseline carried through');
    }
  } else if (reviewerValidation > 0.5) {
    explanation.push(
      `validated by reviewers (trust ${round2(reviewerTrust)}, ${reviewCount} review${reviewCount === 1 ? '' : 's'}) — lifts confidence`,
    );
  } else {
    explanation.push(
      `reviewer rejection (trust ${round2(reviewerTrust)}, ${reviewCount} review${reviewCount === 1 ? '' : 's'}) — drops confidence`,
    );
  }

  explanation.push(
    `baseline = 50% research (${round1(research)}) + 50% evidence (${round1(evidence)}) = ${baseRounded}`,
  );

  return {
    researchConfidence: round1(research),
    evidenceConfidence: round1(evidence),
    reviewerValidation: round2(reviewerValidation),
    governedConfidence: governedRounded,
    weights,
    delta: round1(delta),
    reviewed,
    explanation,
  };
}

// -----------------------------------------------------------------------------
// 4) aggregateReviewerValidation
// -----------------------------------------------------------------------------

/** A single app-level reviewer decision (the app's decision vocabulary). */
export interface ReviewerDecision {
  decision: 'APPROVE' | 'REJECT' | 'NEEDS_EVIDENCE' | 'ESCALATE';
  /** 0..1 — defaults to 0.5 (neutral trust) when omitted. */
  reviewerTrust?: number;
}

/**
 * Convert a set of reviewer decisions into the 0..1 reviewerValidation signal
 * consumed by governedConfidence(). Each decision maps to a 0..1 value, then we
 * take a TRUST-WEIGHTED MEAN:
 *
 *   APPROVE → 1.0, REJECT → 0.0, NEEDS_EVIDENCE → 0.35, ESCALATE → 0.4
 *
 *   value = Σ(trust_i * value_i) / Σ(trust_i)
 *
 * No decisions (or total trust 0) → 0.5 (neutral / unreviewed).
 */
export function aggregateReviewerValidation(
  decisions: readonly ReviewerDecision[],
): number {
  if (decisions.length === 0) return 0.5;

  const VALUE: Record<ReviewerDecision['decision'], number> = {
    APPROVE: 1.0,
    REJECT: 0.0,
    NEEDS_EVIDENCE: 0.35,
    ESCALATE: 0.4,
  };

  let weightedSum = 0;
  let trustSum = 0;
  for (const d of decisions) {
    const trust = clamp01(d.reviewerTrust ?? 0.5);
    weightedSum += trust * VALUE[d.decision];
    trustSum += trust;
  }

  if (trustSum === 0) return 0.5;
  return round2(clamp01(weightedSum / trustSum));
}
