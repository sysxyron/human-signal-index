// =============================================================================
// @hsi/source-intelligence — change detection across captures.
//
// detectChange compares a prior capture to a new one using hash equality plus
// lexical similarity (token + trigram Jaccard) to classify the change. Pure &
// deterministic. diffRssFeeds computes added/removed/changed items by id+hash.
// =============================================================================

import { round, textSimilarity } from '../internal/text';
import type { CapturedDoc, ChangeResult, RssItem } from '../types';

/** Major-change threshold: similarity below this means a substantial rewrite. */
export const MAJOR_CHANGE_THRESHOLD = 0.6;
/** Below this counts as a (minor) modification; at/above => effectively same. */
export const MODIFIED_THRESHOLD = 0.995;

function toText(x: CapturedDoc | string | null): string {
  if (x == null) return '';
  return typeof x === 'string' ? x : x.bodyText;
}

function toHash(x: CapturedDoc | string | null): string | undefined {
  if (x == null) return undefined;
  return typeof x === 'string' ? undefined : x.contentHash;
}

/**
 * Compare a previous capture (or null = first observation) to a new capture.
 * - null before            → { changed:true, changeType:'new' }
 * - identical hash/text     → { changed:false, changeType:'none' }
 * - similarity < MAJOR     → 'major'
 * - otherwise              → 'modified'
 * Pure: no clock, no randomness.
 */
export function detectChange(
  before: CapturedDoc | string | null,
  after: CapturedDoc | string,
): ChangeResult {
  const beforeHash = toHash(before);
  const afterHash = toHash(after);
  const beforeText = toText(before);
  const afterText = toText(after);

  if (before == null || beforeText === '') {
    return {
      changed: true,
      changeType: 'new',
      beforeHash,
      afterHash,
      similarity: 0,
      summary: 'First observation of this source (no prior capture).',
    };
  }

  // Fast path: identical hashes => unchanged.
  if (beforeHash && afterHash && beforeHash === afterHash) {
    return {
      changed: false,
      changeType: 'none',
      beforeHash,
      afterHash,
      similarity: 1,
      summary: 'Content hash unchanged since last capture.',
    };
  }

  const similarity = textSimilarity(beforeText, afterText);

  if (similarity >= MODIFIED_THRESHOLD) {
    return {
      changed: false,
      changeType: 'none',
      beforeHash,
      afterHash,
      similarity,
      summary: 'No meaningful textual change (similarity ≈ 1).',
    };
  }

  if (similarity < MAJOR_CHANGE_THRESHOLD) {
    return {
      changed: true,
      changeType: 'major',
      beforeHash,
      afterHash,
      similarity,
      summary: `Major change: text similarity ${round(similarity)} below ${MAJOR_CHANGE_THRESHOLD}.`,
    };
  }

  return {
    changed: true,
    changeType: 'modified',
    beforeHash,
    afterHash,
    similarity,
    summary: `Modified: text similarity ${round(similarity)}.`,
  };
}

export interface RssFeedDiff {
  added: RssItem[];
  removed: RssItem[];
  /** Same id, different contentHash. */
  changed: RssItem[];
}

/**
 * Diff two RSS captures by item id. Added = in after only; removed = in before
 * only; changed = present in both with a differing contentHash. Pure.
 */
export function diffRssFeeds(
  beforeItems: RssItem[],
  afterItems: RssItem[],
): RssFeedDiff {
  const beforeById = new Map(beforeItems.map((i) => [i.id, i]));
  const afterById = new Map(afterItems.map((i) => [i.id, i]));

  const added: RssItem[] = [];
  const removed: RssItem[] = [];
  const changed: RssItem[] = [];

  for (const item of afterItems) {
    const prev = beforeById.get(item.id);
    if (!prev) added.push(item);
    else if (prev.contentHash !== item.contentHash) changed.push(item);
  }
  for (const item of beforeItems) {
    if (!afterById.has(item.id)) removed.push(item);
  }
  return { added, removed, changed };
}
