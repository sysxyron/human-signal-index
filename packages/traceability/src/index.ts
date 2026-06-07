// =============================================================================
// @hsi/traceability — public API
// A sem_debug-inspired provenance engine: scores how well AI-generated passages
// are supported by declared source passages, flags unattributed content, and
// gates publishing. Pure TypeScript, zero runtime dependencies.
//
// Provenance ladder enforced across HSI:
//   raw source -> AI extraction -> AI interpretation -> human review -> publish
// This package guards the boundary between "extraction/interpretation" and
// "human review/publish": nothing publishes below the confidence threshold,
// and any model-imported (unattributed) claim hard-blocks publication.
//
// -----------------------------------------------------------------------------
// __examples__ (unit-test-style usage)
// -----------------------------------------------------------------------------
// import { compareGeneratedAgainstSources, isPublishable } from '@hsi/traceability';
//
// const sources = [
//   { id: 'src-1', text: 'The group posted a public manifesto calling for an end to procreation.', sourceUrl: 'https://example.org/post' },
// ];
// const generated = [
//   { id: 'g1', text: 'The group publicly called for ending procreation in a manifesto.' }, // supported
//   { id: 'g2', text: 'Quantum tunneling explains the price of tea in China.' },            // imported_knowledge
// ];
// const report = compareGeneratedAgainstSources(generated, sources, '2026-06-06T00:00:00Z');
// report.passages[0].label;     // => 'supported' | 'weakly_supported'
// report.passages[1].label;     // => 'imported_knowledge'
// report.flaggedClaims.length;  // => 1 (g2)
// isPublishable(report, 0.72);  // => false (g2 is unattributed -> hard block)
// =============================================================================

export * from './types';
export * from './text';
export * from './engine';

import { buildTraceReport, isPublishable } from './engine';
import {
  DEFAULT_THRESHOLDS,
  type GeneratedPassage,
  type SourcePassage,
  type TraceabilityReport,
  type TraceabilityThresholds,
} from './types';

/**
 * Top-level convenience: tie tokenization, scoring, flagging, and provenance
 * together and return a structured TraceabilityReport.
 *
 * @param generatedPassages AI-generated passages to verify.
 * @param sources           Declared source passages (the only legitimate inputs).
 * @param generatedAt       ISO timestamp PASSED IN by the caller (provenance).
 * @param options           Optional thresholds override + free-form note.
 */
export function compareGeneratedAgainstSources(
  generatedPassages: GeneratedPassage[],
  sources: SourcePassage[],
  generatedAt: string,
  options: { thresholds?: Partial<TraceabilityThresholds>; note?: string } = {},
): TraceabilityReport {
  const thresholds: TraceabilityThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(options.thresholds ?? {}),
  };
  return buildTraceReport(generatedPassages, sources, generatedAt, {
    thresholds,
    note: options.note,
  });
}

/**
 * Legacy-compatible alias kept so existing worker/processor code that imported
 * the naive `isTraceable` keeps working. Prefer `isPublishable`.
 * @deprecated Use isPublishable.
 */
export function isTraceable(report: TraceabilityReport, threshold = 0.72): boolean {
  return isPublishable(report, threshold);
}

export type { GeneratedPassage, SourcePassage, TraceabilityReport };
