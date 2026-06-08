// =============================================================================
// @hsi/research-agents — evidence-weighted consensus (WorldForge Phase 5)
// ADDITIVE layer applied by the app AFTER evidence is gathered. It does NOT
// touch buildConsensusReport/consensusAgent (which score on agent confidence
// only). Here we blend that "research" confidence with an EVIDENCE confidence
// derived from how many claims the gathered evidence actually supported,
// contradicted, or left unsupported — and explain, in plain language, exactly
// why the final score moved up or down.
//
// IMPORTANT: this file deliberately defines its OWN plain input shape
// (EvidenceWeightInput) and does NOT import from '@hsi/evidence-engine'.
// '@hsi/evidence-engine' imports '@hsi/research-agents', so importing it back
// would create a dependency CYCLE. The app passes us a plain stats object.
//
// Pure, deterministic (no Date.now / Math.random), zero runtime deps.
// =============================================================================

import type { ConsensusReport } from '../types';

/** Clamp `n` into the inclusive range [lo, hi]. */
const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/** Round to one decimal place (matches the rest of the package's reporting). */
const round1 = (n: number): number => Math.round(n * 10) / 10;

// -----------------------------------------------------------------------------
// Input / output shapes
// -----------------------------------------------------------------------------

/**
 * Plain, dependency-free summary of the evidence gathered for a research run.
 * Produced by the app from whatever evidence pipeline it uses (e.g.
 * '@hsi/evidence-engine') and handed to this layer. We intentionally accept a
 * flat numeric shape so this package never has to import the evidence package.
 */
export interface EvidenceWeightInput {
  /** Total number of claims that evidence was sought for. */
  totalClaims: number;
  /** Claims with at least one corroborating piece of evidence. */
  supported: number;
  /** Claims that gathered evidence actively contradicts. */
  contradicted: number;
  /** Claims matched only by tangential / background context (neutral). */
  background: number;
  /** Claims for which no evidence was found at all. */
  unsupported: number;
  /** 0..100 — how much of the claim space the evidence search covered. */
  coverageScore: number;
}

/** The blended, explained result of weighting research confidence by evidence. */
export interface EvidenceWeightedResult {
  /** 0..100 — the original agent/consensus confidence (unchanged input). */
  researchConfidence: number;
  /** 0..100 — confidence derived purely from the evidence statistics. */
  evidenceConfidence: number;
  /** 0..100 — the blended final confidence the app should display/use. */
  evidenceWeightedConfidence: number;
  /** 0..1 — supported / totalClaims. */
  supportRatio: number;
  /** 0..1 — contradicted / totalClaims. */
  contradictionRatio: number;
  /** 0..1 — unsupported / totalClaims. */
  unsupportedRatio: number;
  /** 0..100 — echoed coverage score for convenience. */
  coverageScore: number;
  /** evidenceWeightedConfidence - researchConfidence (signed). */
  delta: number;
  /** Human-readable "why the score changed" reasons. First entry is the headline. */
  explanation: string[];
}

// -----------------------------------------------------------------------------
// Tunable weights (documented so the app/docs can describe the model)
// -----------------------------------------------------------------------------

/**
 * evidenceConfidence formula (all terms 0..1 before the *100):
 *
 *   evidenceConfidence =
 *       100 * clamp(
 *           SUPPORT_WEIGHT   * supportRatio
 *         + COVERAGE_WEIGHT  * (coverageScore / 100)
 *         - CONTRADICT_PENALTY * contradictionRatio   // heavy
 *         - UNSUPPORTED_PENALTY * unsupportedRatio,    // moderate
 *         0, 1)
 *
 * Support and coverage are the only POSITIVE terms and together can reach 1.0
 * (0.7 + 0.3). Contradictions are penalised ~2x harder than unsupported claims,
 * so contradictions pull the score down faster than mere absence of evidence.
 */
const SUPPORT_WEIGHT = 0.7;
const COVERAGE_WEIGHT = 0.3;
const CONTRADICT_PENALTY = 1.1; // heavy — contradicted claims are worst case
const UNSUPPORTED_PENALTY = 0.55; // moderate — absence of evidence, not evidence of absence

/**
 * Blend weights for evidenceWeightedConfidence. The base blend is a weighted
 * mean of research and evidence confidence. On top of that, evidence can shove
 * the result beyond the plain mean in two directions:
 *
 *   - strong, well-covered, multi-source SUPPORT applies an upward BONUS,
 *   - any CONTRADICTION applies a downward DRAG.
 *
 * This guarantees the spec examples: all-unsupported evidence pulls a high
 * research score well DOWN, and 6-source support pulls a mid research score UP.
 */
const RESEARCH_BLEND = 0.5; // weight on the original research confidence
const EVIDENCE_BLEND = 0.5; // weight on the evidence-derived confidence
const SUPPORT_BONUS_MAX = 12; // max extra points from strong corroboration
const CONTRADICTION_DRAG_MAX = 25; // max points removed by contradictions
/** Sources at/above this count count as "strong multi-source" support. */
const STRONG_SOURCE_THRESHOLD = 3;

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

/**
 * Blend an agent/consensus confidence with an evidence-derived confidence and
 * explain the move. See the formula comments above for the exact model.
 *
 * @param researchConfidence 0..100 original confidence (e.g. report.overallConfidence)
 * @param evidence flat evidence statistics (NOT an evidence-engine import)
 */
export function evidenceWeightedConsensus(
  researchConfidence: number,
  evidence: EvidenceWeightInput,
): EvidenceWeightedResult {
  const research = clamp(researchConfidence, 0, 100);
  const total = Math.max(0, evidence.totalClaims);
  const coverageScore = clamp(evidence.coverageScore, 0, 100);

  // --- guard: no claims / no evidence ---------------------------------------
  if (total === 0) {
    // Neutral evidence confidence; we have nothing to corroborate or refute, so
    // the final stays equal to the research confidence (delta 0).
    const explanation = [
      `Confidence unchanged at ${round1(research)} (no claims/evidence to weigh).`,
      'No claims were submitted for evidence gathering; evidence is neutral.',
    ];
    return {
      researchConfidence: round1(research),
      evidenceConfidence: 50,
      evidenceWeightedConfidence: round1(research),
      supportRatio: 0,
      contradictionRatio: 0,
      unsupportedRatio: 0,
      coverageScore,
      delta: 0,
      explanation,
    };
  }

  // --- ratios ----------------------------------------------------------------
  const supportRatio = clamp(evidence.supported / total, 0, 1);
  const contradictionRatio = clamp(evidence.contradicted / total, 0, 1);
  const unsupportedRatio = clamp(evidence.unsupported / total, 0, 1);

  // --- evidenceConfidence (0..100) ------------------------------------------
  const evidenceConfidence01 = clamp(
    SUPPORT_WEIGHT * supportRatio +
      COVERAGE_WEIGHT * (coverageScore / 100) -
      CONTRADICT_PENALTY * contradictionRatio -
      UNSUPPORTED_PENALTY * unsupportedRatio,
    0,
    1,
  );
  const evidenceConfidence = clamp(evidenceConfidence01 * 100, 0, 100);

  // --- evidenceWeightedConfidence (0..100) ----------------------------------
  // 1) weighted mean of research + evidence confidence.
  const base = RESEARCH_BLEND * research + EVIDENCE_BLEND * evidenceConfidence;

  // 2) upward bonus for strong, well-covered support. Scales with supportRatio
  //    and coverage; only meaningful when most claims are genuinely supported.
  const supportBonus = SUPPORT_BONUS_MAX * supportRatio * (coverageScore / 100);

  // 3) downward drag for contradictions (always wins ties against support).
  const contradictionDrag = CONTRADICTION_DRAG_MAX * contradictionRatio;

  const evidenceWeightedConfidence = clamp(
    base + supportBonus - contradictionDrag,
    0,
    100,
  );

  // --- explanation -----------------------------------------------------------
  const finalRounded = round1(evidenceWeightedConfidence);
  const researchRounded = round1(research);
  const delta = round1(evidenceWeightedConfidence - research);

  const direction =
    delta < 0 ? 'decreased' : delta > 0 ? 'increased' : 'unchanged';
  const headline =
    delta === 0
      ? `Confidence unchanged at ${researchRounded} after weighting evidence.`
      : `Confidence ${direction} from ${researchRounded} → ${finalRounded}`;

  const explanation: string[] = [headline];

  if (evidence.contradicted > 0) {
    explanation.push(
      `${evidence.contradicted} contradiction${evidence.contradicted === 1 ? '' : 's'} (pulls confidence down hard)`,
    );
  }
  if (coverageScore < 50) {
    explanation.push(`low evidence coverage (${round1(coverageScore)}/100)`);
  }
  if (evidence.unsupported > 0) {
    explanation.push(
      `${evidence.unsupported} unsupported claim${evidence.unsupported === 1 ? '' : 's'} (no evidence found)`,
    );
  }
  if (evidence.supported >= STRONG_SOURCE_THRESHOLD && supportRatio >= 0.5) {
    explanation.push(
      `strong support from ${evidence.supported} sources (lifts confidence)`,
    );
  } else if (evidence.supported > 0) {
    explanation.push(`partial support from ${evidence.supported} source${evidence.supported === 1 ? '' : 's'}`);
  }
  if (coverageScore >= 50) {
    explanation.push(`evidence coverage ${round1(coverageScore)}/100`);
  }

  return {
    researchConfidence: researchRounded,
    evidenceConfidence: round1(evidenceConfidence),
    evidenceWeightedConfidence: finalRounded,
    supportRatio: round1(supportRatio * 100) / 100,
    contradictionRatio: round1(contradictionRatio * 100) / 100,
    unsupportedRatio: round1(unsupportedRatio * 100) / 100,
    coverageScore,
    delta,
    explanation,
  };
}

/**
 * Apply the evidence-weighting to a finished ConsensusReport. Returns a COPY of
 * the report (input is not mutated) with the evidence-weighted block attached
 * and the explanation appended to blueprintNotes. researchConfidence is taken
 * from report.overallConfidence.
 */
export function applyEvidenceToConsensus(
  report: ConsensusReport,
  evidence: EvidenceWeightInput,
): ConsensusReport & { evidenceWeighted: EvidenceWeightedResult } {
  const evidenceWeighted = evidenceWeightedConsensus(
    report.overallConfidence,
    evidence,
  );
  return {
    ...report,
    // copy arrays so callers can't observe mutation of the original report.
    keyFindings: [...report.keyFindings],
    openDisputes: [...report.openDisputes],
    recommendedParameters: { ...report.recommendedParameters },
    classificationBreakdown: { ...report.classificationBreakdown },
    blueprintNotes: [
      ...report.blueprintNotes,
      'Evidence-weighted confidence:',
      ...evidenceWeighted.explanation,
    ],
    evidenceWeighted,
  };
}
