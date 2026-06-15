// =============================================================================
// Version history + rollback (Deliverables 7, 10). PURE.
// A revision is an immutable snapshot of a page draft. Rollback produces a NEW
// draft from a past snapshot (it never mutates history) — so the audit trail is
// preserved and rollback is itself a new revision.
// =============================================================================

import type { CmsRevision, PageDraft } from './types';

export interface RevisionInput {
  id: string;
  author: string;
  changeSummary: string;
  at: string;
}

/** Snapshot the current draft as an immutable revision. PURE. */
export function createRevision(draft: PageDraft, input: RevisionInput): CmsRevision {
  return {
    id: input.id,
    pageId: draft.page.id,
    author: input.author,
    changeSummary: input.changeSummary || 'Saved draft.',
    at: input.at,
    // Deep-ish clone so later edits to `draft` never mutate the snapshot.
    snapshot: { page: { ...draft.page, seo: draft.page.seo ? { ...draft.page.seo } : undefined }, blocks: draft.blocks.map((b) => ({ ...b, content: { ...b.content } })) },
  };
}

/**
 * Roll back to a revision: returns the snapshot as a fresh DRAFT (status forced to
 * 'draft' so a rollback is never auto-published). The caller persists this as the
 * new current draft + records a new revision. PURE.
 */
export function rollbackRevision(revision: CmsRevision): PageDraft {
  return {
    page: { ...revision.snapshot.page, status: 'draft' },
    blocks: revision.snapshot.blocks.map((b) => ({ ...b, content: { ...b.content } })),
  };
}

/** A short change summary by diffing two drafts (block count + title/status). PURE. */
export function summariseChange(prev: PageDraft | null, next: PageDraft): string {
  if (!prev) return 'Created page.';
  const parts: string[] = [];
  if (prev.page.title !== next.page.title) parts.push('title');
  if (prev.page.status !== next.page.status) parts.push(`status→${next.page.status}`);
  const d = next.blocks.length - prev.blocks.length;
  if (d > 0) parts.push(`+${d} block(s)`);
  else if (d < 0) parts.push(`${d} block(s)`);
  return parts.length ? `Updated ${parts.join(', ')}.` : 'Edited content.';
}
