// =============================================================================
// HSI Phase 70.3 — Deterministic source classification (PURE, no LLM). Maps an
// imported/discovered source into an HSI category (A/B/C/D/Foundation) + a
// source_type, with confidence + an explainable reason. Keyword + URL heuristics
// only; never fabricates — it labels what the inputs actually contain.
// =============================================================================

import {
  isSourceType, type CandidateInput, type Classification, type ClassificationCategory, type SourceTypeTag,
} from './types';

const CATEGORY_KEYWORDS: Record<ClassificationCategory, string[]> = {
  A: ['extremism', 'extremist', 'ideolog', 'radical', 'hate', 'terror', 'militia', 'accelerationist', 'propaganda', 'supremac'],
  B: ['public trust', 'integrity', 'fact-check', 'factcheck', 'accountability', 'transparency', 'election', 'public health', 'misinformation', 'disinformation', 'corruption'],
  C: ['osint', 'research', 'intelligence', 'analysis', 'think tank', 'academic', 'dataset', 'arxiv', 'institute', 'study'],
  D: ['news', 'media', 'press', 'journal', 'newswire', 'reuters', 'associated press', 'broadcast', 'gazette', 'times', 'post', 'wire'],
  Foundation: ['infrastructure', 'cdn', 'hosting', 'registrar', 'certificate', 'dns', 'github', 'status page', 'platform'],
};

function letterCategory(v: string | null): ClassificationCategory | null {
  if (!v) return null;
  const t = v.trim().toUpperCase();
  if (t === 'A' || t === 'B' || t === 'C' || t === 'D') return t as ClassificationCategory;
  if (/foundation|infrastructure/i.test(v)) return 'Foundation';
  return null;
}

function inferType(input: CandidateInput): SourceTypeTag {
  if (input.sourceType && isSourceType(input.sourceType)) return input.sourceType.toLowerCase() as SourceTypeTag;
  const url = `${input.primaryUrl ?? ''} ${input.feedOrApiUrl ?? ''}`.toLowerCase();
  const name = `${input.sourceName} ${(input.tags ?? []).join(' ')}`.toLowerCase();
  if (/\/feed|\/rss|\.xml|\/atom/.test(url) || /\brss\b/.test(name)) return 'rss';
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/\.gov\b|\.gov\.|government/.test(url + name)) return 'government';
  if (/court|justice|tribunal/.test(url + name)) return 'court';
  if (/arxiv|research|\.edu\b|institute|journal/.test(url + name)) return 'research';
  if (/podcast|\/feed\.mp3|anchor\.fm/.test(url + name)) return 'podcast';
  if (/twitter\.com|x\.com|reddit\.com|facebook|instagram|tiktok|mastodon|telegram|social/.test(url + name)) return 'social';
  if (/forum|board|discourse/.test(url + name)) return 'forum';
  if (/\/api\b|api\./.test(url) || /\bapi\b/.test(name)) return 'api';
  if (/archive\.org|wayback|archive/.test(url + name)) return 'archive';
  if (/threat|abuse|malware|phish|cve|kev/.test(url + name)) return 'threat_feed';
  if (/newswire|wire service/.test(url + name)) return 'newswire';
  return 'website';
}

/** Classify a candidate source. Explicit CSV category/type win; else keyword-infer. */
export function classifySource(input: CandidateInput): Classification {
  const sourceType = inferType(input);
  const explicit = letterCategory(input.category);
  if (explicit) {
    return { category: explicit, sourceType, confidence: 0.95, reason: `Category provided explicitly (${input.category}); type ${sourceType}.` };
  }

  const haystack = `${input.sourceName} ${input.category ?? ''} ${input.description ?? ''} ${(input.tags ?? []).join(' ')} ${input.primaryUrl ?? ''}`.toLowerCase();
  let best: ClassificationCategory = 'D';
  let bestHits = 0; let bestMatch = '';
  for (const cat of Object.keys(CATEGORY_KEYWORDS) as ClassificationCategory[]) {
    const hits = CATEGORY_KEYWORDS[cat].filter((k) => haystack.includes(k));
    if (hits.length > bestHits) { bestHits = hits.length; best = cat; bestMatch = hits[0]; }
  }
  if (bestHits === 0) {
    return { category: 'D', sourceType, confidence: 0.4, reason: `No category keywords matched; defaulted to Media. Type inferred ${sourceType}.` };
  }
  const confidence = Math.min(0.9, 0.55 + bestHits * 0.12);
  return { category: best, sourceType, confidence: Math.round(confidence * 100) / 100, reason: `Matched ${bestHits} "${best}" keyword(s) (e.g. "${bestMatch}"); type ${sourceType}.` };
}
