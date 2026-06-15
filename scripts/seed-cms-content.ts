// =============================================================================
// HSI Phase 31B — CMS seed/backfill CLI. Idempotent: inserts existing site
// content into the CMS tables only if missing. Safe to rerun. Uses the
// service-role client (server-only). Run: `npx tsx scripts/seed-cms-content.ts`.
//
// This mirrors seedCmsContentAction (admin UI) for ops/CI use. No emails sent.
// =============================================================================

import {
  SEED_PAGES, SEED_NAV, SEED_ROLE_CONTENT, SEED_MISSION_CONTENT, SEED_BADGE_CONTENT,
  SEED_ONBOARDING, SEED_EMAIL_TEMPLATES, selectMissing,
} from '../apps/web/lib/cms/seed-data';

async function main(): Promise<void> {
  const hasEnv = Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasEnv) {
    console.log('CMS seed: SUPABASE_SERVICE_ROLE_KEY not set — dry run.');
    console.log(`Would seed up to: ${SEED_PAGES.length} pages, ${SEED_NAV.length} nav items, ${SEED_ROLE_CONTENT.length} roles, ${SEED_MISSION_CONTENT.length} missions, ${SEED_BADGE_CONTENT.length} badges, ${SEED_ONBOARDING.length} onboarding, ${SEED_EMAIL_TEMPLATES.length} emails.`);
    return;
  }
  const { createServiceRoleClient } = await import('@hsi/database');
  const db = createServiceRoleClient() as unknown as { from(t: string): any };

  const keys = async (table: string, col: string): Promise<Set<string>> => {
    const { data } = await db.from(table).select(col);
    return new Set(((data ?? []) as Array<Record<string, unknown>>).map((r) => String(r[col])));
  };
  let pages = 0;
  const haveSlugs = await keys('cms_pages', 'slug');
  for (const p of selectMissing(SEED_PAGES, haveSlugs, (x) => x.slug)) {
    const { data } = await db.from('cms_pages').insert({ slug: p.slug, page_type: p.pageType, title: p.title, status: p.status, seo: p.seo, published_at: p.status === 'published' ? new Date().toISOString() : null }).select('id').single();
    if (data) { await db.from('cms_blocks').insert(p.blocks.map((b, i) => ({ page_id: (data as { id: string }).id, block_type: b.type, position: i, content: b.content }))); pages++; }
  }

  const haveNav = new Set(((await db.from('cms_navigation').select('location, href')).data ?? []).map((r: { location: string; href: string }) => `${r.location}:${r.href}`));
  const missNav = selectMissing(SEED_NAV, haveNav, (n) => `${n.location}:${n.href}`);
  if (missNav.length) await db.from('cms_navigation').insert(missNav.map((n) => ({ location: n.location, label: n.label, href: n.href, position: n.position, active: true })));

  const seedSimple = async (table: string, col: string, rows: Array<Record<string, unknown>>, keyOf: (r: Record<string, unknown>) => string): Promise<number> => {
    const have = await keys(table, col);
    const miss = selectMissing(rows, have, keyOf);
    if (miss.length) await db.from(table).insert(miss);
    return miss.length;
  };
  const roles = await seedSimple('cms_role_content', 'role', SEED_ROLE_CONTENT.map((r) => ({ role: r.role, title: r.title, description: r.description })), (r) => String(r.role));
  const missions = await seedSimple('cms_mission_content', 'mission_key', SEED_MISSION_CONTENT.map((m) => ({ mission_key: m.missionKey, title: m.title, instructions: m.instructions, rewards: m.rewards, requirements: m.requirements })), (r) => String(r.mission_key));
  const badges = await seedSimple('cms_badge_content', 'badge_id', SEED_BADGE_CONTENT.map((b) => ({ badge_id: b.badgeId, name: b.name, description: b.description, unlock_requirements: b.unlockRequirements })), (r) => String(r.badge_id));
  const onboarding = await seedSimple('cms_onboarding_content', 'key', SEED_ONBOARDING.map((o) => ({ key: o.key, title: o.title, body: o.body })), (r) => String(r.key));
  const emails = await seedSimple('cms_email_templates', 'key', SEED_EMAIL_TEMPLATES.map((e) => ({ key: e.key, subject: e.subject, body: e.body })), (r) => String(r.key));

  console.log(`CMS seed complete: ${pages} pages, ${missNav.length} nav, ${roles} roles, ${missions} missions, ${badges} badges, ${onboarding} onboarding, ${emails} emails.`);
}

main().catch((e) => { console.error('CMS seed failed:', e); process.exit(1); });
