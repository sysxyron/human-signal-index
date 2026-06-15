'use server';

// =============================================================================
// HSI Phase 34 — site operations DAL. ADMIN-ONLY writes (requireAdmin + admin-all
// RLS). Branding/site settings, role/mission/badge content CRUD, media archive +
// search, and nav visibility — every mutation recorded to cms_audit_log with
// previous_value + new_value (immutable change tracking). No service-role key in
// app code; no RBAC/auth/middleware changes. Offline → demo.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { requireAdmin, supabaseConfigured, notConfigured, adminFail, type DbResult } from '@/lib/admin/guard';

type Db = ReturnType<typeof createClient>;

/** Append-only change record with before/after (Deliverable I1). */
async function auditChange(db: Db, actor: string, action: string, entityKind: string, entityId: string, previous: unknown, next: unknown): Promise<void> {
  try {
    await db.from('cms_audit_log').insert({ actor, action, entity_kind: entityKind, entity_id: entityId, previous_value: previous ?? null, new_value: next ?? null });
  } catch { /* best-effort */ }
}

// ---- site settings (B1) ----------------------------------------------------
export interface SiteSettings { siteName: string; logoUrl: string; faviconUrl: string; footerText: string; contactEmail: string; socialLinks: Record<string, string>; theme: Record<string, unknown> }
const DEMO_SETTINGS: SiteSettings = { siteName: 'Human Signal Index', logoUrl: '/logo.svg', faviconUrl: '/favicon.ico', footerText: '© Human Signal Index.', contactEmail: 'contact@hsi.example', socialLinks: { x: 'https://x.com/hsi' }, theme: {} };

function mapSettings(r: Record<string, unknown>): SiteSettings {
  return { siteName: String(r.site_name ?? ''), logoUrl: String(r.logo_url ?? ''), faviconUrl: String(r.favicon_url ?? ''), footerText: String(r.footer_text ?? ''), contactEmail: String(r.contact_email ?? ''), socialLinks: (r.social_links as Record<string, string>) ?? {}, theme: (r.theme as Record<string, unknown>) ?? {} };
}

export async function getSiteSettingsAction(): Promise<DbResult<SiteSettings> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, data: DEMO_SETTINGS, demo: true };
  try {
    const db = createClient();
    const { data } = await db.from('cms_site_settings').select('*').eq('id', 'default').maybeSingle();
    return { ok: true, data: data ? mapSettings(data as Record<string, unknown>) : DEMO_SETTINGS };
  } catch (e) { return adminFail(e); }
}

export async function saveSiteSettingsAction(input: SiteSettings): Promise<DbResult<{ ok: true }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { db, user } = gate.ctx;
  try {
    const { data: prev } = await db.from('cms_site_settings').select('*').eq('id', 'default').maybeSingle();
    const row = { id: 'default', site_name: input.siteName, logo_url: input.logoUrl, favicon_url: input.faviconUrl, footer_text: input.footerText, contact_email: input.contactEmail, social_links: input.socialLinks, theme: input.theme, updated_by: user.id };
    const { error } = await db.from('cms_site_settings').upsert(row, { onConflict: 'id' });
    if (error) return adminFail(error);
    await auditChange(db, user.id, 'site_settings_update', 'cms_site_settings', 'default', prev ?? null, row);
    return { ok: true, data: { ok: true } };
  } catch (e) { return adminFail(e); }
}

// ---- generic content CRUD (role / mission / badge) -------------------------
async function listRows(table: string, order: string): Promise<DbResult<Array<Record<string, unknown>>> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, data: [], demo: true };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try { const { data, error } = await gate.ctx.db.from(table).select('*').order(order); if (error) return adminFail(error); return { ok: true, data: (data ?? []) as Array<Record<string, unknown>> }; }
  catch (e) { return adminFail(e); }
}

export async function listRoleContentAction() { return listRows('cms_role_content', 'role'); }
export async function listMissionContentAction() { return listRows('cms_mission_content', 'mission_key'); }
export async function listBadgeContentAction() { return listRows('cms_badge_content', 'badge_id'); }

async function upsertContent(table: string, conflict: string, key: string, row: Record<string, unknown>, action: string): Promise<DbResult<{ ok: true }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { db, user } = gate.ctx;
  try {
    const { data: prev } = await db.from(table).select('*').eq(conflict, key).maybeSingle();
    const { error } = await db.from(table).upsert({ ...row, updated_by: user.id }, { onConflict: conflict });
    if (error) return adminFail(error);
    await auditChange(db, user.id, action, table, key, prev ?? null, row);
    return { ok: true, data: { ok: true } };
  } catch (e) { return adminFail(e); }
}

export async function saveRoleContentAction(input: { role: string; title: string; description: string; details?: Record<string, unknown> }) {
  return upsertContent('cms_role_content', 'role', input.role, { role: input.role, title: input.title, description: input.description, details: input.details ?? {} }, 'role_content_update');
}
export async function saveMissionContentAction(input: { missionKey: string; title: string; instructions: string; xpReward: number; intelCredits: number; difficulty: string }) {
  return upsertContent('cms_mission_content', 'mission_key', input.missionKey, { mission_key: input.missionKey, title: input.title, instructions: input.instructions, xp_reward: input.xpReward, intel_credits: input.intelCredits, difficulty: input.difficulty }, 'mission_content_update');
}
export async function saveBadgeContentAction(input: { badgeId: string; name: string; description: string; icon?: string; unlockRequirements: string; rewards?: string }) {
  return upsertContent('cms_badge_content', 'badge_id', input.badgeId, { badge_id: input.badgeId, name: input.name, description: input.description, icon: input.icon ?? null, unlock_requirements: input.unlockRequirements, rewards: input.rewards ?? null }, 'badge_content_update');
}

// ---- media archive + search (G1) ------------------------------------------
export async function searchMediaAction(query: string, includeArchived = false): Promise<DbResult<Array<{ id: string; filename: string; url: string; archived: boolean }>> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, demo: true, data: [{ id: 'm1', filename: 'logo.svg', url: '/logo.svg', archived: false }] };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    let q = gate.ctx.db.from('cms_media').select('id, filename, url, archived').order('created_at', { ascending: false }).limit(200);
    if (!includeArchived) q = q.eq('archived', false);
    if (query.trim()) q = q.ilike('filename', `%${query.trim()}%`);
    const { data, error } = await q;
    if (error) return adminFail(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), filename: String(r.filename), url: String(r.url), archived: Boolean(r.archived) })) };
  } catch (e) { return adminFail(e); }
}

export async function archiveMediaAction(id: string, archived: boolean): Promise<DbResult<{ id: string }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { error } = await gate.ctx.db.from('cms_media').update({ archived }).eq('id', id);
    if (error) return adminFail(error);
    await auditChange(gate.ctx.db, gate.ctx.user.id, archived ? 'media_archive' : 'media_restore', 'cms_media', id, { archived: !archived }, { archived });
    return { ok: true, data: { id } };
  } catch (e) { return adminFail(e); }
}

// ---- nav visibility (C2) ---------------------------------------------------
export async function setNavVisibilityAction(id: string, visibility: string): Promise<DbResult<{ id: string }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { error } = await gate.ctx.db.from('cms_navigation').update({ visibility }).eq('id', id);
    if (error) return adminFail(error);
    await auditChange(gate.ctx.db, gate.ctx.user.id, 'nav_visibility', 'cms_navigation', id, null, { visibility });
    return { ok: true, data: { id } };
  } catch (e) { return adminFail(e); }
}

// ---- site-ops summary (H1) -------------------------------------------------
export interface SiteOpsSummary { pages: number; published: number; media: number; navigation: number; missions: number; badges: number; roles: number; onboarding: number }
export async function getSiteOpsSummaryAction(): Promise<DbResult<SiteOpsSummary> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, demo: true, data: { pages: 12, published: 11, media: 1, navigation: 12, missions: 6, badges: 10, roles: 5, onboarding: 9 } };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const count = async (table: string, eq?: [string, unknown]): Promise<number> => {
      try { let q = db.from(table).select('*', { count: 'exact', head: true }); if (eq) q = q.eq(eq[0], eq[1]); const { count: c } = await q; return c ?? 0; } catch { return 0; }
    };
    const [pages, published, media, navigation, missions, badges, roles, onboarding] = await Promise.all([
      count('cms_pages'), count('cms_pages', ['status', 'published']), count('cms_media', ['archived', false]),
      count('cms_navigation'), count('cms_mission_content'), count('cms_badge_content'), count('cms_role_content'), count('cms_onboarding_content'),
    ]);
    return { ok: true, data: { pages, published, media, navigation, missions, badges, roles, onboarding } };
  } catch (e) { return adminFail(e); }
}
