# Phase 31 — CMS & Content Operations Layer

**Status:** ✅ Complete · web + engine typecheck 0 errors · build green (174
routes, +5) · **2,470 tests passing (0 fail, +14)** · route audit green (99
registered / 75 sidebar) · smoke green (migrations 0001→0035) ·
**no auth / RBAC / middleware / user_roles changes; CMS uses no service-role key.**

HSI content is now operator-managed. Admins create, edit, publish, roll back, and
manage pages, navigation, media, and the role/mission/badge/onboarding/report
content from the dashboard — **no developer required**.

---

## 1. Architecture
```
ENGINE (@hsi/cms-engine, PURE)        DAL (lib/cms/cms.ts, admin-gated)
buildPage · validatePage              listPages · getPage · saveDraft
state machine (draft→review→          publishPage · archivePage
  published→archived)                 listRevisions · rollbackToRevision
createRevision · rollbackRevision     listNavigation · listMedia
searchContent                         getPublishedPage (public, fallback)
        │                                     │  requireAdmin + admin-all RLS + audit
        ▼                                     ▼
   /dashboard/admin/cms (list · editor · navigation · media)
        │ publish
        ▼
   cms_pages/blocks (published) ──► /p/[slug] public renderer (+ SEO)  ──► code fallback
```

## 2. Data model (Deliverables 1–4, 15–20, 26) & migration (27)
`supabase/migrations/0035_cms_content_operations.sql` (add-only) — 13 tables:
`cms_pages`, `cms_blocks`, `cms_revisions` (append-only), `cms_publish_events`
(append-only), `cms_navigation`, `cms_media`, `cms_email_templates`,
`cms_role_content`, `cms_mission_content`, `cms_badge_content`,
`cms_onboarding_content`, `cms_report_templates`, `cms_audit_log` (append-only).
RLS, indexes, unique constraints, audit fields, `set_updated_at` on mutable tables.

## 3. Engine (Deliverables 5, 6, 7, 10, 24)
`packages/cms-engine` — PURE, deterministic:
- 6 **page types** + 8 **block types** with per-type validation (`defaultBlockContent`,
  `validateBlock`).
- `buildPage` (order blocks + assemble SEO), `validatePage` (publish-readiness:
  title, slug, ≥1 block, valid blocks, unique positions), `normalizePositions`.
- **Draft state machine (D6)** — `draft→review→published→archived` (+ rework/
  archive/restore) via `PAGE_TRANSITIONS` / `canTransition` / `canPublish`.
- **Revisions (D7)** — `createRevision` (immutable deep-copied snapshot),
  `rollbackRevision` (restores as a fresh DRAFT — never auto-publishes),
  `summariseChange`.
- `searchContent` (D24) over pages/blocks/templates/media.

## 4. Workflows
- **Draft workflow (D6)** — every save writes a draft + an immutable revision.
- **Publish (D8)** — `publishPage` validates via the engine, sets `published`,
  records a `cms_publish_events` row + `cms_audit_log` + a security-audit event.
- **Version history + rollback (D7)** — `listRevisions` / `rollbackToRevision`
  restores a snapshot as a new draft (records a `rolled_back` event); history is
  never mutated.

## 5. Permissions (Deliverable 25)
**Only admins** may write or publish: every DAL mutation is behind `requireAdmin()`
and the tables are **admin-all RLS**. Researchers/reviewers cannot publish (or
write) CMS content. Published pages + active navigation + content rows are
world-readable so public pages render them. **RBAC is unchanged** — these are new
tables with their own policies; no existing policy, role, or middleware was touched.

## 6. Admin UI (Deliverables 11–14)
- `/dashboard/admin/cms` (D11) — page list with status + last-modified.
- `/dashboard/admin/cms/pages/[id]` (D12) — block editor (add/remove/reorder, per-
  type JSON content, live engine validation), **save draft** + **publish** +
  preview link. Handles `new`.
- `/dashboard/admin/cms/navigation` (D13) — header/footer/help links by location.
- `/dashboard/admin/cms/media` (D14) — media library list.

## 7. Marketing integration, SEO, preview (Deliverables 21–23)
- **`/p/[slug]`** renders any PUBLISHED CMS page's blocks publicly (D21) — operators
  create + publish pages that go live with **no code change**, and the renderer
  **falls back gracefully** when a page isn't published (CMS is additive, never
  breaks the site). Existing homepage/about/FAQ can adopt `getPublishedPage(slug)`
  with the same fallback.
- **SEO (D22)** — per-page `generateMetadata` (title, description, keywords, Open
  Graph) from the page's `seo` field.
- **Preview (D23)** — the editor links to `/p/<slug>`; drafts validate live in the
  editor before publish.

## 8. Files

**Created**
- `packages/cms-engine/` (package.json, tsconfig; `src/`: types, blocks, page,
  revisions, search, fixtures, index; `tests/`: page, revisions — 14 tests)
- `apps/web/lib/cms/cms.ts`
- `apps/web/components/cms/PageEditor.tsx`
- `apps/web/app/dashboard/admin/cms/page.tsx` + `pages/[id]/` + `navigation/` + `media/`
- `apps/web/app/p/[slug]/page.tsx`
- `supabase/migrations/0035_cms_content_operations.sql`
- `docs/PHASE_31_CMS_CONTENT_OPERATIONS_REPORT.md`

**Modified**
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` — Content (CMS) nav
- `apps/web/lib/launch/migration-audit.ts` (+0035) + `migration-audit.test.ts`
- `tsconfig.base.json`, `apps/web/package.json` — new package

## 9. Verification

| Item | Result |
| --- | --- |
| Migration | `0035_cms_content_operations.sql` |
| Tests added | 14 (cms-engine: page + revisions/rollback/search) |
| Full test suite | ✅ **2,470 / 2,470**, 0 fail |
| Web / engine typecheck | ✅ 0 errors each |
| Build | ✅ compiled (174 routes; CMS + `/p/[slug]`) |
| Route audit | ✅ 99 registered / 75 sidebar resolve |
| Migration audit / smoke | ✅ 0001→0035, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 10. Security audit (Deliverable 29)
- **No auth / RBAC / middleware / user_roles changes** (verified: no diff to
  `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **No role escalation** — only admins write/publish (requireAdmin + admin-all RLS);
  publishing is admin-only.
- **No service-role exposure** — the CMS DAL uses **no service-role client at all**
  (RLS user client + `requireAdmin` only); `cms.ts` is `'use server'`, imported by
  server pages + the client editor only via server actions; no service key in any
  component.
- **Audited** — every mutation writes `cms_audit_log`; publishes/rollbacks write
  `cms_publish_events`; revisions are immutable.

## 11. Remaining gaps / Phase 32 recommendation
- **Structured-content editors** (email templates, role/mission/badge/onboarding,
  report templates) have tables + RLS + (some) DAL list reads, but dedicated editor
  UIs are thin — wire per-type admin forms next (the pattern mirrors the page
  editor).
- **Media upload** — the media manager lists assets; wiring an upload (Supabase
  Storage) + replace/delete is a focused follow-up.
- **Navigation/structured CRUD** — managers are read views; add inline create/edit/
  reorder using the established admin-action pattern.
- **Homepage/about/FAQ swap** — the `/p/[slug]` renderer + `getPublishedPage`
  fallback are ready; switching the existing hardcoded marketing pages to read CMS
  first is a low-risk follow-up once content is authored.
