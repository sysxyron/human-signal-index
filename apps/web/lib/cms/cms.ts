'use server';

// =============================================================================
// HSI Phase 31 — CMS DAL. SERVER-ONLY. All mutations are ADMIN-ONLY (requireAdmin
// + admin-all RLS) and audited (cms_audit_log + cms_publish_events). Publishing
// validates via the pure @hsi/cms-engine. Public reads return PUBLISHED content
// only (callers fall back to hardcoded copy). RBAC is never modified here.
// =============================================================================

import {
  buildPage, validatePage, canTransition, createRevision, rollbackRevision as engineRollback,
  type CmsBlock, type CmsPage, type PageDraft, type PageStatus,
} from '@hsi/cms-engine';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, supabaseConfigured, notConfigured, adminFail, recordSecurityAudit, type DbResult } from '@/lib/admin/guard';
import { demoPages, demoDraft } from '@hsi/cms-engine';

export interface PageListRow { id: string; slug: string; pageType: string; title: string; status: PageStatus; updatedAt: string | null }

function mapPage(r: Record<string, unknown>): CmsPage {
  return { id: String(r.id), slug: String(r.slug), pageType: r.page_type as CmsPage['pageType'], title: String(r.title), status: r.status as PageStatus, seo: (r.seo as CmsPage['seo']) ?? undefined, updatedAt: (r.updated_at as string) ?? null, publishedAt: (r.published_at as string) ?? null };
}
function mapBlock(r: Record<string, unknown>): CmsBlock {
  return { id: String(r.id), type: r.block_type as CmsBlock['type'], position: Number(r.position ?? 0), content: (r.content as Record<string, unknown>) ?? {} };
}

async function audit(db: ReturnType<typeof createClient>, actor: string, action: string, entityKind: string, entityId: string, metadata?: Record<string, unknown>): Promise<void> {
  try { await db.from('cms_audit_log').insert({ actor, action, entity_kind: entityKind, entity_id: entityId, metadata: metadata ?? {} }); } catch { /* best-effort */ }
}

/** ADMIN: list all pages. */
export async function listPages(): Promise<DbResult<PageListRow[]> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, demo: true, data: demoPages.map((p) => ({ id: p.id, slug: p.slug, pageType: p.pageType, title: p.title, status: p.status, updatedAt: p.updatedAt ?? null })) };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { data, error } = await gate.ctx.db.from('cms_pages').select('*').order('updated_at', { ascending: false });
    if (error) return adminFail(error);
    return { ok: true, data: (data ?? []).map((r) => { const p = mapPage(r as Record<string, unknown>); return { id: p.id, slug: p.slug, pageType: p.pageType, title: p.title, status: p.status, updatedAt: p.updatedAt ?? null }; }) };
  } catch (e) { return adminFail(e); }
}

/** ADMIN: a page + its ordered blocks. */
export async function getPage(id: string): Promise<DbResult<PageDraft> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, demo: true, data: demoDraft };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { data: page, error } = await gate.ctx.db.from('cms_pages').select('*').eq('id', id).single();
    if (error || !page) return adminFail(error ?? new Error('Page not found.'));
    const { data: blocks } = await gate.ctx.db.from('cms_blocks').select('*').eq('page_id', id).order('position', { ascending: true });
    return { ok: true, data: { page: mapPage(page as Record<string, unknown>), blocks: (blocks ?? []).map((b) => mapBlock(b as Record<string, unknown>)) } };
  } catch (e) { return adminFail(e); }
}

export interface SaveDraftInput { id?: string; slug: string; pageType: CmsPage['pageType']; title: string; seo?: CmsPage['seo']; blocks: CmsBlock[]; changeSummary?: string }

/** ADMIN: create/update a page draft (+ revision snapshot + audit). Never publishes. */
export async function saveDraft(input: SaveDraftInput): Promise<DbResult<{ id: string }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { db, user } = gate.ctx;
  try {
    // Upsert the page (status stays draft unless already set; new pages start draft).
    const pageRow = { slug: input.slug, page_type: input.pageType, title: input.title, seo: input.seo ?? null, updated_by: user.id, status: 'draft' as const };
    let pageId = input.id;
    if (pageId) {
      // Preserve existing status (don't force-draft a published page on edit).
      const { data: existing } = await db.from('cms_pages').select('status').eq('id', pageId).maybeSingle();
      const status = (existing as { status?: PageStatus } | null)?.status ?? 'draft';
      const { error } = await db.from('cms_pages').update({ ...pageRow, status }).eq('id', pageId);
      if (error) return adminFail(error);
    } else {
      const { data, error } = await db.from('cms_pages').insert({ ...pageRow, created_by: user.id }).select('id').single();
      if (error || !data) return adminFail(error ?? new Error('Could not create page.'));
      pageId = String((data as { id: string }).id);
    }

    // Replace blocks (simple + correct for an editor save).
    await db.from('cms_blocks').delete().eq('page_id', pageId);
    if (input.blocks.length > 0) {
      const rows = input.blocks.map((b, i) => ({ page_id: pageId, block_type: b.type, position: i, content: b.content ?? {} }));
      const { error } = await db.from('cms_blocks').insert(rows);
      if (error) return adminFail(error);
    }

    // Revision snapshot via the engine (immutable history).
    const draft: PageDraft = { page: mapPage({ id: pageId, slug: input.slug, page_type: input.pageType, title: input.title, status: 'draft', seo: input.seo }), blocks: input.blocks };
    const rev = createRevision(draft, { id: 'pending', author: user.id, changeSummary: input.changeSummary ?? 'Saved draft.', at: new Date().toISOString() });
    await db.from('cms_revisions').insert({ page_id: pageId, author: user.id, change_summary: rev.changeSummary, snapshot: rev.snapshot });
    await audit(db, user.id, 'save_draft', 'cms_page', pageId);
    return { ok: true, data: { id: pageId } };
  } catch (e) { return adminFail(e); }
}

/** ADMIN: publish a page (validates via engine; records publish event + audit). */
export async function publishPage(id: string): Promise<DbResult<{ id: string; status: PageStatus }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { db, user } = gate.ctx;
  try {
    const res = await getPage(id);
    if (!res.ok) return res;
    const draft = res.data;
    const v = validatePage(draft);
    if (!v.ok) return { ok: false, error: `Cannot publish: ${v.issues.map((i) => i.message).join(' ')}`, code: 'DB_ERROR' };
    if (!canTransition(draft.page.status, 'published')) return { ok: false, error: `Cannot publish from '${draft.page.status}'.`, code: 'DB_ERROR' };
    const { error } = await db.from('cms_pages').update({ status: 'published', published_at: new Date().toISOString(), updated_by: user.id }).eq('id', id);
    if (error) return adminFail(error);
    await db.from('cms_publish_events').insert({ page_id: id, action: 'published', actor: user.id });
    await audit(db, user.id, 'publish', 'cms_page', id);
    await recordSecurityAudit(db, { actorId: user.id, eventType: 'cms_publish', severity: 'info', message: `Published CMS page ${id}` });
    return { ok: true, data: { id, status: 'published' } };
  } catch (e) { return adminFail(e); }
}

/** ADMIN: archive a page. */
export async function archivePage(id: string): Promise<DbResult<{ id: string; status: PageStatus }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { db, user } = gate.ctx;
  try {
    const { error } = await db.from('cms_pages').update({ status: 'archived', updated_by: user.id }).eq('id', id);
    if (error) return adminFail(error);
    await db.from('cms_publish_events').insert({ page_id: id, action: 'archived', actor: user.id });
    await audit(db, user.id, 'archive', 'cms_page', id);
    return { ok: true, data: { id, status: 'archived' } };
  } catch (e) { return adminFail(e); }
}

export interface RevisionRow { id: string; author: string | null; changeSummary: string | null; at: string }

/** ADMIN: list a page's revisions (newest first). */
export async function listRevisions(pageId: string): Promise<DbResult<RevisionRow[]>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { data, error } = await gate.ctx.db.from('cms_revisions').select('id, author, change_summary, created_at').eq('page_id', pageId).order('created_at', { ascending: false }).limit(50);
    if (error) return adminFail(error);
    return { ok: true, data: (data ?? []).map((r) => { const rec = r as Record<string, unknown>; return { id: String(rec.id), author: (rec.author as string) ?? null, changeSummary: (rec.change_summary as string) ?? null, at: String(rec.created_at) }; }) };
  } catch (e) { return adminFail(e); }
}

/** ADMIN: roll back a page to a past revision (restored as a new DRAFT + audit). */
export async function rollbackToRevision(pageId: string, revisionId: string): Promise<DbResult<{ id: string }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { db, user } = gate.ctx;
  try {
    const { data: rev, error } = await db.from('cms_revisions').select('*').eq('id', revisionId).eq('page_id', pageId).single();
    if (error || !rev) return adminFail(error ?? new Error('Revision not found.'));
    const snapshot = (rev as { snapshot: PageDraft }).snapshot;
    const restored = engineRollback({ id: revisionId, pageId, author: '', changeSummary: '', at: '', snapshot });
    // Persist restored draft via saveDraft semantics (blocks replace + new revision).
    const save = await saveDraft({ id: pageId, slug: restored.page.slug, pageType: restored.page.pageType, title: restored.page.title, seo: restored.page.seo, blocks: restored.blocks, changeSummary: `Rolled back to revision ${revisionId.slice(0, 8)}.` });
    if (!save.ok) return save;
    await db.from('cms_pages').update({ status: 'draft' }).eq('id', pageId);
    await db.from('cms_publish_events').insert({ page_id: pageId, action: 'rolled_back', actor: user.id, metadata: { revisionId } });
    await audit(db, user.id, 'rollback', 'cms_page', pageId, { revisionId });
    return { ok: true, data: { id: pageId } };
  } catch (e) { return adminFail(e); }
}

// ---- navigation + media (Deliverables 13, 14) -----------------------------
export interface NavItem { id: string; location: string; label: string; href: string; position: number; active: boolean }
export interface MediaItem { id: string; filename: string; mimeType: string | null; sizeBytes: number | null; url: string; uploadedAt: string }

const DEMO_NAV: NavItem[] = [
  { id: 'n1', location: 'header', label: 'About', href: '/about', position: 0, active: true },
  { id: 'n2', location: 'header', label: 'Methodology', href: '/methodology', position: 1, active: true },
  { id: 'n3', location: 'footer', label: 'Ethics', href: '/ethics', position: 0, active: true },
];
const DEMO_MEDIA: MediaItem[] = [
  { id: 'm1', filename: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 4096, url: '/logo.svg', uploadedAt: '2026-06-10T10:00:00Z' },
];

/** ADMIN: list navigation items (grouped by the page that renders them). */
export async function listNavigation(): Promise<DbResult<NavItem[]> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, demo: true, data: DEMO_NAV };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { data, error } = await gate.ctx.db.from('cms_navigation').select('*').order('location').order('position');
    if (error) return adminFail(error);
    return { ok: true, data: (data ?? []).map((r) => { const x = r as Record<string, unknown>; return { id: String(x.id), location: String(x.location), label: String(x.label), href: String(x.href), position: Number(x.position ?? 0), active: Boolean(x.active) }; }) };
  } catch (e) { return adminFail(e); }
}

/** ADMIN: list media library items. */
export async function listMedia(): Promise<DbResult<MediaItem[]> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, demo: true, data: DEMO_MEDIA };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { data, error } = await gate.ctx.db.from('cms_media').select('*').order('created_at', { ascending: false });
    if (error) return adminFail(error);
    return { ok: true, data: (data ?? []).map((r) => { const x = r as Record<string, unknown>; return { id: String(x.id), filename: String(x.filename), mimeType: (x.mime_type as string) ?? null, sizeBytes: (x.size_bytes as number) ?? null, url: String(x.url), uploadedAt: String(x.created_at) }; }) };
  } catch (e) { return adminFail(e); }
}

// ---- public read (marketing/dashboard render; falls back to hardcoded) -----
export interface PublishedPage { page: CmsPage; blocks: CmsBlock[]; seo: { title: string; description: string } }

/** Public: a PUBLISHED page by slug, assembled via the engine, or null (caller falls back). */
export async function getPublishedPage(slug: string): Promise<PublishedPage | null> {
  if (!supabaseConfigured()) return null;
  try {
    const db = createClient();
    const { data: page } = await db.from('cms_pages').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
    if (!page) return null;
    const { data: blocks } = await db.from('cms_blocks').select('*').eq('page_id', (page as { id: string }).id).order('position', { ascending: true });
    const built = buildPage({ page: mapPage(page as Record<string, unknown>), blocks: (blocks ?? []).map((b) => mapBlock(b as Record<string, unknown>)) });
    return { page: built.page, blocks: built.blocks, seo: { title: built.seo.title, description: built.seo.description } };
  } catch { return null; }
}
