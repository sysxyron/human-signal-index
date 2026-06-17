# Phase 41B.3 — CMS, Navigation, SEO, Auth & Public UX Fixes

Public-site + CMS friction fixes before Phase 42. No changes to RBAC, IAM,
middleware, auth architecture, billing, Stripe, source ingestion/cron, signal
capture, compliance, or the role-approval workflow. No service-role keys in
client code; all writes server-side + audited; additive schema only.

## Root causes & fixes

| # | Item | Root cause | Fix |
| --- | --- | --- | --- |
| A | Auth-aware header | `PublicNav` always showed "Sign in" (no auth awareness) | Marketing layout detects the user server-side (`getUser`) and passes `authed`; `publicHeaderState(authed)` hides Sign in + shows "Dashboard" for authed visitors. |
| B | Homepage mission CTA | Home "Read our mission" linked to `/about` | Now links to `/mission`; footer "Our Mission" already `/mission`. |
| C | Viewer Source Registry trap | `/dashboard/sources` was nav-visible to viewers but middleware/RLS gate it → "Access requires a higher role" | Restricted `/dashboard/sources` to researcher+ in `NAV_VISIBILITY`. Permissions unchanged; researcher/admin unaffected. |
| D | Footer not CMS-editable | Public footer was hardcoded; `cms_navigation` had no group concept | Added `nav_group` column (migration 0047) + anon read policy; `getPublicFooterGroups()` public read; `Footer` renders CMS groups (fallback to hardcoded); NavManager edits label/URL/group/order/active; seed populates grouped footer. |
| E | No CMS SEO controls | Pages had static metadata only | `lib/cms/seo.ts` `cmsSeoToMetadata(seo, fallback)` (canonical/OG/noindex/keywords) with fallback intact; wired into About `generateMetadata` as the reusable pattern. |
| F | Publish layout corruption | Bespoke pages (home/about) rendered via generic CMS blocks when published, downgrading the rich layout; renderer had no default case | Home + About seeded as **draft** (rich hardcoded stays default); `refreshSeededPagesAction` (41B.2) un-publishes stale records; `publishPage` validates via the engine; renderer now has a safe default for unknown blocks. |
| G | Preview/render mismatch | — | Public render and CMS-first pages share the one `CmsBlocks` renderer; `validatePage` rejects malformed structure (empty blocks, bad slug, dup positions) before publish. |
| H | Shallow About | — | About has all nine sections; Core Principles aligned to the spec (evidence over assertion, transparency over opacity, accountability over authority, human review over automation, correction over permanence). |
| I | Domain routing | Marketing nav was relative (stayed on app.* if landed there); apex `metadataBase` | `siteHref()`/`siteBase` resolve marketing links to www; app links via `appHref()`; `metadataBase` = www. (See `docs/DOMAIN_ROUTING_AUDIT.md`.) |
| J | Trust column redundancy | "Trust & Transparency" + "Transparency" | Footer link renamed to "Trust"; Transparency kept separate. Seed footer uses the same. |

## Files changed (highlights)

- `packages/ui/src/navigation.tsx` — `PublicNav` auth-aware (`authed`); `Footer` CMS `groups`.
- `packages/ui/src/nav-roles.ts` — `/dashboard/sources` researcher+; `publicHeaderState()`.
- `apps/web/app/(marketing)/layout.tsx` — server auth detection + CMS footer groups.
- `apps/web/app/(marketing)/page.tsx` — mission CTA → `/mission`.
- `apps/web/app/(marketing)/about/page.tsx` — principles aligned; CMS-SEO `generateMetadata`.
- `apps/web/lib/cms/cms.ts` — `getPublicFooterGroups`, nav group CRUD.
- `apps/web/lib/cms/seo.ts` (new) — SEO mapper.
- `apps/web/lib/cms/seed-data.ts` + `seed.ts` — grouped footer nav (+ "Trust").
- `apps/web/components/cms/NavManager.tsx` — group + inline edit + reorder.
- `apps/web/components/cms/CmsBlocks.tsx` — safe default for unknown blocks.
- `supabase/migrations/0047_cms_footer_groups.sql` (new, additive).
- Tests: `packages/ui/tests/nav-roles.test.ts`, `apps/web/lib/cms/cms-fixes.test.ts`.

## Route matrix (public header / viewer nav)

| Role | Sign in shown | Source Registry | Dashboard CTA |
| --- | --- | --- | --- |
| anonymous | yes | hidden | "Explore Dashboard" → app.* |
| viewer | no | hidden | "Dashboard" → app.* |
| researcher+ | no | visible | "Dashboard" → app.* |

## CMS validation matrix

| Action | Guard |
| --- | --- |
| save draft | revision snapshot + audit |
| publish | `validatePage` (title, valid slug, ≥1 block, unique positions, per-block) + state transition + audit |
| edit | replaces blocks atomically + revision |
| refresh seeded content | upserts seeded pages to code baseline (un-publishes stale) |
| rollback | restores a revision as a new draft |
| render | shared `CmsBlocks` (unknown block → null, no crash) |

## SEO matrix

`cmsSeoToMetadata` maps CMS SEO → Next Metadata with fallback: meta title, meta
description, canonical, OG title/description/image, keywords, and a noindex
toggle. About is wired via `generateMetadata`; the other listed pages keep their
correct static metadata (fallback) and adopt the same one-line pattern to gain
CMS overrides. Marketing canonical/OG resolve on the `www` origin.

## Domain routing audit
See `docs/DOMAIN_ROUTING_AUDIT.md`. Marketing nav/logo/footer → `www`
(`NEXT_PUBLIC_SITE_URL`); Dashboard/Login/Signup → `app` (`NEXT_PUBLIC_APP_URL`);
`metadataBase` = `www`. Recommended: redirect apex → `www`.

## Verification
- Typecheck (`apps/web`): clean.
- Tests: full suite green (incl. new nav-roles A/C + CMS SEO/validation tests).
- Build: `next build` exit 0.

## Remaining risks / next steps before Phase 42
- **CMS SEO rollout:** only About is wired to CMS SEO; the other listed marketing pages need the same `generateMetadata` one-liner (mechanism delivered).
- **CMS footer live data:** the public footer uses CMS footer nav only once an admin seeds/populates `cms_navigation` footer rows (with groups); until then the correct hardcoded footer renders.
- **Bespoke-page publishing:** publishing home/about in the CMS still renders generic blocks (by design they are draft); consider a "bespoke page" flag that blocks publishing those slugs.
- **Stale live records:** the existing published About record must be cleared with "Refresh seeded content" on the deploy (DB state, not code).
- **next lint** remains broken repo-wide (ESLint 9 vs Next 14.2.5) — unrelated; typecheck + tests + build are the gates.
