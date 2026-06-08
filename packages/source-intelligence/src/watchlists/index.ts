// =============================================================================
// @hsi/source-intelligence — watchlist matching.
//
// Watchlists are NEUTRAL, RESEARCH-ORIENTED keyword sets used to route PUBLIC
// signals for human review. A match is NOT an accusation — it flags a topic for
// the governance pipeline. Matching is case-insensitive with word-boundary
// semantics; multi-word terms match as phrases.
//
// ETHICS: watchlists describe PUBLIC narratives/ideologies, never private people.
// =============================================================================

import { clamp, round, tokenize } from '../internal/text';
import type { AlertSeverity, WatchlistDef, WatchlistMatch } from '../types';

export interface WatchlistSignal {
  title: string;
  summary?: string;
  rawContent?: string;
  category?: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a signal against a set of watchlists. For each watchlist, collect the
 * matched terms, compute a score = matched/total terms, and carry the
 * watchlist's severity (default MEDIUM). Watchlists with zero matches are
 * omitted. Pure & deterministic.
 */
export function matchWatchlists(
  signal: WatchlistSignal,
  watchlists: WatchlistDef[],
): WatchlistMatch[] {
  const haystack = [signal.title, signal.summary, signal.rawContent, signal.category]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  const tokenJoin = ` ${tokenize(haystack).join(' ')} `;

  const matches: WatchlistMatch[] = [];
  for (const wl of watchlists) {
    const matchedTerms: string[] = [];
    for (const term of wl.terms) {
      const t = term.toLowerCase().trim();
      if (!t) continue;
      const found = t.includes(' ')
        ? haystack.includes(t)
        : new RegExp(`(?:^| )${escapeRegex(t)}(?: |$)`).test(tokenJoin);
      if (found) matchedTerms.push(term);
    }
    if (matchedTerms.length === 0) continue;
    const score = round(clamp(matchedTerms.length / Math.max(1, wl.terms.length)));
    matches.push({
      watchlistId: wl.id,
      watchlistName: wl.name,
      matchedTerms,
      score,
      severity: (wl.severity ?? 'MEDIUM') as AlertSeverity,
    });
  }
  // Strongest matches first (by severity then score) for stable, useful output.
  const sevRank: Record<AlertSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  matches.sort(
    (a, b) =>
      sevRank[b.severity] - sevRank[a.severity] ||
      b.score - a.score ||
      a.watchlistName.localeCompare(b.watchlistName),
  );
  return matches;
}

/**
 * DEFAULT research watchlists. Neutral, public-term oriented. These flag PUBLIC
 * narratives/ideologies for human review — they are descriptive, not punitive.
 */
export const DEFAULT_WATCHLISTS: WatchlistDef[] = [
  {
    id: 'wl_extinctionism',
    name: 'Extinctionism',
    description: 'Public narratives advocating or celebrating human extinction.',
    severity: 'HIGH',
    terms: ['extinctionism', 'extinctionist', 'human extinction', 'voluntary human extinction', 'vhemt', 'omnicide'],
  },
  {
    id: 'wl_antinatalism',
    name: 'Antinatalism',
    description: 'Public discourse opposing procreation on ethical grounds.',
    severity: 'MEDIUM',
    terms: ['antinatalism', 'antinatalist', 'cease procreation', 'do not have children', 'birth is harm'],
  },
  {
    id: 'wl_efilism',
    name: 'Efilism',
    description: 'Public efilist discourse (life-negation philosophy).',
    severity: 'HIGH',
    terms: ['efilism', 'efilist', 'sentience abolition', 'red button'],
  },
  {
    id: 'wl_promortalism',
    name: 'Promortalism',
    description: 'Public promortalist discourse (death-preference philosophy).',
    severity: 'HIGH',
    terms: ['promortalism', 'promortalist', 'better off dead', 'death is preferable'],
  },
  {
    id: 'wl_population_reduction',
    name: 'Population Reduction',
    description: 'Public narratives advocating large-scale population reduction.',
    severity: 'HIGH',
    terms: ['population reduction', 'depopulation', 'population control', 'overpopulation crisis', 'cull the population'],
  },
  {
    id: 'wl_technocratic_governance',
    name: 'Technocratic Governance',
    description: 'Public narratives advocating technocratic/unelected expert rule.',
    severity: 'MEDIUM',
    terms: ['technocracy', 'technocratic governance', 'rule by experts', 'central planning', 'social credit'],
  },
  {
    id: 'wl_ai_governance',
    name: 'AI Governance',
    description: 'Public discourse on AI control, safety, and governance regimes.',
    severity: 'MEDIUM',
    terms: ['ai governance', 'ai safety', 'ai alignment', 'superintelligence', 'agi control', 'ai regulation'],
  },
  {
    id: 'wl_collapse_narratives',
    name: 'Collapse Narratives',
    description: 'Public narratives predicting imminent societal collapse.',
    severity: 'MEDIUM',
    terms: ['societal collapse', 'civilizational collapse', 'collapsology', 'systemic collapse', 'breakdown of society'],
  },
  {
    id: 'wl_doom_narratives',
    name: 'Doom Narratives',
    description: 'Public doom/doomer narratives of inevitable catastrophe.',
    severity: 'LOW',
    terms: ['doomer', 'doomscroll', 'we are doomed', 'end times', 'no future', 'inevitable catastrophe'],
  },
];
