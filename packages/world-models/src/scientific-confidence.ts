// =============================================================================
// @hsi/simulation-engine — scientific confidence engine
// Classify any statement / value into a confidence tier so the UI can colour it
// from "this is textbook physics" (green) to "this breaks known physics" (red).
// Every graph node may carry a ScientificConfidence tag.
// =============================================================================

/** Confidence tiers, ordered from most to least grounded. */
export type ScientificConfidenceTier =
  | 'known-science' // textbook, observed, reproducible
  | 'plausible-science' // consistent with physics, not yet observed
  | 'speculative' // imaginable, no evidence, no contradiction
  | 'fictional' // narrative device, not claimed as real
  | 'violates-known-physics'; // contradicts established physics

/** A classified statement with a numeric score and a UI colour token. */
export interface ScientificConfidence {
  tier: ScientificConfidenceTier;
  /** 0..1 — how confident we are this statement is physically real. */
  confidence: number;
  /** UI colour token (Tailwind-ish), green -> red as confidence drops. */
  color: string;
  /** Human-readable justification for the classification. */
  reason: string;
}

const TIER_META: Record<
  ScientificConfidenceTier,
  { confidence: number; color: string }
> = {
  'known-science': { confidence: 0.97, color: 'emerald-500' },
  'plausible-science': { confidence: 0.72, color: 'lime-500' },
  speculative: { confidence: 0.4, color: 'amber-500' },
  fictional: { confidence: 0.15, color: 'orange-500' },
  'violates-known-physics': { confidence: 0.02, color: 'red-600' },
};

/** Build a ScientificConfidence from a tier (+ optional override reason). */
export function scientificConfidence(
  tier: ScientificConfidenceTier,
  reason: string,
): ScientificConfidence {
  const meta = TIER_META[tier];
  return { tier, confidence: meta.confidence, color: meta.color, reason };
}

/** A keyword rule that maps matched phrasing to a tier. */
interface ConfidenceRule {
  test: RegExp;
  tier: ScientificConfidenceTier;
  reason: string;
}

// Ordered: the FIRST matching rule wins, so hard physics violations and known
// science are checked before softer "speculative" catch-alls.
const RULES: ConfidenceRule[] = [
  {
    test: /\b(faster[-\s]?than[-\s]?light|ftl|warp drive|perpetual motion|infinite energy|time travel to the past)\b/i,
    tier: 'violates-known-physics',
    reason: 'Contradicts relativity / thermodynamics as currently understood.',
  },
  {
    test: /\b(negative mass|reactionless drive|over[-\s]?unity)\b/i,
    tier: 'violates-known-physics',
    reason: 'Requires exotic conditions inconsistent with conservation laws.',
  },
  {
    test: /\b(liquid water|habitable zone|carbon[-\s]?based life|main[-\s]?sequence|escape velocity|greenhouse effect|plate tectonics)\b/i,
    tier: 'known-science',
    reason: 'Well-established, observed and reproducible physical/biological science.',
  },
  {
    test: /\b(silicon[-\s]?based life|ammonia solvent|methane solvent|panspermia|subsurface ocean|tidally locked habitability)\b/i,
    tier: 'plausible-science',
    reason: 'Physically consistent and actively researched, but not yet observed.',
  },
  {
    test: /\b(crystal genetics|mineral neural|geological cognition|exotic matter biology|silicate metabolism)\b/i,
    tier: 'speculative',
    reason: 'Imaginable and not obviously forbidden, but lacks any empirical basis.',
  },
  {
    test: /\b(magic|deity|prophecy|chosen one|elder god)\b/i,
    tier: 'fictional',
    reason: 'Narrative device with no claim to physical reality.',
  },
];

/** Classify a free-text statement into a ScientificConfidence using rules. */
export function classifyStatement(input: string): ScientificConfidence {
  for (const rule of RULES) {
    if (rule.test.test(input)) {
      return scientificConfidence(rule.tier, rule.reason);
    }
  }
  // Default: nothing matched -> treat as plausible-but-unverified speculation.
  return scientificConfidence(
    'speculative',
    'No rule matched; treated as unverified speculation by default.',
  );
}

/** Convenience tier constructors used when wiring graph nodes. */
export const KNOWN = (reason: string): ScientificConfidence =>
  scientificConfidence('known-science', reason);
export const PLAUSIBLE = (reason: string): ScientificConfidence =>
  scientificConfidence('plausible-science', reason);
export const SPECULATIVE = (reason: string): ScientificConfidence =>
  scientificConfidence('speculative', reason);
export const FICTIONAL = (reason: string): ScientificConfidence =>
  scientificConfidence('fictional', reason);
export const VIOLATES = (reason: string): ScientificConfidence =>
  scientificConfidence('violates-known-physics', reason);
