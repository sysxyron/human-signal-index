# Phase 19 — Public Intelligence Publishing, Subscriber Network & Distribution Engine

**Final Report**

HSI is now a **public intelligence platform**. Governed research becomes
publishable, traceable, trust-aware reports; visitors browse a public library;
subscribers receive digests; reports are distributed via feeds. Every public
report links back to its evidence and shows its trust openly.

Nothing becomes automatic. Publishing stays **human-approved, governed,
auditable, and reversible**. No auto-publish. No auto-truth. No black-box content.
Retractions remain **visible** — history is never deleted.

---

## 1. Architecture

Two new pure engines, a public + governed data layer, eight UI routes (six public,
three private), a daily distribution worker, and one additive migration — layered
exactly like every prior phase.

```
packages/publishing-engine/    (NEW)  lifecycle · governance gate · retraction · report builder
packages/distribution-engine/  (NEW)  digests · RSS/JSON/webhook feeds · distribution planning
        │   (deterministic — `now` injected, no Date.now/Math.random; offline-safe)
        ▼
apps/web/lib/publishing/persistence.ts  (DAL: PUBLIC reads (anon-safe) + governed writes)
apps/web/lib/publishing/view.ts         (client-safe decorators + demo builders)
apps/web/lib/publishing/actions.ts      ('use server' wrappers + revalidation)
        │
        ├── (marketing)/intelligence + /[slug]   (public portal + report page)
        ├── (marketing)/topics/[slug]             (public topic aggregation)
        ├── (marketing)/search                     (public search)
        ├── (marketing)/subscribe + /account/subscriptions
        └── dashboard/publishing + /review + /retractions   (governed)
        │
apps/worker/jobs/publishing-worker.ts  (daily 08:00 distribution loop; registered)
supabase/migrations/0023_publishing_and_subscribers.sql  (9 tables, PUBLIC RLS, triggers)
packages/shared-types/src/index.ts  (Phase-19 records + view-models + unions)
```

---

## 2. Core capabilities delivered

| # | Capability | Where |
|---|-----------|-------|
| 1 | **Public Intelligence Portal** — `/intelligence` + `/intelligence/[slug]` with title, summary, trust, confidence, evidence/source counts, dates, review/governance status, topics | `(marketing)/intelligence/*` |
| 2 | **Publishing Engine** — `create/update/archive/publish/unpublishPublication`, each linked to run/evidence/trust/governance; nothing publishable without approval | `publishing-engine/states.ts` |
| 3 | **Publication Workflow** — 6 states; `transitionPublication` / `validatePublicationTransition`; every transition audited | `publishing-engine/states.ts` |
| 4 | **Subscriber System** — `/subscribe` + `/account/subscriptions`; subscribe/unsubscribe, digest/topic/notification/channel prefs; FREE/RESEARCHER/ANALYST/ORG | DAL + `SubscribeForm` |
| 5 | **Digest Engine** — `generateDaily/Weekly/TopicDigest`; new/updated reports, trust/governance/outcome changes, opportunities, escalations; **never content without a source** | `distribution-engine/digest.ts` |
| 6 | **Report Builder** — `buildIntelligenceReport` → 12 sections (exec summary → provenance), each flagged sourced/unsourced | `publishing-engine/report.ts` |
| 7 | **Publication Trust Surface** — trust score, calibration, outcome reliability, evidence quality, governance, trust history + provenance shown openly | `PublicationTrustSurface` |
| 8 | **Retraction System** — `retractPublication` with 5 reasons; retractions stay visible; history never deleted | `publishing-engine/retraction.ts` |
| 9 | **Public Search** — `/search` over reports/topics/categories with trust + topic filters | `(marketing)/search` |
| 10 | **Public Topic Pages** — `/topics/[slug]` aggregating reports, avg trust, evidence totals | `(marketing)/topics/[slug]` |
| 11 | **Distribution Engine** — RSS/JSON/webhook feeds + distribution planning; **never distributes unpublished intelligence** | `distribution-engine/feeds.ts`, `distribution.ts` |
| 12 | **Governance Publishing Controls** — `canPublish` (reviewer + trust + evidence + governance gates), `publishReview`, `publicationAuditTrail` | `publishing-engine/governance.ts` |
| 13 | **Operations Integration** — `/dashboard/publishing` (drafts, review queue, publishing queue, subscribers, digest runs, retractions, analytics) | `dashboard/publishing` |
| 14 | **Migration 0023** — 9 tables, indexes, FKs, **public RLS**, triggers, audit support | `supabase/migrations/0023_*.sql` |

---

## 3. Publishing engine

**Lifecycle (6 states):** `DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED`,
with `APPROVED/PUBLISHED → RETRACTED` and `PUBLISHED → UNDER_REVIEW` (unpublish for
re-review). `validatePublicationTransition` gates every move (verified exhaustively
by a 36-pair transition matrix test); `transitionPublication` appends an audited
event and stamps `publishedAt`. Content is editable only in `DRAFT`/`UNDER_REVIEW`
— published content is immutable (unpublish first). `RETRACTED` is terminal but
**visible**.

**Report builder** assembles 12 canonical sections (Executive Summary, Evidence,
Temporal, Causal, Counterfactual, Decision, Outcome, Calibration, Trust,
Governance, Limitations, Provenance). A missing section becomes an explicit caveat;
Limitations + Provenance are **always** populated — no black-box content.

---

## 4. Subscriber system

Subscribers (`FREE/RESEARCHER/ANALYST/ORGANIZATION`) own a row keyed to
`auth.uid()` with preferences: digest cadence (`none/daily/weekly`), followed
topics, notification toggles (trust changes, retractions), and delivery channels
(`email/rss/json/webhook`). `subscribeDal` is idempotent (upsert); `unsubscribeDal`
**deactivates without deleting history**. RLS restricts each subscriber to their own
row.

---

## 5. Digest engine

`generateDaily/Weekly/TopicDigest` turn recent changes into a digest of New/Updated
Reports, Trust Changes, Governance Actions, Research Opportunities, Escalations, and
Outcome Changes. **Every entry must reference a source** — unsourced inputs are
dropped and counted (`droppedNoSource`), and **unpublished reports never appear**.
Topic digests filter reports to the topic.

---

## 6. Search & topic pages

`searchPublic` filters published reports by query (title/summary/topic/category)
with optional topic, category, and minimum-trust filters, and surfaces matching
topics. `getTopicPage` aggregates published reports for a topic with report count,
average trust, and total evidence. Both are anonymous-accessible.

---

## 7. Governance publishing controls

`canPublish` gates publication on **four** requirements — reviewer approval (state
≥ APPROVED), trust threshold (≥60), evidence threshold (≥3), source threshold (≥2),
and governance clearance — returning an **explainable** verdict (every check with
its detail + the blockers). `publishReview` records a human decision (required
reviewer + reason) with the gate snapshot. `publicationAuditTrail` renders the full
history. The DAL **re-enforces the gate** when transitioning to PUBLISHED, so a thin
report can never be published even via a direct transition.

---

## 8. Distribution

`buildRssFeed` / `buildJsonFeed` render feeds from **published items only** — the
gate is enforced inside the builder, so an unpublished item can never leak.
`planDistribution` matches a digest to subscribers by cadence + topic + channel and
emits `DistributionEvent`s (status `planned`); it **never plans for an empty digest
or an inactive subscriber**. The worker performs the sends; the engine is pure.

---

## 9. Migration 0023 — public RLS

`supabase/migrations/0023_publishing_and_subscribers.sql` (ADD-ONLY). Nine tables:
`hsin_publications`, `hsin_publication_versions` (append-only), `hsin_publication_reviews`
(append-only), `hsin_publication_retractions` (append-only), `hsin_subscribers`,
`hsin_subscription_preferences`, `hsin_digest_runs`, `hsin_distribution_events`,
`hsin_topic_pages`.

**This is the first migration to grant ANONYMOUS read** — and it is tightly scoped:
- `hsin_publications`: anyone (incl. anon) may read rows where `state in
  ('PUBLISHED','RETRACTED')`; researcher+ may read every state.
- `hsin_publication_retractions` + `hsin_topic_pages`: public read (`using (true)`).
- `hsin_subscribers` + `hsin_subscription_preferences`: **own row** (`auth.uid()`).
- versions/reviews/digest/distribution: researcher+ read, curator/admin write.

Drafts, reviews, subscribers, and distribution data stay behind the role ladder.
The shared `set_updated_at()` trigger is on the six mutable tables; the three
append-only tables carry none. No prior migration is edited.

---

## 10. Testing

- **`@hsi/publishing-engine`** — 129 tests (states, governance, retraction, report,
  report-deep, transition matrix, integration, fixtures).
- **`@hsi/distribution-engine`** — 79 tests (digest, feeds, distribution,
  subscribers, feeds-deep, fixtures).
- **`publishing-worker`** — 8 tests (offline determinism, published-only load,
  digest + distribution, active-only, no-auto-publish, fault isolation).
- **publishing view helpers** — 26 tests (decorators, formatters, demo builders).
- **Phase 19 net-new: ~219 tests.**

**Full suite: `1470 tests, 1470 pass, 0 fail`.** No Phase 1–18 regressions.

---

## 11. Build & typecheck status

| Gate | Result |
|------|--------|
| `apps/web` `tsc --noEmit` | **0 errors** |
| `apps/worker` `tsc --noEmit` | **0 errors** |
| `packages/publishing-engine` `tsc` | **0 errors** |
| `packages/distribution-engine` `tsc` | **0 errors** |
| `next build` | **✓ Compiled successfully** — all 9 Phase-19 routes emitted (ƒ) |
| Full test suite | **1470 / 1470 pass** |

> Repo-level `next lint` still fails on the pre-existing ESLint-version
> incompatibility (unrelated to Phase 19); type-checking and the build are clean.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| First anonymous-read surface | RLS is state-scoped (`PUBLISHED`/`RETRACTED` only); drafts/subscribers/distribution stay role-gated; reviewed in the migration header |
| Public search is in-memory filter (no full-text index) | adequate at current scale; a Postgres `tsvector` / trigram index is a Phase-20 hardening |
| Report body stored as jsonb (loose) | the builder normalises any body into the 12 sections with explicit caveats; never throws |
| Digest worker re-generates daily (could duplicate) | digest runs are append-only records; de-dup/window-keying recommended for Phase 20 |
| Email/webhook delivery is *planned*, not *sent* | by design — the engine plans, a delivery worker (Phase 20) performs sends with retry; events carry `status: planned` |
| Subscriber email vs auth identity | subscriber rows are keyed to `auth.uid()`; email is informational for delivery |

---

## 13. Deployment steps

1. **Migrate.** Apply `0023_publishing_and_subscribers.sql` (additive; safe after
   0001–0022). Verify the 9 tables + the **public-read** policies + triggers.
2. **Install.** `pnpm install` (links the two new workspace packages — already in
   `apps/web` + `apps/worker` deps and `tsconfig.base.json` paths).
3. **Build.** `pnpm build` (web + worker). Both green.
4. **Test.** `npx tsx --test $(find packages apps -name '*.test.ts' …)` → 1470 pass.
5. **Worker.** Deploy the updated worker; `publishingWorkerJob` runs daily 08:00
   under the service-role key (safe offline no-op without it).
6. **Verify public portal.** Visit `/intelligence`, open a report (`/intelligence/[slug]`),
   browse `/topics/[slug]`, `/search`, and `/subscribe` — anonymously. Confirm only
   PUBLISHED/RETRACTED reports appear.
7. **Verify governance.** As a curator: draft → submit → review (approve) → publish →
   retract; confirm the audit trail and that the retraction stays visible.

---

## 14. Recommended Phase 20 — Delivery, Federation & Public Intelligence API

- **Delivery worker** — actually send the planned email/webhook distributions with
  retry + bounce handling, marking events `sent`/`failed`.
- **Public Intelligence API** — a versioned, rate-limited read API (+ the RSS/JSON
  feeds served at stable URLs) for third-party integration.
- **Full-text search** — Postgres `tsvector`/trigram indexes over publications +
  evidence for fast, ranked public search.
- **Federation & syndication** — signed, verifiable export bundles so partner
  platforms can re-host reports with their provenance intact.
- **Citation & permalinks** — DOI-style stable identifiers and a citation export
  (BibTeX/RIS) for each report.
- **Reader analytics (privacy-preserving)** — aggregate, anonymised readership to
  prioritise topics — never tracking individuals.
```
