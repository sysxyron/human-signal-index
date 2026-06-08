// =============================================================================
// @hsi/source-intelligence — pure text utilities.
// Deterministic, dependency-free helpers used by capture/monitor/classify/drift.
// No Date.now()/Math.random() — all functions are pure given their inputs.
// =============================================================================

/** Strip HTML tags to a plain-text approximation (minimal, no dependency). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase, split into word tokens (unicode letters/digits). */
export function tokenize(text: string): string[] {
  const matched = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return matched ?? [];
}

/** Set of unique tokens. */
export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Word n-gram shingles (default trigrams) over the token stream. */
export function shingles(text: string, n = 3): Set<string> {
  const toks = tokenize(text);
  if (toks.length < n) {
    // Fall back to the token set so very short texts still compare meaningfully.
    return new Set(toks);
  }
  const out = new Set<string>();
  for (let i = 0; i + n <= toks.length; i += 1) {
    out.add(toks.slice(i, i + n).join(' '));
  }
  return out;
}

/** Jaccard similarity of two sets: |A∩B| / |A∪B| (0..1, 1 when both empty). */
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

/**
 * Lexical similarity of two texts in [0,1]. Blends token-set Jaccard with
 * trigram-shingle Jaccard so it is sensitive to both vocabulary and word order.
 * Deterministic and symmetric.
 */
export function textSimilarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  const tokenSim = jaccard(ta, tb);
  const shingleSim = jaccard(shingles(a), shingles(b));
  // Weight vocabulary slightly higher than ordering; round for determinism.
  return round(0.6 * tokenSim + 0.4 * shingleSim);
}

/** Round to 4 decimals to keep results stable/serializable. */
export function round(n: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}

/** Collapse whitespace and trim. */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Truncate text for inclusion in human-readable explanations. */
export function snippet(s: string, max = 120): string {
  const t = normalizeWhitespace(s);
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
