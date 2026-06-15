// =============================================================================
// Block list validation + serialisation. PURE.
// =============================================================================

import { isSiteBlockType, validateSiteBlock } from './blocks';
import type { BlockValidation, SiteBlock } from './types';

/** Validate an ordered block list: known types, unique positions, valid content. */
export function validateBlocks(blocks: SiteBlock[]): BlockValidation {
  const issues = [];
  const positions = new Set<number>();
  for (const b of blocks) {
    if (!isSiteBlockType(b.type)) { issues.push({ blockId: b.id, message: `Unknown block type '${b.type}'.` }); continue; }
    if (positions.has(b.position)) issues.push({ blockId: b.id, field: 'position', message: 'Duplicate block position.' });
    positions.add(b.position);
    issues.push(...validateSiteBlock(b));
  }
  return { ok: issues.length === 0, issues };
}

/** Serialise blocks to a stable JSON string (sorted by position). */
export function serializeBlocks(blocks: SiteBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return JSON.stringify(sorted);
}

/** Deserialise + sanitise: drop unknown-type blocks, renumber positions 0..n-1. */
export function deserializeBlocks(json: string): SiteBlock[] {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is SiteBlock => Boolean(b) && typeof b === 'object' && isSiteBlockType((b as SiteBlock).type))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((b, i) => ({ id: String(b.id ?? `b${i}`), type: b.type, position: i, content: (b.content ?? {}) as Record<string, unknown> }));
}

/** Renumber positions to a clean 0..n-1 sequence (after edit/reorder). */
export function normalizeBlocks(blocks: SiteBlock[]): SiteBlock[] {
  return [...blocks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((b, i) => ({ ...b, position: i }));
}
