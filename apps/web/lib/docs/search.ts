// =============================================================================
// HSI Phase 73.4 — Documentation search (PURE, deterministic). A simple local
// index over docs pages, FAQ entries, and education lessons. No external service,
// no vector DB, no AI — plain substring + token ranking. No I/O.
// =============================================================================

import { DOC_PAGES } from './content';
import { TRACKS } from '../education/curriculum';

export type SearchType = 'doc' | 'faq' | 'lesson';
export interface SearchEntry { title: string; url: string; type: SearchType; text: string }

/** Build the static search index from real content (no fabricated entries). */
export function buildSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const p of DOC_PAGES) {
    const headings = p.sections.map((s) => s.heading).join(' ');
    if (p.slug === 'faq') {
      // each FAQ question is its own entry
      for (const s of p.sections) entries.push({ title: s.heading, url: '/docs/faq', type: 'faq', text: `${s.heading} ${(s.body ?? []).join(' ')}` });
    } else {
      entries.push({ title: p.title, url: `/docs/${p.slug}`, type: 'doc', text: `${p.title} ${p.description} ${p.intro} ${headings} ${p.keywords.join(' ')}` });
    }
  }
  for (const t of TRACKS) {
    for (const l of t.lessons) entries.push({ title: l.title, url: '/education-hub', type: 'lesson', text: `${l.title} ${l.summary} ${t.title}` });
  }
  return entries;
}

/** Deterministic ranked search: exact title hit ranks highest, then token hits. */
export function searchDocs(index: SearchEntry[], query: string, limit = 25): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of index) {
    const title = e.title.toLowerCase();
    const text = e.text.toLowerCase();
    let score = 0;
    if (title.includes(q)) score += 5;
    if (text.includes(q)) score += 2;
    for (const tok of tokens) { if (title.includes(tok)) score += 2; else if (text.includes(tok)) score += 1; }
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title));
  return scored.slice(0, limit).map((s) => s.e);
}
