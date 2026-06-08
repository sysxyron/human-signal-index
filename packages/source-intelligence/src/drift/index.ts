// =============================================================================
// @hsi/source-intelligence — narrative drift detection.
//
// Compares two statements/snapshots of a narrative. A drift is reported when the
// texts are MEANINGFULLY changed (similarity below a threshold) but still
// TOPICALLY RELATED (they share enough vocabulary to be the same narrative
// evolving, rather than two unrelated texts). Pure & deterministic.
// =============================================================================

import { clamp, jaccard, round, snippet, textSimilarity, tokenSet } from '../internal/text';
import type { NarrativeDriftEvent } from '../types';

/** Above this similarity, the two snapshots are "the same" — no drift. */
export const DRIFT_SAME_THRESHOLD = 0.85;
/**
 * Topical relatedness floor (token-set Jaccard). Below this the texts are about
 * different things — a replacement, not a drift of one narrative — so we report
 * null rather than a spurious drift.
 */
export const DRIFT_RELATED_FLOOR = 0.08;

/**
 * Detect drift between an old and new narrative snapshot.
 * Returns null when identical/near-identical, or when topically unrelated.
 * Otherwise returns a NarrativeDriftEvent with before/after, an explanation,
 * a confidence, and a driftScore (1 - similarity).
 */
export function detectNarrativeDrift(
  oldText: string,
  newText: string,
  now: string,
): NarrativeDriftEvent | null {
  const a = oldText?.trim() ?? '';
  const b = newText?.trim() ?? '';
  if (!a || !b) return null;

  const similarity = textSimilarity(a, b);
  if (similarity >= DRIFT_SAME_THRESHOLD) return null; // essentially unchanged

  const relatedness = jaccard(tokenSet(a), tokenSet(b));
  if (relatedness < DRIFT_RELATED_FLOOR) return null; // unrelated topics, not drift

  const driftScore = round(clamp(1 - similarity));
  // Confidence: higher when clearly changed yet still clearly related.
  const confidence = round(clamp(0.4 + 0.4 * driftScore + 0.2 * relatedness, 0, 0.95));

  const explanation =
    `Narrative drift detected: similarity ${round(similarity)} (drift ${driftScore}), ` +
    `topical overlap ${round(relatedness)}. ` +
    `Before: "${snippet(a, 80)}" → After: "${snippet(b, 80)}".`;

  return {
    before: a,
    after: b,
    explanation,
    confidence,
    driftScore,
    detectedAt: now,
  };
}

/**
 * Track drift across an ORDERED timeline of snapshots, comparing each
 * consecutive pair. Returns the drift events found (skipping no-drift pairs).
 * `at` on each snapshot is used as the detectedAt for that step.
 */
export function trackNarrative(
  snapshots: { text: string; at: string }[],
): NarrativeDriftEvent[] {
  const events: NarrativeDriftEvent[] = [];
  for (let i = 1; i < snapshots.length; i += 1) {
    const ev = detectNarrativeDrift(
      snapshots[i - 1].text,
      snapshots[i].text,
      snapshots[i].at,
    );
    if (ev) events.push(ev);
  }
  return events;
}
