// =============================================================================
// @hsi/source-intelligence — deterministic signal classifier.
//
// Rule/lexicon based, fully deterministic, no model/network. Maps a signal to a
// SignalType + SignalCategory with a calibrated confidence, runner-up
// categories, and a human-readable rationale.
//
// PRESERVE UNCERTAINTY: when nothing matches strongly, we return category
// 'other' with LOW confidence and say so in the rationale. We NEVER force
// certainty. Unlimited custom categories are supported via `extraCategories`.
// =============================================================================

import { clamp, round, snippet, tokenize } from '../internal/text';
import type { Classification, SignalType } from '../types';
import { CATEGORY_LEXICONS, type CategoryLexicon, SIGNAL_TYPE_BY_SOURCE } from './lexicons';

export interface ClassifyInput {
  title: string;
  bodyText?: string;
  /** Source type drives SignalType inference (article/video/etc.). */
  sourceType?: string;
  /** Extra custom categories: each becomes a single-term lexicon (the name). */
  extraCategories?: string[];
}

interface Scored {
  category: string;
  score: number;
  hits: string[];
}

/** Build the working lexicon list = builtins + custom categories. */
function lexiconsFor(extra?: string[]): CategoryLexicon[] {
  const base = CATEGORY_LEXICONS;
  if (!extra || extra.length === 0) return base;
  const customs: CategoryLexicon[] = extra
    .filter((c) => c && c.trim())
    .map((c) => ({ category: c.trim(), terms: [c.trim().toLowerCase()] }));
  return [...base, ...customs];
}

/** Count term hits for one lexicon over a normalized lowercased text. */
function scoreLexicon(lex: CategoryLexicon, haystack: string, tokenJoin: string): Scored {
  const hits: string[] = [];
  let raw = 0;
  for (const term of lex.terms) {
    const t = term.toLowerCase();
    const found = t.includes(' ')
      ? haystack.includes(t) // multi-word phrase: substring on normalized text
      : new RegExp(`(?:^| )${escapeRegex(t)}(?: |$)`).test(tokenJoin); // word-boundary
    if (found) {
      hits.push(term);
      // Phrase matches and earlier (more specific) terms weigh a bit more.
      raw += t.includes(' ') ? 2 : 1;
    }
  }
  return { category: lex.category, score: raw, hits };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferSignalType(sourceType: string | undefined): SignalType {
  const mapped = sourceType ? SIGNAL_TYPE_BY_SOURCE[sourceType] : undefined;
  return (mapped as SignalType) ?? 'article';
}

/**
 * Classify a signal deterministically. Confidence is derived from the winning
 * category's lead over runners-up and the absolute number of hits, then clamped.
 * No strong match → 'other' at low confidence.
 *
 * `now` is accepted for signature symmetry with other engine functions; the
 * classifier itself is time-independent.
 */
export function classifySignal(input: ClassifyInput, _now?: string): Classification {
  const text = `${input.title}\n${input.bodyText ?? ''}`;
  const haystack = text.toLowerCase();
  // Token join padded with spaces so word-boundary regex works at edges.
  const tokenJoin = ` ${tokenize(text).join(' ')} `;

  const lexicons = lexiconsFor(input.extraCategories);
  const scored = lexicons
    .map((lex) => scoreLexicon(lex, haystack, tokenJoin))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

  const signalType = inferSignalType(input.sourceType);

  if (scored.length === 0) {
    return {
      signalType,
      signalCategory: 'other',
      confidence: 0.1,
      alternativeCategories: [],
      rationale:
        'No category lexicon matched with sufficient strength; classified as "other" with low confidence (uncertainty preserved — not forced).',
    };
  }

  const top = scored[0];
  const totalScore = scored.reduce((s, x) => s + x.score, 0);
  const share = top.score / totalScore; // 0..1 dominance among matched categories
  // Confidence: blend dominance with an evidence factor (more hits => surer),
  // capped well below 1 to keep epistemic humility.
  const evidence = clamp(top.score / 4, 0, 1);
  const confidence = round(clamp(0.35 + 0.4 * share + 0.2 * evidence, 0, 0.95));

  const alternativeCategories = scored
    .slice(1, 4)
    .map((s) => ({ category: s.category, score: s.score }));

  const rationale =
    `Matched ${top.hits.length} term(s) for "${top.category}" ` +
    `(${snippet(top.hits.join(', '), 80)}); ` +
    `dominance ${round(share)} over ${scored.length - 1} other matched categor${scored.length - 1 === 1 ? 'y' : 'ies'}.`;

  return {
    signalType,
    signalCategory: top.category,
    confidence,
    alternativeCategories,
    rationale,
  };
}
