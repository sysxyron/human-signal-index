// =============================================================================
// @hsi/traceability — scoring engine
// Ties tokenization + cosine + shingle overlap together into per-passage
// source mapping, support flagging, and a full TraceabilityReport.
// =============================================================================

import {
  bestMatchedSpan,
  cosineSimilarity,
  shingleOverlap,
  shingles,
  termFrequency,
  tokenize,
} from './text';
import {
  DEFAULT_THRESHOLDS,
  ENGINE_VERSION,
  type GeneratedPassage,
  type PassageTrace,
  type ProvenanceMetadata,
  type SourceConfidence,
  type SourceMatch,
  type SourcePassage,
  type SupportLabel,
  type TraceabilityReport,
  type TraceabilityThresholds,
} from './types';

/** Blend cosine + shingle overlap into a single 0..1 confidence. */
export function blendConfidence(cosine: number, overlap: number): number {
  // Cosine captures bag-of-words support; shingle overlap rewards verbatim /
  // near-verbatim phrasing. Weight cosine higher but let strong shingle
  // overlap lift weak cosine (paraphrase vs. quotation).
  const blended = 0.65 * cosine + 0.35 * overlap;
  return Math.max(0, Math.min(1, blended));
}

/**
 * Map a single generated passage to its best-matching declared source(s).
 * Returns ranked SourceMatch[] (highest confidence first).
 */
export function mapGeneratedToSource(
  generated: GeneratedPassage,
  sources: SourcePassage[],
  thresholds: TraceabilityThresholds = DEFAULT_THRESHOLDS,
): SourceMatch[] {
  const genTokens = tokenize(generated.text);
  const genTf = termFrequency(genTokens);
  const genShingles = shingles(genTokens, thresholds.shingleSize);

  const matches: SourceMatch[] = sources.map((src) => {
    const srcTokens = tokenize(src.text);
    const cosine = cosineSimilarity(genTf, termFrequency(srcTokens));
    const overlap = shingleOverlap(genShingles, shingles(srcTokens, thresholds.shingleSize));
    const confidence = blendConfidence(cosine, overlap);
    return {
      sourceId: src.id,
      sourceUrl: src.sourceUrl,
      evidenceId: src.evidenceId,
      cosine,
      shingleOverlap: overlap,
      confidence,
      matchedSpan: confidence > 0 ? bestMatchedSpan(generated.text, src.text) : '',
    };
  });

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/** Classify a confidence into a support label. */
export function labelFor(
  confidence: number,
  thresholds: TraceabilityThresholds = DEFAULT_THRESHOLDS,
): SupportLabel {
  if (confidence < thresholds.importedKnowledgeFloor) return 'imported_knowledge';
  if (confidence >= thresholds.supported) return 'supported';
  if (confidence >= thresholds.weaklySupported) return 'weakly_supported';
  return 'unsupported';
}

function reasonFor(label: SupportLabel, top?: SourceMatch): string {
  switch (label) {
    case 'supported':
      return `Strong overlap with declared source ${top?.sourceId ?? ''} (confidence ${(top?.confidence ?? 0).toFixed(2)}).`;
    case 'weakly_supported':
      return `Partial overlap with declared source ${top?.sourceId ?? ''}; verify the specific claim against the source.`;
    case 'unsupported':
      return 'Overlap with declared sources is below the support threshold. Attribution required before publication.';
    case 'imported_knowledge':
    default:
      return 'No meaningful overlap with any declared source. This appears to be model-imported knowledge and must be attributed or removed before publication.';
  }
}

/** Build a per-passage trace + flag for one generated passage. */
export function tracePassage(
  generated: GeneratedPassage,
  sources: SourcePassage[],
  thresholds: TraceabilityThresholds = DEFAULT_THRESHOLDS,
): PassageTrace {
  const matches = mapGeneratedToSource(generated, sources, thresholds);
  const top = matches[0];
  const confidence = top?.confidence ?? 0;
  const label = labelFor(confidence, thresholds);
  const flagged = label === 'unsupported' || label === 'imported_knowledge';
  // Keep only matches that carry signal (avoid noise of all-zero sources).
  const meaningful = matches.filter((m) => m.confidence > 0).slice(0, 3);
  return {
    generatedId: generated.id,
    generatedText: generated.text,
    label,
    confidence,
    matches: meaningful.length ? meaningful : matches.slice(0, 1),
    flagged,
    reason: reasonFor(label, top),
  };
}

/** Aggregate per-source confidence from the per-passage traces. */
export function computeSourceConfidence(
  traces: PassageTrace[],
  sources: SourcePassage[],
): SourceConfidence[] {
  const acc = new Map<string, { sum: number; count: number; url?: string }>();
  for (const t of traces) {
    const top = t.matches[0];
    if (!top || top.confidence <= 0) continue;
    const cur = acc.get(top.sourceId) ?? { sum: 0, count: 0, url: top.sourceUrl };
    cur.sum += top.confidence;
    cur.count += 1;
    acc.set(top.sourceId, cur);
  }
  return sources.map((src) => {
    const a = acc.get(src.id);
    return {
      sourceId: src.id,
      sourceUrl: src.sourceUrl,
      meanConfidence: a && a.count ? a.sum / a.count : 0,
      supportsCount: a?.count ?? 0,
    };
  });
}

/**
 * Build a full trace report. Overall traceabilityScore is the mean per-passage
 * confidence (passages with no source contribute 0, dragging the score down —
 * intentional, so unattributed content lowers publishability).
 */
export function buildTraceReport(
  generatedPassages: GeneratedPassage[],
  sources: SourcePassage[],
  generatedAt: string,
  options: { thresholds?: TraceabilityThresholds; note?: string } = {},
): TraceabilityReport {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const passages = generatedPassages.map((g) => tracePassage(g, sources, thresholds));

  const traceabilityScore =
    passages.length === 0
      ? 0
      : passages.reduce((sum, p) => sum + p.confidence, 0) / passages.length;

  const flaggedClaims = passages.filter((p) => p.flagged);
  const sourceConfidence = computeSourceConfidence(passages, sources);

  const provenance: ProvenanceMetadata = {
    generatedAt,
    declaredInputs: sources.map((s) => ({ id: s.id, sourceUrl: s.sourceUrl, evidenceId: s.evidenceId })),
    engineVersion: ENGINE_VERSION,
    thresholds,
    note: options.note,
  };

  return {
    traceabilityScore,
    passages,
    flaggedClaims,
    sourceConfidence,
    provenance,
    publishable: traceabilityScore >= thresholds.minPublishConfidence,
  };
}

/**
 * Publishing gate. BLOCKS publishing when the overall score is below the
 * threshold OR any passage is imported_knowledge (no source at all).
 * Default threshold from TRACEABILITY_MIN_CONFIDENCE / 0.72.
 */
export function isPublishable(
  report: TraceabilityReport,
  threshold: number = report.provenance.thresholds.minPublishConfidence,
): boolean {
  const hasImported = report.passages.some((p) => p.label === 'imported_knowledge');
  return report.traceabilityScore >= threshold && !hasImported;
}
