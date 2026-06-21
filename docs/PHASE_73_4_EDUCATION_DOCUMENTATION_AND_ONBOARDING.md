# Phase 73.4 — Education Center, Documentation Portal & Onboarding System

**Status:** Complete (uncommitted) · **Type:** Additive (marketing/content only)
**Migration:** none · No auth/ingestion/publishing/review/forecasting changes.

## Purpose
Make HSI self-explanatory for beta testers, researchers, analysts, journalists,
trust & safety teams, academics, nonprofits, developers, and buyers: a structured
Education Hub, a public documentation portal, a plain "How HSI Works" page,
local search, and a client-side onboarding checklist. All content is
human-authored, evidence-first, and free of fabricated metrics, testimonials, or
invented APIs.

## Architecture Audit
- Marketing routes live in `app/(marketing)/*` and share `PageHeader`/`Section`
  (`components/page-header`) + `@hsi/ui` primitives (`Card`, `Button`, `Input`,
  `SectionEyebrow`, `CategoryTag`). Metadata uses `Metadata` with
  `alternates.canonical` + `openGraph`.
- Public nav + footer are defined in `packages/ui/src/navigation.tsx`
  (`publicNavLinks`, `footerColumns`; footer can be CMS-overridden).
- Existing `/education-hub` rendered `GUIDES` from `lib/education/guides`.
- App links use `appHref()` (`lib/env/app-url`) for the app origin.

## Pages Added
- `/docs` (portal index: search + section directory + resources).
- `/docs/[slug]` (dynamic — one file serving all 8 sections: concepts, workflow,
  methodology, api, developers, roles, faq, changelog) with `generateStaticParams`
  + `generateMetadata`.
- `/how-hsi-works` (Collect → Verify → Investigate → Forecast → Publish → Audit).

## Pages Modified
- `/education-hub` — upgraded with 6 learning tracks × lessons (video placeholders),
  onboarding checklist, and cross-links. Existing written guides retained.
- `/beta`, `/demo` — added a Documentation link.

## Documentation Structure
`lib/docs/content.ts` is the single source of truth (pure data): `DocPage[]` with
sections. Pages: **Concepts** (plain definitions of source/signal/evidence/
narrative/forecast/investigation/review/publication/retraction/transparency/trust),
**Workflow** (7 steps + provenance/traceability), **Methodology** (evidence/trust/
forecast/review/transparency), **API** (under development — sections marked Coming
Soon, no invented endpoints), **Developers** (frontend/backend/database/RBAC/
pipelines/testing/deployment — no secrets), **Roles**, **FAQ** (14 Q&A),
**Changelog** (73.1/73.2/73.3 from project docs). The `/docs/[slug]` route renders
these via `DocArticle` + `DocsSidebar`.

## Education Structure
`lib/education/curriculum.ts` (pure): 6 tracks (Getting Started, Researcher,
Analyst, Reviewer, Intelligence Operations, Platform Administration), 30 lessons.
Every lesson is a **video placeholder** — `status: 'coming_soon'`,
`estimatedLength: null` (no fake durations or videos), shown as "Video Coming
Soon · Length TBD".

## Navigation Changes
- `publicNavLinks` (top nav): added **How HSI Works** and **Documentation**
  (Education Hub already present).
- `footerColumns`: new **Learn & Build** column — Education Hub, How HSI Works,
  Documentation, FAQ, Developers, API.
- Docs linked from footer, Education Hub, Beta, and Demo pages.

## SEO Additions
Title + description + keywords + canonical + OpenGraph on `/docs`, `/docs/[slug]`
(per-section via `generateMetadata`), `/how-hsi-works`, and the upgraded
`/education-hub` — matching the existing marketing metadata pattern. No duplicate
titles (each section title is distinct).

## Search Implementation
`lib/docs/search.ts` (pure, deterministic): `buildSearchIndex()` indexes docs
pages, each FAQ question, and every lesson; `searchDocs()` ranks by exact-title >
substring > token hits, with a 2-char minimum. The `DocSearch` client component
filters in-memory. No external service, no vector DB, no AI.

## Onboarding Implementation
`OnboardingChecklist` (client) — 8 steps (create account, explore dashboard,
review methodology, read concepts, add first source, create first signal, review
docs, request help) with a visual progress bar. Client-side only; no persistence
(stated in the UI). Items link to real pages (`appHref` for app routes).

## Future Video Plan
Lessons are catalogued now and marked Coming Soon. When recorded, each lesson
gains a real `estimatedLength` and an embedded player; the curriculum data model
already carries the fields.

## Future API Documentation Plan
The API page states "Public API access is under development" and lists the planned
sections (Overview/Authentication/Rate Limits/Endpoints/Webhooks/SDKs/Examples)
marked Coming Soon. Real endpoint definitions will replace the placeholders when
the API ships — nothing is invented now.

## Future Resource Downloads
The Resources section lists five guides (Quick Start / Research / Analyst /
Reviewer / Developer) marked Coming Soon. No fake PDFs are generated.

## Quality
Copy is professional, research-oriented, and human-authored. No "revolutionary"/
"game-changing"/"truth detection"/"replaces analysts" claims; no fabricated
metrics or testimonials; em-dash use kept restrained.

## Testing Results
- `tsc --noEmit` (apps/web): clean
- `lib/docs/docs.test.ts` (10): docs registry integrity, API coming-soon,
  resources placeholders, curriculum (6 tracks/30 lessons, no fake durations),
  search index spans docs/faq/lessons, deterministic ranking, empty on unknown.
- Full suite + clean build: see final report.

## Known Limitations
- Search is substring/token based (no stemming/synonyms) — sufficient for a small
  static corpus.
- Onboarding progress is per-session (by design).
- Videos, downloadable guides, and the public API are placeholders.
