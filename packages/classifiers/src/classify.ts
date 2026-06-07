// =============================================================================
// @hsi/classifiers — transparent rule/lexicon classifier + 5-level risk model.
// Explainable by design: every result lists the exact cues matched and where,
// so a human reviewer can audit (not trust a black box). Pure TS, no deps.
//
// DEFENSIVE USE ONLY. This supports media-literacy and safeguarding review of
// PUBLIC content. It must never be used to target or profile private people.
// =============================================================================

import { RHETORIC_TAXONOMY } from './taxonomy';
import type {
  MatchedCue,
  RecommendedAction,
  RhetoricCategory,
  RhetoricClassification,
  RhetoricResult,
  RiskAssessment,
  RiskLevelValue,
} from './types';

/** Find all occurrences of a cue (case-insensitive) with audit snippets. */
function findCue(haystackLower: string, original: string, cue: string): MatchedCue[] {
  const needle = cue.toLowerCase();
  const out: MatchedCue[] = [];
  let from = 0;
  for (;;) {
    const idx = haystackLower.indexOf(needle, from);
    if (idx === -1) break;
    const start = Math.max(0, idx - 24);
    const end = Math.min(original.length, idx + needle.length + 24);
    out.push({
      cue,
      index: idx,
      snippet: original.slice(start, end).trim(),
    });
    from = idx + needle.length;
  }
  return out;
}

/**
 * Confidence for a category: blends distinct-cue coverage with total cue
 * density, lightly normalized by text length so a single keyword in a long
 * document doesn't read as high confidence. Always 0..1, conservative.
 */
function categoryConfidence(
  category: RhetoricCategory,
  distinctCues: number,
  totalHits: number,
  textTokens: number,
): number {
  if (distinctCues === 0) return 0;
  const coverage = distinctCues / category.exampleCues.length; // 0..1
  const density = Math.min(1, totalHits / Math.max(8, textTokens / 12));
  const raw = 0.6 * coverage + 0.4 * density;
  // Distinct multi-cue matches are more trustworthy than a lone hit.
  const distinctBoost = distinctCues >= 2 ? 1 : 0.7;
  return Math.max(0, Math.min(1, raw * distinctBoost));
}

const NOISE_FLOOR = 0.12;

/**
 * Classify text against the rhetoric taxonomy.
 * @param text  The PUBLIC text to analyze.
 * @param extraTaxonomy Optional custom categories (unlimited) merged in.
 * @returns ranked categories with matched cues + per-category confidence.
 */
export function classifyRhetoric(
  text: string,
  extraTaxonomy: RhetoricCategory[] = [],
): RhetoricResult {
  const taxonomy = [...RHETORIC_TAXONOMY, ...extraTaxonomy];
  const lower = text.toLowerCase();
  const textTokens = lower.split(/\s+/).filter(Boolean).length;

  const classifications: RhetoricClassification[] = [];
  for (const category of taxonomy) {
    const matchedCues: MatchedCue[] = [];
    let distinct = 0;
    for (const cue of category.exampleCues) {
      const hits = findCue(lower, text, cue);
      if (hits.length) {
        distinct += 1;
        matchedCues.push(...hits);
      }
    }
    if (matchedCues.length === 0) continue;
    const confidence = categoryConfidence(category, distinct, matchedCues.length, textTokens);
    if (confidence < NOISE_FLOOR) continue;
    classifications.push({
      slug: category.slug,
      label: category.label,
      severityHint: category.severityHint,
      confidence,
      matchedCues,
    });
  }

  classifications.sort((a, b) => b.confidence - a.confidence);
  return {
    classifications,
    inconclusive: classifications.length === 0,
  };
}

// -----------------------------------------------------------------------------
// 5-level risk model
// -----------------------------------------------------------------------------

const SEVERITY_RANK: Record<RhetoricCategory['severityHint'], number> = {
  context: 0,
  low: 1,
  medium: 2,
  high: 3,
  severe: 4,
};

// Level-5: explicit harm encouragement / coercion / operational danger.
const LEVEL_5_CUES = [
  'kill yourself', 'kill themselves', 'you should die', 'end your life',
  'how to kill', 'make a bomb', 'attack the', 'we will hurt', 'eliminate them',
  'take them out', 'bring weapons', 'operational plan', 'target the',
];
// Level-4: vulnerable-person targeting / self-harm-adjacent.
const LEVEL_4_CUES = [
  'if you feel worthless', 'you would be better off gone', 'no reason to keep living',
  'if you want it to stop', 'when life feels meaningless', 'for those in pain',
  'you have nothing to live for', 'painless way to',
];
// Level-3: recruitment / activism mobilization.
const LEVEL_3_CUES = [
  'join us', 'join the movement', 'become a member', 'rise up', 'take to the streets',
  'mobilize', 'sign up to', 'dm me to join', 'recruit',
];
// Level-2: pessimistic / hopeless rhetoric.
const LEVEL_2_CUES = [
  'there is no hope', 'we are doomed', 'nothing will change', 'why bother', 'no future',
  'humanity is a mistake', 'inevitable collapse',
];

const MANDATORY_SAFETY_NOTES = [
  'Defensive analysis only: assess the IDEA/message, never profile or target a private individual.',
  'If content references self-harm or a person at risk, route to human safeguarding review immediately.',
  'This automated level is a triage signal, not a verdict — a human reviewer must confirm before any action or publication.',
];

function firstQuoteFor(text: string, cues: string[]): string {
  const lower = text.toLowerCase();
  for (const cue of cues) {
    const idx = lower.indexOf(cue);
    if (idx !== -1) {
      const start = Math.max(0, idx - 16);
      const end = Math.min(text.length, idx + cue.length + 40);
      return text.slice(start, end).trim();
    }
  }
  return '';
}

const ACTION_BY_LEVEL: Record<RiskLevelValue, RecommendedAction> = {
  1: 'monitor_context',
  2: 'log_for_media_literacy',
  3: 'review_recruitment_activity',
  4: 'escalate_safeguarding',
  5: 'urgent_human_review',
};

/**
 * Assign a 1-5 risk level using cue matches + the rhetoric classifications.
 * Conservative and explainable; always returns the mandatory safety notes.
 *
 *  1 philosophical discussion
 *  2 pessimistic rhetoric
 *  3 recruitment / activism
 *  4 vulnerable-person targeting or self-harm-adjacent
 *  5 explicit harm encouragement / coercive / operational danger
 */
export function scoreRisk(
  text: string,
  classifications: RhetoricClassification[] = [],
): RiskAssessment {
  const lower = text.toLowerCase();
  const hit = (cues: string[]) => cues.some((c) => lower.includes(c));

  let level: RiskLevelValue;
  let matchedQuote: string;
  let explanation: string;
  let confidence: number;

  const maxSeverity = classifications.reduce(
    (m, c) => Math.max(m, SEVERITY_RANK[c.severityHint]),
    0,
  );

  if (hit(LEVEL_5_CUES)) {
    level = 5;
    matchedQuote = firstQuoteFor(text, LEVEL_5_CUES);
    explanation = 'Explicit encouragement of harm, coercion, or operational danger detected. Highest-priority human review required.';
    confidence = 0.9;
  } else if (hit(LEVEL_4_CUES) || classifications.some((c) => c.slug === 'vulnerable-audience-targeting')) {
    level = 4;
    matchedQuote = firstQuoteFor(text, LEVEL_4_CUES) || classifications.find((c) => c.slug === 'vulnerable-audience-targeting')?.matchedCues[0]?.snippet || '';
    explanation = 'Language targeting vulnerable people or adjacent to self-harm detected. Route to safeguarding review.';
    confidence = 0.8;
  } else if (hit(LEVEL_3_CUES) || classifications.some((c) => c.slug === 'recruitment-language')) {
    level = 3;
    matchedQuote = firstQuoteFor(text, LEVEL_3_CUES) || classifications.find((c) => c.slug === 'recruitment-language')?.matchedCues[0]?.snippet || '';
    explanation = 'Recruitment or activism mobilization language detected. Review for organized campaign activity.';
    confidence = 0.7;
  } else if (hit(LEVEL_2_CUES) || maxSeverity >= SEVERITY_RANK.medium) {
    level = 2;
    matchedQuote = firstQuoteFor(text, LEVEL_2_CUES) || classifications[0]?.matchedCues[0]?.snippet || '';
    explanation = 'Pessimistic or hopelessness-amplifying rhetoric detected without recruitment or targeting signals.';
    confidence = 0.6;
  } else {
    level = 1;
    matchedQuote = classifications[0]?.matchedCues[0]?.snippet || '';
    explanation = 'Reads as philosophical or discursive framing without recruitment, targeting, or harm signals.';
    confidence = classifications.length ? 0.55 : 0.4;
  }

  return {
    level,
    matchedQuote,
    explanation,
    confidence,
    recommendedAction: ACTION_BY_LEVEL[level],
    safetyNotes: MANDATORY_SAFETY_NOTES,
  };
}

/** One-call convenience: classify then risk-score. */
export function analyzeText(
  text: string,
  extraTaxonomy: RhetoricCategory[] = [],
): { rhetoric: RhetoricResult; risk: RiskAssessment } {
  const rhetoric = classifyRhetoric(text, extraTaxonomy);
  const risk = scoreRisk(text, rhetoric.classifications);
  return { rhetoric, risk };
}
