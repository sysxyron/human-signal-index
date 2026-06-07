// =============================================================================
// score.ts — deterministic scoring: reliability (by publication type), lexical
// relevance, support typing, and combined confidence. ALL PURE. No randomness.
//
// HONESTY RULES (Phase 4): weak evidence must never upgrade a speculative,
// fictional, or physics-violating claim to 'supports'. A claim with no result
// above the relevance floor is 'unsupported' — we never fabricate support.
// =============================================================================

import type { Claim, ScientificConfidenceTier } from '@hsi/research-agents';
import type {
  EvidenceQuery,
  EvidenceResult,
  PublicationType,
  ReliabilityTier,
  SupportType,
} from './types';

/** Base reliability [0..1] inferred purely from the publication class. */
export function reliabilityFromPublicationType(t: PublicationType): number {
  switch (t) {
    case 'peer-reviewed':
      return 0.95;
    case 'review':
      return 0.9;
    case 'dataset':
      return 0.7;
    case 'preprint':
      return 0.6;
    case 'encyclopedia':
      return 0.45;
    case 'web':
      return 0.3;
    case 'unknown':
    default:
      return 0.2;
  }
}

/**
 * Bucket a reliability score into a tier. With no backing citation the result is
 * 'unsupported' regardless of score (a number with nothing behind it).
 */
export function reliabilityTier(score: number, hasCitation: boolean): ReliabilityTier {
  if (!hasCitation) return 'unsupported';
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  if (score > 0) return 'low';
  return 'unsupported';
}

/** Lower-cased alphanumeric tokens, stop-words removed, deduped. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by',
  'is', 'are', 'be', 'as', 'at', 'that', 'this', 'it', 'its', 'from', 'into',
  'than', 'then', 'over', 'under', 'how', 'why', 'what', 'which', 'can', 'may',
  'will', 'do', 'does', 'has', 'have', 'we', 'they', 'their', 'about',
]);

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/**
 * Deterministic lexical relevance [0..1]: Jaccard similarity of the query tokens
 * (text + topics) against the result tokens (title + abstract + topics).
 */
export function relevanceScore(query: EvidenceQuery, result: EvidenceResult): number {
  const queryText = [query.text, ...(query.topics ?? [])].join(' ');
  const resultTopics = extractResultTopics(result);
  const resultText = [result.title, result.abstract ?? '', ...resultTopics].join(' ');

  const q = tokenize(queryText);
  const r = tokenize(resultText);
  if (q.size === 0 || r.size === 0) return 0;

  let intersection = 0;
  for (const token of q) {
    if (r.has(token)) intersection++;
  }
  const union = q.size + r.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

/** Topic tags a fixture (or provider) may attach in `raw.topics`. */
export function extractResultTopics(result: EvidenceResult): string[] {
  const raw = result.raw;
  if (raw && typeof raw === 'object' && 'topics' in raw) {
    const topics = (raw as { topics?: unknown }).topics;
    if (Array.isArray(topics)) {
      return topics.filter((t): t is string => typeof t === 'string');
    }
  }
  return [];
}

/** An explicit stance a fixture may declare in `raw.stance` to drive typing. */
export function extractStance(result: EvidenceResult): SupportType | undefined {
  const raw = result.raw;
  if (raw && typeof raw === 'object' && 'stance' in raw) {
    const stance = (raw as { stance?: unknown }).stance;
    if (stance === 'supports' || stance === 'contradicts' || stance === 'background') {
      return stance;
    }
  }
  return undefined;
}

/** Tiers where weak/lexical evidence must NOT be promoted to 'supports'. */
const HONESTY_CAPPED_TIERS: ReadonlySet<ScientificConfidenceTier> = new Set([
  'speculative',
  'fictional',
  'violates-known-physics',
]);

/** Relevance floor above which a match counts as more than just background. */
export const RELEVANCE_SUPPORT_THRESHOLD = 0.18;

/** Contradiction cue words for the (rare) case a fixture has no explicit stance. */
const CONTRADICTION_CUES = /\b(no evidence|contradict|refut|disprov|debunk|falsif|fails to|does not support|inconsistent with)\b/i;

/**
 * Decide how a result relates to a claim. Deterministic.
 *
 * Order of precedence:
 *  1. An explicit fixture stance ('supports'|'contradicts'|'background') wins —
 *     BUT a 'supports' stance is still honesty-capped for ungrounded claim tiers
 *     (only an explicit fixture support survives; lexical guesses do not).
 *  2. Textual contradiction cues in the abstract -> 'contradicts'.
 *  3. High relevance -> 'supports' (subject to the honesty cap).
 *  4. Some-but-low relevance -> 'background'.
 *  5. Otherwise 'unclear'.
 */
export function supportTypeFor(
  claim: Claim,
  result: EvidenceResult,
  relevance: number,
): SupportType {
  const capped = HONESTY_CAPPED_TIERS.has(claim.tier);
  const stance = extractStance(result);

  if (stance === 'contradicts') return 'contradicts';
  if (stance === 'supports') {
    // An explicit fixture support is allowed even for capped tiers — it is a
    // curated, deliberate assertion, not a weak lexical guess.
    return 'supports';
  }
  if (stance === 'background') return 'background';

  // No explicit stance: fall back to heuristics.
  const haystack = `${result.title} ${result.abstract ?? ''}`;
  if (CONTRADICTION_CUES.test(haystack)) return 'contradicts';

  if (relevance >= RELEVANCE_SUPPORT_THRESHOLD) {
    // Honesty: never auto-upgrade ungrounded claims to 'supports' on lexical
    // overlap alone — the strongest we allow without an explicit stance is
    // 'background'.
    return capped ? 'background' : 'supports';
  }
  if (relevance > 0) return 'background';
  return 'unclear';
}

/**
 * Combined per-result confidence [0..1] that this source backs the claim as
 * classified. Reliability and relevance are weighted, then scaled by how strong
 * the support relationship is.
 */
export function confidenceFor(
  reliability: number,
  relevance: number,
  supportType: SupportType,
): number {
  const base = reliability * 0.55 + relevance * 0.45;
  const factor =
    supportType === 'supports' || supportType === 'contradicts'
      ? 1
      : supportType === 'background'
        ? 0.5
        : 0.2; // 'unclear'
  return clamp01(base * factor);
}

/** Clamp a number into [0,1]. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
