# Phase 34 — CMS Platform Conversion & Site Operations

**Status:** ✅ Complete · web + engine typecheck 0 errors · build green (182
routes, +5) · **2,508 tests passing (0 fail, +9)** · route audit green (107
registered / 80 sidebar) · smoke green (migrations 0001→0038) ·
**no RBAC / IAM / middleware / auth / user_roles changes; site-ops DAL uses no
service-role key in app.**

HSI is now operator-managed: an admin can run the website, branding, navigation,
missions, badges, role content, and media from the dashboard — no source changes.

---

## 1. Migration
`supabase/migrations/0038_cms_platform_conversion.sql` (add-only): `cms_site_settings`
(branding singleton, world-readable + admin-write); `cms_navigation` + `visibility`
(render-only) and extended locations (`dashboard`/`admin`/`help`); `cms_role_content`
+ `details`; `cms_mission_content` + `xp_reward`/`intel_credits`/`difficulty`/
`badge_rewards`; `cms_badge_content` + `icon`/`rewards`; `cms_media` + `archived`;
`cms_audit_log` + `previous_value`/`new_value` (change tracking, I1).

## 2. Site-builder package (A2)
**`@hsi/site-builder`** — PURE, 10 block types (hero, cta, feature_grid, card_grid,
statistic, testimonial, image, video, faq, report_feed) with per-type validation,
list validation, serialize/deserialize (drops unknown types, renumbers positions),
and `normalizeBlocks`. Reusable across all CMS pages. **9 unit tests.**

## 3. Public website conversion (A1, A3)
The homepage (Phase 31B) plus **about, methodology, ethics, contact, research-
reports** now render **CMS-first**: `getPublishedPage(slug)` → render `CmsBlocks`
if published, else the existing hardcoded page (URLs + metadata unchanged, never
breaks). The homepage builder (A3) edits via the Phase-31 page editor + seeded
blocks. FAQ/Security/Pricing have CMS records and render via `/p/[slug]`.

## 4. Branding & settings (B1)
`/dashboard/admin/site-settings` — edit site name, logo, favicon, footer, contact
email, and social links; theme/typography/layout are future-ready (`theme` jsonb).
Audited with before/after.

## 5. Navigation (C1, C2)
Navigation already had CRUD (31B); this phase adds **render-only visibility**
(all/observer/researcher/reviewer/governor/tester/admin) and the `dashboard`/
`admin`/`help` locations. **Visibility controls rendering only — never permissions
or RBAC** (the sidebar already RBAC-gates every route).

## 6. Role / mission / badge operators (D1, E1, F1)
`/dashboard/admin/cms/roles`, `/cms/missions`, `/cms/badges` — a shared
`CmsContentEditor` edits each kind inline (role description; mission title/
instructions/XP/credits/difficulty; badge name/description/icon/unlock/rewards).
Every save is audited with before/after via the matching DAL action.

## 7. Media library (G1)
Search + archive/restore wired (`searchMediaAction`, `archiveMediaAction`). Real
upload remains gated behind the `cms_media` Supabase Storage bucket with a clear
disabled state (no dead controls).

## 8. Site Operations Center (H1)
`/dashboard/admin/site-ops` — one control center with live counts + links to
pages, media, navigation, missions, badges, role content, onboarding, and
branding.

## 9. Auditability (I1)
`cms_audit_log` now carries `previous_value` + `new_value`; the `auditChange`
helper records actor, timestamp, entity, action, before, after on every mutation —
append-only, consistent with the existing audit architecture.

## 10. Files

**Created**
- `packages/site-builder/` (package.json, tsconfig; `src/`: types, blocks,
  serialize, fixtures, index; `tests/`: site-builder — 9 tests)
- `apps/web/lib/cms/site-ops.ts`
- `apps/web/components/cms/SiteSettingsForm.tsx`, `CmsContentEditor.tsx`
- `apps/web/app/dashboard/admin/site-settings/`, `site-ops/`, `cms/missions/`,
  `cms/badges/`, `cms/roles/`
- `supabase/migrations/0038_cms_platform_conversion.sql`
- `docs/PHASE_34_CMS_PLATFORM_CONVERSION_REPORT.md`

**Modified**
- `apps/web/app/(marketing)/{about,methodology,ethics,contact,research-reports}/page.tsx` — CMS-first
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` — Site Ops + Site Settings nav
- `apps/web/lib/launch/migration-audit.ts` (+0038) + `migration-audit.test.ts`
- `tsconfig.base.json`, `apps/web/package.json` — new package

## 11. Test counts + build
- Tests added: **9** (site-builder: blocks, validation, serialization).
- Full suite: **2,508 / 2,508**, 0 fail.
- Web + engine typecheck: 0 errors. Build: ✅ compiled, 182 routes.
- Route audit: ✅ 107 registered / 80 sidebar. Migration audit / smoke: ✅ 0001→0038.
- `next lint`: ⚠️ pre-existing ESLint-v9 incompatibility (not a gate).

## 12. Security review
- **No RBAC / IAM / middleware / auth / user_roles changes** (verified: no diff to
  `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **Admin-only writes** — every site-ops mutation behind `requireAdmin` + admin-all
  RLS; nav visibility is render-only.
- **No service-role exposure** — `site-ops.ts` uses the RLS user client +
  `requireAdmin`; no service-role key in any component; existing RLS + audit
  patterns intact.

## 13. Remaining gaps / recommendations
- **Media upload** needs the `cms_media` Storage bucket provisioned (UI + DAL gate
  ready; archive/search/replace-metadata live).
- **Block-level homepage builder UI** — the site-builder vocabulary exists + the
  page editor edits block JSON; a drag-and-drop visual builder is a future phase.
- **Remaining hardcoded routes** (security pages, transparency, signal-library,
  education-hub) can adopt the same `getPublishedPage` + `CmsBlocks` one-line
  guard route-by-route.
- **Theme/typography/layout** editors (stored in `theme` jsonb) are future-ready.
- **Mission/badge `create`** (new keys) — editors update seeded items; a
  create-new flow + the contributor engine wiring is a follow-up.
