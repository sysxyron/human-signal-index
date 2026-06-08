// =============================================================================
// @hsi/source-intelligence — manual submission provider.
//
// A human submits a PUBLIC observation. Per spec, a manual submission REQUIRES a
// source, a category, and a summary. It produces a SignalDraft directly (it is
// already a human-curated signal) — but, like everything here, it is a DRAFT for
// the review pipeline and is NEVER auto-published.
// =============================================================================

import { sha256Hex } from '../internal/hash';
import { normalizeWhitespace } from '../internal/text';
import type { SignalDraft } from '../types';

/** A human manual submission. source + category + summary are required. */
export interface ManualSubmission {
  sourceId: string;
  category: string;
  summary: string;
  title?: string;
  rawText?: string;
  tags?: string[];
}

export interface ManualResult {
  ok: boolean;
  signal?: SignalDraft;
  error?: string;
  provider: 'manual';
}

/**
 * Validate + normalize a manual submission into a SignalDraft. Never throws.
 * `now` is injected (no Date.now()). Confidence is fixed high (0.95) because a
 * human asserted it — but it is still a draft pending review.
 */
export async function submitManual(
  submission: ManualSubmission,
  now: string,
): Promise<ManualResult> {
  const errors: string[] = [];
  if (!submission.sourceId || !normalizeWhitespace(submission.sourceId)) {
    errors.push('sourceId is required for a manual submission');
  }
  if (!submission.category || !normalizeWhitespace(submission.category)) {
    errors.push('category is required for a manual submission');
  }
  if (!submission.summary || !normalizeWhitespace(submission.summary)) {
    errors.push('summary is required for a manual submission');
  }
  if (errors.length > 0) {
    return { ok: false, provider: 'manual', error: errors.join('; ') };
  }
  const title =
    submission.title && normalizeWhitespace(submission.title)
      ? normalizeWhitespace(submission.title)
      : normalizeWhitespace(submission.summary).slice(0, 80);
  const hashInput = [title, submission.summary, submission.rawText ?? ''].join('\n');
  return {
    ok: true,
    provider: 'manual',
    signal: {
      sourceId: submission.sourceId,
      title,
      summary: normalizeWhitespace(submission.summary),
      rawContent: submission.rawText,
      contentHash: await sha256Hex(hashInput),
      signalType: 'manual_submission',
      signalCategory: normalizeWhitespace(submission.category),
      confidence: 0.95,
      capturedAt: now,
      tags: submission.tags,
    },
  };
}
