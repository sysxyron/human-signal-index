# Phase 31B — CMS Content Seeding & Existing-Page Conversion

**Status:** ✅ Complete · web + engine typecheck 0 errors · build green ·
**2,499 tests passing (0 fail, +7)** · route audit green · migration audit green
(0001→0037, **no new migration needed**) ·
**no auth / RBAC / middleware changes; CMS DAL uses no service-role key in app.**

The CMS is no longer empty. Existing public pages, menus, and the role/mission/
badge/onboarding/email copy are now seedable into the CMS and editable from the
dashboard — and published CMS content renders publicly with a hardcoded fallback.

---

## 1. What was added
- **Pure seed data (`lib/cms/seed-data.ts`)** — deterministic CMS records for the
  existing content, derived from the real sources (role tasks, mission templates,
  badge defs, purpose options) plus a pure `selectMissing()` idempotency helper.
- **Idempotent seed action (`lib/cms/seed.ts`)** — admin-only `seedCmsContentAction`
  inserts only what's missing, audited to `cms_audit_log`.
- **CLI (`scripts/seed-cms-content.ts`)** — `npx tsx scripts/seed-cms-content.ts`
  (service-role; dry-run when env absent). Safe to rerun.
- **Navigation CRUD** — `createNavItem` / `updateNavItem` / `deleteNavItem` (audited)
  + a `NavManager` admin UI (add / edit / delete / activate).
- **Empty-state seeding** — "Seed existing site content" on the CMS dashboard +
  navigation manager; an idempotent "Backfill site content" action when content
  already exists.
- **CMS-first rendering** — homepage + `/p/[slug]` render published CMS content via
  a shared `CmsBlocks` renderer, falling back to hardcoded.

## 2. Seeded pages (Deliverables 2, 3)
**12 pages**: `home` (with hero / value / how-it-works card-grid / trust / CTA
blocks per D3), `trust`, `security`, `security-awareness`, `vulnerability-
disclosure`, `whistleblower`, `report-confidentially`, `about`, `faq`,
`research-reports`, `signal-library`, `education-hub`. Each has title, slug, SEO
title + description, and blocks; all validate publish-ready via the engine.

**Homepage status = `draft` (intentional).** To honour "do not break existing
pages" (D5), the flagship GlobeHero homepage stays the live default; the seeded
`home` page is editable + previewable and **takes over only when an admin
publishes it**. All other pages are seeded `published` so they render from the CMS
immediately. (Documented deviation from D2's blanket "published" for the homepage.)

## 3. Seeded navigation (Deliverable 4)
**12 links** across `header` (About, Methodology, Research Reports, Signal Library,
Education Hub), `footer` (Trust, Security, Ethics, Whistleblower, Vulnerability
Disclosure), and `dashboard_help` (FAQ, Education Hub). The navigation manager now
shows these and supports full CRUD.

## 4. Seeded structured content (Deliverables 7–11)
- **Role content** — 5 roles (label + summary + recommended tasks, from Phase-25
  role tasks).
- **Mission content** — 6 templates (title / instructions / rewards / requirements,
  from contributor-network).
- **Badge content** — 10 badges (name / description / unlock criteria).
- **Onboarding content** — 9 entries (purpose welcome + each purpose path +
  application instructions + tester/beta welcome).
- **Email templates** — 6 (invite, role approved, role rejected, mission assigned,
  beta invite, feedback request). **No emails are sent this phase.**

## 5. CMS-first routes (Deliverable 5)
The homepage (`app/(marketing)/page.tsx`) and `/p/[slug]` call `getPublishedPage(slug)`
first; if a published page exists they render its blocks via the shared `CmsBlocks`
component, otherwise the existing hardcoded page renders unchanged. Removing or
unpublishing CMS content never breaks the site.

## 6. Editable existing pages (Deliverable 6)
After seeding, `/dashboard/admin/cms` lists all seeded pages; opening one loads the
block editor with its existing blocks. Admins can edit text, save draft, publish,
and roll back (Phase-31 editor + revisions).

## 7. Media status (Deliverable 14)
The media manager lists `cms_media` records and shows an explicit disabled-state:
"Media upload requires a Supabase Storage bucket `cms_media`." No dead upload
controls — upload is wired in when the bucket is provisioned.

## 8. Audit (Deliverable 15)
Seeding writes a `cms_audit_log` `seed_content` entry (with per-kind counts);
navigation CRUD writes `nav_create` / `nav_update` / `nav_delete` entries; page
edits/publishes/rollbacks audit as in Phase 31.

## 9. Files

**Created**
- `apps/web/lib/cms/seed-data.ts` (+ `seed-data.test.ts`)
- `apps/web/lib/cms/seed.ts`
- `scripts/seed-cms-content.ts`
- `apps/web/components/cms/CmsSeedButton.tsx`, `NavManager.tsx`, `CmsBlocks.tsx`
- `docs/PHASE_31B_CMS_SEEDING_CONVERSION_REPORT.md`

**Modified**
- `apps/web/lib/cms/cms.ts` — navigation CRUD actions
- `apps/web/app/(marketing)/page.tsx` — CMS-first homepage (async + fallback)
- `apps/web/app/dashboard/admin/cms/page.tsx` — seed button + empty state
- `apps/web/app/dashboard/admin/cms/navigation/page.tsx` — NavManager (CRUD)
- `apps/web/app/dashboard/admin/cms/media/page.tsx` — disabled-state note

## 10. Verification

| Item | Result |
| --- | --- |
| Migration | none needed (Phase 31 tables reused; audit 0001→0037 green) |
| Tests added | 7 (seed-data idempotency + content shape) |
| Full test suite | ✅ **2,499 / 2,499**, 0 fail |
| Web / engine typecheck | ✅ 0 errors |
| Build | ✅ compiled |
| Route audit | ✅ all routes resolve |
| CLI dry-run | ✅ would seed 12 pages / 12 nav / 5 roles / 6 missions / 10 badges / 9 onboarding / 6 emails |
| `/dashboard/admin/cms` shows pages | ✅ after seed (offline shows labeled demo) |
| `/dashboard/admin/cms/navigation` shows links | ✅ after seed; full CRUD live |
| Homepage CMS-first + fallback | ✅ (fallback live by default; CMS on publish) |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 11. Security review
- **No auth / RBAC / middleware changes** (verified: no diff to `middleware.ts`,
  `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **No role escalation** — seeding + nav CRUD are admin-only (`requireAdmin` +
  admin-all RLS); no `user_roles` writes.
- **No service-role exposure** — the seed action + nav CRUD use the RLS user client
  + `requireAdmin`; only the optional CLI uses the service-role key server-side.

## 12. Remaining hardcoded / follow-ups
- **Homepage** renders the hardcoded flagship by default until an admin publishes
  the seeded `home` page (deliberate, to preserve the GlobeHero design).
- **Other marketing routes** (`/about`, `/methodology`, `/ethics`, security pages,
  etc.) still render their own hardcoded React; they now have CMS records and can
  adopt the `getPublishedPage(slug)` + `CmsBlocks` fallback pattern route-by-route
  (the homepage + `/p/[slug]` demonstrate it). This is a mechanical follow-up.
- **Media upload** pending the `cms_media` Storage bucket.
- **Structured-content editor forms** (role/mission/badge/onboarding/email) — the
  data is seeded + editable via direct DAL; dedicated admin forms are a Phase-31
  follow-up.
