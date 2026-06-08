// =============================================================================
// @hsi/source-intelligence — SEMANTIC signal classifier (Phase 8).
//
// ENRICHES the deterministic Phase-7 lexical `classifySignal`. It ALWAYS runs
// the lexical classifier (for `matchedTerms` and as the fallback) and, WHEN an
// `embed` fn is provided, ALSO embeds the signal text + a short prototype
// description per category and ranks categories by cosine similarity.
//
// FALLBACK (documented):
//   * No `deps.embed`            → pure lexical result; semanticNeighbors = [].
//   * `embed` throws / bad shape → caught; pure lexical result (never throws).
//   * `embed` succeeds           → merge: prefer the semantic winner ONLY when it
//                                  is confident AND not contradicted by a clearly
//                                  stronger lexical signal; otherwise defer to
//                                  lexical. Ambiguity → 'other' at low confidence.
//
// PRESERVE UNCERTAINTY: we never force a category. If neither lexical nor
// semantic evidence is strong, we return 'other' with low confidence and say so.
// Deterministic: no Date.now()/Math.random(); embeddings only via injected fn.
// =============================================================================

import { classifySignal } from '../classify';
import { CATEGORY_LEXICONS } from '../classify/lexicons';
import { clamp, round, snippet } from '../internal/text';
import { cosine01 } from '../internal/vector';
import type { SemanticClassification, SemanticDeps } from './types';

export interface SemanticClassifyInput {
  title: string;
  bodyText?: string;
  sourceType?: string;
  extraCategories?: string[];
}

/** A short, neutral prototype description per built-in category for embedding. */
const CATEGORY_PROTOTYPES: Record<string, string> = {
  extinction:
    'human extinction, voluntary human extinction, extinctionism, efilism, antinatalism, promortalism, ending humanity',
  population:
    'population reduction, depopulation, overpopulation, population control, fertility decline, demographic collapse, Malthusian limits',
  collapse:
    'societal collapse, civilizational collapse, systemic breakdown of society, collapsology, doom, end times',
  ideology: 'ideology, worldview, doctrine, manifesto, belief system, dogma, creed',
  movement:
    'social movement, grassroots organizing, activism, mobilization, protest, coalition, campaign',
  recruitment:
    'recruitment, join the cause, become a member, enlist, call to action, onboarding new members',
  propaganda:
    'propaganda, agitprop, astroturfing, talking points, narrative warfare, information operation, psyop',
  misinformation:
    'misinformation, false or misleading claims, debunked hoaxes, unverified rumors, fact-checking',
  disinformation:
    'disinformation, deliberate falsehoods, coordinated inauthentic behavior, influence campaign, deepfakes',
  technology:
    'artificial intelligence, AI safety, AI governance, AI alignment, superintelligence, automation, biotech, gene editing',
  religion:
    'religion, apocalyptic eschatology, prophecy, salvation, scripture, cults, the rapture, divine messianism',
  politics:
    'politics, elections, government policy, legislation, authoritarianism, democracy, regimes',
  economics:
    'economics, inflation, recession, market crash, unemployment, debt crisis, financial collapse',
  civilization:
    'the future of civilization, humanity, longtermism, existential risk, the great filter, the survival of the species',
  narrative:
    'technocracy, technocratic governance, world government, global governance, great reset, social credit, new world order',
};

/** Build the label/text prototype pairs (built-ins + custom categories). */
function prototypesFor(extra?: string[]): { label: string; text: string }[] {
  const base = CATEGORY_LEXICONS.map((lex) => ({
    label: lex.category,
    // Prefer a curated prototype; else synthesize from the lexicon terms.
    text: CATEGORY_PROTOTYPES[lex.category] ?? lex.terms.join(', '),
  }));
  const customs = (extra ?? [])
    .filter((c) => c && c.trim())
    .map((c) => ({ label: c.trim(), text: c.trim() }));
  // De-dup labels (a custom category may shadow a built-in label).
  const seen = new Set<string>();
  const out: { label: string; text: string }[] = [];
  for (const p of [...base, ...customs]) {
    if (seen.has(p.label)) continue;
    seen.add(p.label);
    out.push(p);
  }
  return out;
}

/**
 * Classify a signal semantically, enriching the deterministic lexical result.
 * Never throws: any embedding failure degrades to the lexical classification.
 */
export async function classifySignalSemantic(
  input: SemanticClassifyInput,
  deps: SemanticDeps = {},
): Promise<SemanticClassification> {
  // (1) ALWAYS run the deterministic lexical classifier — for matchedTerms and
  //     as the fallback/anchor.
  const lexical = classifySignal(
    {
      title: input.title,
      bodyText: input.bodyText,
      sourceType: input.sourceType,
      extraCategories: input.extraCategories,
    },
    deps.now,
  );
  // Recover the lexical matched terms from the rationale-bearing classifier by
  // re-deriving them: alternativeCategories give runners-up, but the precise
  // matched terms are surfaced via a second, transparent pass.
  const matchedTerms = lexicalMatchedTerms(input, lexical.signalCategory);

  // (2) No embedder → pure lexical fallback (documented).
  if (!deps.embed) {
    return {
      category: lexical.signalCategory,
      confidence: lexical.confidence,
      matchedTerms,
      semanticNeighbors: [],
      rationale: `${lexical.rationale} (Lexical-only: no embedding function injected — semantic enrichment skipped.)`,
    };
  }

  // (3) Semantic ranking via injected embeddings. Wrapped — never throws.
  try {
    const prototypes = prototypesFor(input.extraCategories);
    const signalText = `${input.title}\n${input.bodyText ?? ''}`.trim();
    const texts = [signalText, ...prototypes.map((p) => p.text)];
    const vectors = await deps.embed(texts);
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      return lexicalFallback(lexical, matchedTerms, 'embedding returned an unexpected shape');
    }
    const signalVec = vectors[0];
    const neighbors = prototypes
      .map((p, i) => ({ label: p.label, score: round(cosine01(signalVec, vectors[i + 1] ?? [])) }))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

    const semanticNeighbors = neighbors.slice(0, 5);
    const topSem = neighbors[0];
    // The spread between the top neighbor and the runner-up indicates how
    // discriminating the semantic signal is (ambiguous when they are close).
    const runnerUp = neighbors[1]?.score ?? 0;
    const margin = topSem ? topSem.score - runnerUp : 0;

    // Semantic confidence: requires both an absolute similarity AND a margin
    // over the runner-up. Capped below 1 to keep epistemic humility.
    const semConfident = !!topSem && topSem.score >= 0.62 && margin >= 0.03;

    // (4) Merge — explainable. Prefer semantic ONLY when confident; otherwise
    //     defer to lexical. If BOTH are weak → preserve uncertainty ('other').
    const lexicalConfident = lexical.signalCategory !== 'other' && lexical.confidence >= 0.45;

    if (semConfident) {
      const agree = topSem.label === lexical.signalCategory;
      // Blend the two confidences, nudging up on agreement.
      const confidence = round(
        clamp(0.45 + 0.4 * topSem.score + (agree ? 0.1 : 0) + 0.1 * margin, 0, 0.95),
      );
      const rationale = agree
        ? `Semantic + lexical agree on "${topSem.label}" ` +
          `(cosine ${topSem.score}, margin ${round(margin)} over "${neighbors[1]?.label ?? 'n/a'}"; ` +
          `lexical matched ${matchedTerms.length} term(s)).`
        : `Semantic nearest category "${topSem.label}" (cosine ${topSem.score}, ` +
          `margin ${round(margin)}) overrides the weaker lexical guess ` +
          `"${lexical.signalCategory}" (confidence ${lexical.confidence}). ` +
          `Matched lexical terms: ${snippet(matchedTerms.join(', ') || 'none', 60)}.`;
      return {
        category: topSem.label,
        confidence,
        matchedTerms,
        semanticNeighbors,
        rationale,
      };
    }

    if (lexicalConfident) {
      return {
        category: lexical.signalCategory,
        confidence: lexical.confidence,
        matchedTerms,
        semanticNeighbors,
        rationale:
          `${lexical.rationale} Semantic top neighbor "${topSem?.label ?? 'n/a'}" ` +
          `(cosine ${topSem?.score ?? 0}) was not confident enough to override; deferring to lexical.`,
      };
    }

    // Both weak → preserve uncertainty.
    return {
      category: 'other',
      confidence: round(clamp(Math.max(0.1, (topSem?.score ?? 0) * 0.3), 0, 0.3)),
      matchedTerms,
      semanticNeighbors,
      rationale:
        `Ambiguous: neither lexical ("${lexical.signalCategory}", conf ${lexical.confidence}) ` +
        `nor semantic (top "${topSem?.label ?? 'n/a'}" cosine ${topSem?.score ?? 0}, ` +
        `margin ${round(margin)}) was confident — classified "other" (uncertainty preserved, not forced).`,
    };
  } catch (err) {
    return lexicalFallback(
      lexical,
      matchedTerms,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Build a lexical-fallback result with a reason (used on embed failure). */
function lexicalFallback(
  lexical: ReturnType<typeof classifySignal>,
  matchedTerms: string[],
  reason: string,
): SemanticClassification {
  return {
    category: lexical.signalCategory,
    confidence: lexical.confidence,
    matchedTerms,
    semanticNeighbors: [],
    rationale: `${lexical.rationale} (Semantic enrichment unavailable — ${reason}; fell back to lexical.)`,
  };
}

/**
 * Re-derive the lexical terms that matched for `category`. Transparent and
 * deterministic; mirrors the classifier's word-boundary/phrase matching so the
 * `matchedTerms` we surface are exactly those the lexical classifier saw.
 */
function lexicalMatchedTerms(input: SemanticClassifyInput, category: string): string[] {
  if (category === 'other') return [];
  const lex =
    CATEGORY_LEXICONS.find((l) => l.category === category) ??
    // Custom category: its single term IS its label.
    ((input.extraCategories ?? []).includes(category)
      ? { category, terms: [category.toLowerCase()] }
      : undefined);
  if (!lex) return [];
  const text = `${input.title}\n${input.bodyText ?? ''}`;
  const haystack = text.toLowerCase();
  const tokenJoin = ` ${(haystack.match(/[\p{L}\p{N}]+/gu) ?? []).join(' ')} `;
  const out: string[] = [];
  for (const term of lex.terms) {
    const t = term.toLowerCase();
    const found = t.includes(' ')
      ? haystack.includes(t)
      : new RegExp(`(?:^| )${escapeRegex(t)}(?: |$)`).test(tokenJoin);
    if (found) out.push(term);
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
