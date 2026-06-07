// =============================================================================
// @hsi/traceability — text utilities (pure TS, no deps)
// Tokenization, n-gram/shingle generation, term-frequency vectors, cosine
// similarity, and shingle (Jaccard) overlap. All deterministic and side-effect
// free so traceability scoring is reproducible and auditable.
// =============================================================================

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'this', 'these', 'those', 'or', 'but', 'if', 'then', 'than',
  'so', 'we', 'you', 'they', 'i', 'not', 'no', 'do', 'does', 'did', 'have',
  'had', 'their', 'them', 'our', 'your', 'his', 'her', 'about', 'into', 'over',
  'such', 'can', 'could', 'should', 'would', 'may', 'might', 'must', 'there',
]);

/**
 * Lowercase, strip punctuation, split on whitespace, drop stopwords + 1-char
 * tokens. Returns a list of normalized terms.
 */
export function tokenize(input: string, keepStopwords = false): string[] {
  if (!input) return [];
  const cleaned = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(' ')
    .filter((t) => t.length > 1 && (keepStopwords || !STOPWORDS.has(t)));
}

/** Split text into sentence-ish passages on terminal punctuation / newlines. */
export function splitIntoPassages(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+|\n{1,}/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Build word-level n-gram shingles. */
export function shingles(tokens: string[], n: number): string[] {
  if (n <= 1) return tokens.slice();
  if (tokens.length < n) return tokens.length ? [tokens.join(' ')] : [];
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i += 1) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

/** Term-frequency vector (raw counts) keyed by term. */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/** Cosine similarity over two term-frequency vectors. 0..1. */
export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  // Iterate the smaller map for the dot product.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other) dot += weight * other;
  }
  let magA = 0;
  for (const w of a.values()) magA += w * w;
  let magB = 0;
  for (const w of b.values()) magB += w * w;
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Jaccard overlap of two shingle sets. 0..1. */
export function shingleOverlap(aShingles: string[], bShingles: string[]): number {
  if (aShingles.length === 0 || bShingles.length === 0) return 0;
  const setA = new Set(aShingles);
  const setB = new Set(bShingles);
  let intersection = 0;
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const s of small) if (large.has(s)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find the best-matching contiguous window of `sourceText` for `generatedText`
 * using a sliding window of source tokens sized to the generated passage.
 * Returns the matched span (original-ish words rejoined) — used for the
 * "matched span" shown in trace reports.
 */
export function bestMatchedSpan(generatedText: string, sourceText: string): string {
  const genTokens = tokenize(generatedText, true);
  const srcWords = sourceText.split(/\s+/).filter(Boolean);
  if (srcWords.length === 0) return '';
  const windowSize = Math.min(Math.max(genTokens.length, 4), srcWords.length);
  const genTf = termFrequency(tokenize(generatedText));

  let bestScore = -1;
  let bestStart = 0;
  for (let i = 0; i + windowSize <= srcWords.length; i += 1) {
    const window = srcWords.slice(i, i + windowSize).join(' ');
    const score = cosineSimilarity(genTf, termFrequency(tokenize(window)));
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }
  return srcWords.slice(bestStart, bestStart + windowSize).join(' ');
}
