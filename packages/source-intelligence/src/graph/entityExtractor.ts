// =============================================================================
// @hsi/source-intelligence — deterministic ENTITY extractor (Phase 8).
//
// HEURISTIC, NOT a NER model (no model/network dep — documented). It combines:
//   * a DICTIONARY built from the classifier lexicons + DEFAULT_WATCHLISTS
//     (known ideology/movement terms) and platform/publication keyword lists;
//   * a proper-noun heuristic (runs of Capitalized words → candidate org/topic).
//
// Each entity carries a confidence and an `evidenceText` snippet (the surrounding
// context). PRESERVE UNCERTAINTY: when the type is unclear we emit 'unknown'
// rather than guessing. Pure & deterministic given its inputs.
//
// ETHICS: we extract PUBLIC narrative/movement/org/publication mentions for
// research routing — never private individuals' personal data. Proper-noun runs
// default to 'organization'/'topic'/'unknown', never auto-typed as 'person'.
// =============================================================================

import { CATEGORY_LEXICONS } from '../classify/lexicons';
import { DEFAULT_WATCHLISTS } from '../watchlists';
import { round } from '../internal/text';
import type { ExtractedEntity } from './types';

/** Categories whose lexicon terms denote IDEOLOGIES when matched as entities. */
const IDEOLOGY_CATEGORIES = new Set(['extinction', 'ideology', 'religion']);
/** Categories whose lexicon terms denote MOVEMENTS when matched as entities. */
const MOVEMENT_CATEGORIES = new Set(['movement', 'recruitment']);

/** Known platforms (PUBLIC). Matched case-insensitively as whole phrases. */
const PLATFORM_TERMS: string[] = [
  'youtube', 'tiktok', 'twitter', 'x', 'facebook', 'instagram', 'reddit',
  'telegram', 'discord', 'substack', 'mastodon', 'rumble', 'twitch',
  '4chan', '8kun', 'gab', 'truth social', 'threads',
];
/** Known publication/outlet cue words. */
const PUBLICATION_TERMS: string[] = [
  'gazette', 'times', 'post', 'journal', 'tribune', 'herald', 'review',
  'press', 'wire', 'bulletin', 'chronicle', 'observer', 'dispatch',
];
/** Generic place cue suffixes (very rough; only for type hinting). */
const PLACE_SUFFIXES = ['land', 'stan', 'burg', 'ville', 'shire'];

interface DictEntry {
  term: string;
  type: ExtractedEntity['entityType'];
}

/** Build the ideology/movement dictionary from lexicons + watchlists once. */
function buildDictionary(): DictEntry[] {
  const out = new Map<string, ExtractedEntity['entityType']>();
  for (const lex of CATEGORY_LEXICONS) {
    const type: ExtractedEntity['entityType'] = IDEOLOGY_CATEGORIES.has(lex.category)
      ? 'ideology'
      : MOVEMENT_CATEGORIES.has(lex.category)
        ? 'movement'
        : 'topic';
    for (const term of lex.terms) {
      const t = term.toLowerCase();
      // Multi-word phrases and distinctive -ism/-ist terms make the best
      // entities. Skip too-generic short tokens (e.g. bare "ism") to cut noise.
      const distinctive = t.includes(' ') || (/(?:ism|ist)$/.test(t) && t.length >= 5);
      if (distinctive && !out.has(t)) out.set(t, type);
    }
  }
  for (const wl of DEFAULT_WATCHLISTS) {
    for (const term of wl.terms) {
      const t = term.toLowerCase();
      const distinctive = t.includes(' ') || (/(?:ism|ist)$/.test(t) && t.length >= 5);
      if (distinctive && !out.has(t)) {
        // Watchlist terms are movement/ideology oriented.
        out.set(t, /(?:ism|ist)$/.test(t) ? 'ideology' : 'movement');
      }
    }
  }
  return [...out.entries()]
    .map(([term, type]) => ({ term, type }))
    .sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term));
}

const DICTIONARY = buildDictionary();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A surrounding snippet around an index range, collapsed + trimmed. */
function evidenceAround(text: string, start: number, end: number, pad = 40): string {
  const from = Math.max(0, start - pad);
  const to = Math.min(text.length, end + pad);
  const slice = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return (from > 0 ? '…' : '') + slice + (to < text.length ? '…' : '');
}

/**
 * Extract entities from `text`. Deterministic; results are de-duplicated by
 * lowercased name (first/strongest mention wins) and sorted by confidence then
 * name. `opts.knownEntities` adds caller-supplied known names (typed 'topic').
 */
export function extractEntities(
  text: string,
  opts: { knownEntities?: string[] } = {},
): ExtractedEntity[] {
  if (!text || !text.trim()) return [];
  const lower = text.toLowerCase();
  const byName = new Map<string, ExtractedEntity>();

  const add = (e: ExtractedEntity): void => {
    const key = e.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || e.confidence > existing.confidence) byName.set(key, e);
  };

  // (1) Dictionary terms (ideologies/movements) — high confidence, typed.
  for (const { term, type } of DICTIONARY) {
    const idx = lower.indexOf(term);
    if (idx >= 0) {
      add({
        name: term,
        entityType: type,
        confidence: 0.85,
        evidenceText: evidenceAround(text, idx, idx + term.length),
      });
    }
  }

  // (2) Caller-supplied known entities — typed 'topic' at high confidence.
  for (const k of opts.knownEntities ?? []) {
    const kt = k.trim();
    if (!kt) continue;
    const idx = lower.indexOf(kt.toLowerCase());
    if (idx >= 0) {
      add({
        name: kt,
        entityType: 'topic',
        confidence: 0.8,
        evidenceText: evidenceAround(text, idx, idx + kt.length),
      });
    }
  }

  // (3) Platform / publication keyword cues.
  for (const p of PLATFORM_TERMS) {
    const re = new RegExp(`(?:^|[^\\p{L}])${escapeRegex(p)}(?:[^\\p{L}]|$)`, 'iu');
    const m = re.exec(text);
    if (m) {
      const idx = m.index + (m[0].length - p.length - (/[^\p{L}]$/u.test(m[0]) ? 1 : 0));
      add({
        name: titleCase(p),
        entityType: 'platform',
        confidence: 0.7,
        evidenceText: evidenceAround(text, Math.max(0, idx), idx + p.length),
      });
    }
  }

  // (4) Proper-noun runs: sequences of Capitalized words. Heuristic typing:
  //     publication cue word → 'publication'; place suffix → 'place'; else a
  //     multi-word run → 'organization'; a single word → 'unknown' (preserve
  //     uncertainty — we never assume 'person').
  const properRun = /\b([A-Z][a-zA-Z0-9]+(?:\s+(?:of|the|for|and|[A-Z][a-zA-Z0-9]+))*)\b/g;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = properRun.exec(text)) !== null) {
    let raw = match[1].trim();
    let offset = match.index;
    // Strip a leading determiner ("The"/"A"/"An") so "The Global Survival
    // Coalition" surfaces as "Global Survival Coalition".
    const det = /^(The|A|An)\s+(?=[A-Z])/.exec(raw);
    if (det && raw.split(/\s+/).length > 1) {
      offset += det[0].length;
      raw = raw.slice(det[0].length).trim();
    }
    const words = raw.split(/\s+/);
    // Skip sentence-initial single capitalized words (likely just a sentence start)
    // and very short tokens to reduce noise.
    if (words.length === 1) {
      if (raw.length < 4) continue;
      // A single capitalized word at index 0 is too weak — only keep mid-sentence.
      const before = text.slice(Math.max(0, offset - 2), offset);
      const sentenceStart = offset === 0 || /[.!?]\s$/.test(before + ' ');
      if (sentenceStart) continue;
    }
    const lowerRaw = raw.toLowerCase();
    // Don't double-count dictionary/platform hits.
    if (byName.has(lowerRaw)) continue;

    let type: ExtractedEntity['entityType'] = 'unknown';
    let confidence = 0.4;
    if (PUBLICATION_TERMS.some((t) => lowerRaw.includes(t))) {
      type = 'publication';
      confidence = 0.65;
    } else if (PLACE_SUFFIXES.some((s) => lowerRaw.endsWith(s)) && words.length === 1) {
      type = 'place';
      confidence = 0.5;
    } else if (words.length >= 2) {
      type = 'organization';
      confidence = 0.55;
    }
    add({
      name: raw,
      entityType: type,
      confidence: round(confidence),
      evidenceText: evidenceAround(text, offset, offset + raw.length),
    });
  }

  return [...byName.values()].sort(
    (a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name),
  );
}

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
