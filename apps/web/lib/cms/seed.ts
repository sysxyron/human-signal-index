'use server';

// =============================================================================
// HSI Phase 31B — CMS seed/backfill action. ADMIN-ONLY. Inserts the existing
// hardcoded site content (pages/blocks/navigation/role/mission/badge/onboarding/
// email) into the CMS tables ONLY IF MISSING — fully idempotent + safe to rerun.
// Every seed run is audited (cms_audit_log). No RBAC/auth/middleware changes.
// =============================================================================

import {
  SEED_PAGES, SEED_NAV, SEED_ROLE_CONTENT, SEED_MISSION_CONTENT, SEED_BADGE_CONTENT,
  SEED_ONBOARDING, SEED_EMAIL_TEMPLATES, selectMissing,
} from './seed-data';
import { requireAdmin, supabaseConfigured, notConfigured, adminFail, type DbResult } from '@/lib/admin/guard';

export interface SeedResult { pages: number; navItems: number; roles: number; missions: number; badges: number; onboarding: number; emails: number }

/** ADMIN: seed existing site content into the CMS (idempotent). */
export async function seedCmsContentAction(): Promise<DbResult<SeedResult>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { db, user } = gate.ctx;
  const result: SeedResult = { pages: 0, navItems: 0, roles: 0, missions: 0, badges: 0, onboarding: 0, emails: 0 };
  try {
    const existingKeys = async (table: string, col: string): Promise<Set<string>> => {
      try { const { data } = await db.from(table).select(col); return new Set(((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => String(r[col]))); } catch { return new Set(); }
    };

    // 1. Pages + blocks.
    const haveSlugs = await existingKeys('cms_pages', 'slug');
    for (const p of selectMissing(SEED_PAGES, haveSlugs, (x) => x.slug)) {
      const { data, error } = await db.from('cms_pages').insert({ slug: p.slug, page_type: p.pageType, title: p.title, status: p.status, seo: p.seo, created_by: user.id, updated_by: user.id, published_at: p.status === 'published' ? new Date().toISOString() : null }).select('id').single();
      if (error || !data) continue;
      const pageId = String((data as { id: string }).id);
      if (p.blocks.length) await db.from('cms_blocks').insert(p.blocks.map((b, i) => ({ page_id: pageId, block_type: b.type, position: i, content: b.content })));
      result.pages++;
    }

    // 2. Navigation (key = location:href).
    const haveNav = await (async () => {
      try { const { data } = await db.from('cms_navigation').select('location, href'); return new Set(((data ?? []) as Array<{ location: string; href: string }>).map((r) => `${r.location}:${r.href}`)); } catch { return new Set<string>(); }
    })();
    const missingNav = selectMissing(SEED_NAV, haveNav, (n) => `${n.location}:${n.href}`);
    if (missingNav.length) { await db.from('cms_navigation').insert(missingNav.map((n) => ({ location: n.location, label: n.label, href: n.href, position: n.position, active: true }))); result.navItems = missingNav.length; }

    // 3. Role content (PK role).
    const haveRoles = await existingKeys('cms_role_content', 'role');
    const missingRoles = selectMissing(SEED_ROLE_CONTENT, haveRoles, (r) => r.role);
    if (missingRoles.length) { await db.from('cms_role_content').insert(missingRoles.map((r) => ({ role: r.role, title: r.title, description: r.description, updated_by: user.id }))); result.roles = missingRoles.length; }

    // 4. Mission content (PK mission_key).
    const haveMissions = await existingKeys('cms_mission_content', 'mission_key');
    const missingMissions = selectMissing(SEED_MISSION_CONTENT, haveMissions, (m) => m.missionKey);
    if (missingMissions.length) { await db.from('cms_mission_content').insert(missingMissions.map((m) => ({ mission_key: m.missionKey, title: m.title, instructions: m.instructions, rewards: m.rewards, requirements: m.requirements, updated_by: user.id }))); result.missions = missingMissions.length; }

    // 5. Badge content (PK badge_id).
    const haveBadges = await existingKeys('cms_badge_content', 'badge_id');
    const missingBadges = selectMissing(SEED_BADGE_CONTENT, haveBadges, (b) => b.badgeId);
    if (missingBadges.length) { await db.from('cms_badge_content').insert(missingBadges.map((b) => ({ badge_id: b.badgeId, name: b.name, description: b.description, unlock_requirements: b.unlockRequirements, updated_by: user.id }))); result.badges = missingBadges.length; }

    // 6. Onboarding content (PK key).
    const haveOnboard = await existingKeys('cms_onboarding_content', 'key');
    const missingOnboard = selectMissing(SEED_ONBOARDING, haveOnboard, (o) => o.key);
    if (missingOnboard.length) { await db.from('cms_onboarding_content').insert(missingOnboard.map((o) => ({ key: o.key, title: o.title, body: o.body, updated_by: user.id }))); result.onboarding = missingOnboard.length; }

    // 7. Email templates (UNIQUE key).
    const haveEmails = await existingKeys('cms_email_templates', 'key');
    const missingEmails = selectMissing(SEED_EMAIL_TEMPLATES, haveEmails, (e) => e.key);
    if (missingEmails.length) { await db.from('cms_email_templates').insert(missingEmails.map((e) => ({ key: e.key, subject: e.subject, body: e.body, updated_by: user.id }))); result.emails = missingEmails.length; }

    await db.from('cms_audit_log').insert({ actor: user.id, action: 'seed_content', entity_kind: 'cms', entity_id: 'seed', metadata: result as unknown as Record<string, unknown> });
    return { ok: true, data: result };
  } catch (e) { return adminFail(e); }
}
