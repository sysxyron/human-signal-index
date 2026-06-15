// =============================================================================
// Page assembly + validation + draft state machine (Deliverables 5, 6, 10). PURE.
// =============================================================================

import { validateBlock } from './blocks';
import type { BuiltPage, CmsBlock, PageDraft, PageStatus, ValidationResult } from './types';

/** Allowed workflow transitions (Deliverable 6). */
export const PAGE_TRANSITIONS: Record<PageStatus, PageStatus[]> = {
  draft: ['review', 'published', 'archived'],
  review: ['published', 'draft', 'archived'],
  published: ['archived', 'draft'],
  archived: ['draft'],
};

export function canTransition(from: PageStatus, to: PageStatus): boolean {
  return PAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Order blocks by position (stable) and produce a render-ready page + SEO. PURE. */
export function buildPage(draft: PageDraft): BuiltPage {
  const blocks = [...draft.blocks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const seo = draft.page.seo ?? {};
  return {
    page: draft.page,
    blocks,
    seo: {
      ...seo,
      title: (seo.title && seo.title.trim()) || draft.page.title,
      description: (seo.description && seo.description.trim()) || `${draft.page.title} — Human Signal Index`,
    },
  };
}

/**
 * Validate a page for PUBLISH-readiness: needs a title, a slug, ≥1 block, every
 * block valid, and unique block positions. PURE.
 */
export function validatePage(draft: PageDraft): ValidationResult {
  const issues = [];
  if (!draft.page.title || draft.page.title.trim().length === 0) issues.push({ field: 'title', message: 'Page needs a title.' });
  if (!draft.page.slug || !/^[a-z0-9-/]+$/.test(draft.page.slug)) issues.push({ field: 'slug', message: 'Page needs a valid slug (lowercase, hyphens).' });
  if (draft.blocks.length === 0) issues.push({ message: 'Page needs at least one block.' });
  const positions = new Set<number>();
  for (const b of draft.blocks) {
    if (positions.has(b.position)) issues.push({ blockId: b.id, field: 'position', message: 'Duplicate block position.' });
    positions.add(b.position);
    issues.push(...validateBlock(b));
  }
  return { ok: issues.length === 0, issues };
}

/** Whether a draft may be published (valid + currently transition-able to published). */
export function canPublish(draft: PageDraft): boolean {
  return validatePage(draft).ok && canTransition(draft.page.status, 'published');
}

/** Re-number block positions to a clean 0..n-1 sequence (after add/remove/reorder). */
export function normalizePositions(blocks: CmsBlock[]): CmsBlock[] {
  return [...blocks]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((b, i) => ({ ...b, position: i }));
}
