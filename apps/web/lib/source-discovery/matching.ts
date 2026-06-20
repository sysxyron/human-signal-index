// =============================================================================
// HSI Phase 70.3 — Matching engine (PURE, deterministic). Suggests narrative /
// watchlist / source matches for a candidate by domain / keywords / tags. These
// are SUGGESTIONS surfaced for a human to approve — never auto-applied.
// =============================================================================

import { domainOf } from './duplicates';
import type { CandidateInput, ExistingSource } from './types';

export interface NarrativeLite { id: string; name: string }
export interface WatchlistLite { id: string; name: string; terms: string[] }
export interface Match { id: string; name: string; reason: string; score: number }

function tokens(s: string): string[] {
  return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
}

/** Existing sources sharing the candidate's domain (dedup/relation aid). */
export function matchSources(candidate: CandidateInput, existing: ExistingSource[]): Match[] {
  const cDomain = domainOf(candidate.primaryUrl) || domainOf(candidate.feedOrApiUrl);
  if (!cDomain) return [];
  return existing
    .filter((e) => { const d = domainOf(e.homepageUrl) || domainOf(e.rssUrl); return d && d === cDomain; })
    .map((e) => ({ id: e.id, name: e.name, reason: `Same domain "${cDomain}"`, score: 1 }))
    .slice(0, 5);
}

/** Narratives whose name tokens overlap the candidate's name/tags/description. */
export function matchNarratives(text: string, narratives: NarrativeLite[]): Match[] {
  const hay = new Set(tokens(text));
  const out: Match[] = [];
  for (const nNar of narratives) {
    const nt = tokens(nNar.name);
    const overlap = nt.filter((t) => hay.has(t));
    if (overlap.length > 0) out.push({ id: nNar.id, name: nNar.name, reason: `Shared term(s): ${overlap.slice(0, 3).join(', ')}`, score: overlap.length });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Watchlists whose terms appear in the candidate text. */
export function matchWatchlists(text: string, watchlists: WatchlistLite[]): Match[] {
  const lc = (text || '').toLowerCase();
  const out: Match[] = [];
  for (const w of watchlists) {
    const hits = (w.terms ?? []).filter((term) => term && lc.includes(term.toLowerCase()));
    if (hits.length > 0) out.push({ id: w.id, name: w.name, reason: `Matched term(s): ${hits.slice(0, 3).join(', ')}`, score: hits.length });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Signal-text matching (reuses narrative/watchlist matchers over a signal's text). */
export function matchSignals(signalText: string, narratives: NarrativeLite[], watchlists: WatchlistLite[]): { narratives: Match[]; watchlists: Match[] } {
  return { narratives: matchNarratives(signalText, narratives), watchlists: matchWatchlists(signalText, watchlists) };
}
