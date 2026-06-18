# Phase 61 — Source Reliability & Crawl Orchestration

**Status:** Complete (uncommitted)
**Route:** `/dashboard/source-reliability` (reviewer+)
**Scope:** A read-only operational **observability layer** over the *existing*
ingestion system. It measures and explains source-collection reliability — it
does **not** fetch, schedule, retry, or modify anything.

---

## What this is (and is not)

This is a management/observability surface, **not** a new ingestion engine.

- **No new ingestion logic.** Nothing here fetches a source.
- **No scraping workarounds, no CAPTCHA bypass, no bot-evasion.** Anti-bot
  protections and login walls are *reported*; HSI respects robots.txt and ToS.
- **No scheduler edits.** Crawl cadence is displayed; the ingestion system owns it.
- **Untouched:** RBAC, IAM, Auth, Middleware, Billing/Stripe, Trust Center,
  Forecasting, Publication, Review, Signal, and Source ingestion workflows. No
  schema changes (this phase adds **no migration**).

All numbers are derived **in-memory** from data the ingestion already recorded:
`source_capture_events`, `hsin_source_health`, and the cached source registry.

---

## Architecture

```
getSourceReliability()  (unstable_cache, 120s, tag: source-intelligence)
  ├─ getSourceIntelligence()        ← reused Phase 46 cache (source registry)
  ├─ read source_capture_events     ← 1 bounded read (limit 10k, desc)  → per-source + global tallies
  └─ read hsin_source_health        ← 1 bounded read (limit 2k, desc)   → latest response_time per source
```

- **Cached loaders used: 2** — `getSourceReliability` (new) + `getSourceIntelligence`
  (reused). Well within the ≤5 budget.
- **No N+1.** Capture events are read once and tallied per `source_id` in a single
  pass; health rows once. Everything else is pure in-memory aggregation.
- **Server-rendered.** The page is a server component; panels are server-only
  (no client JS). Route compiles as `ƒ` (dynamic) at 707 B.
- **Never throws.** Each read is independently guarded; failures degrade to empty.

### Files

| File | Purpose |
|------|---------|
| `apps/web/lib/source-reliability-classify.ts` | **Pure** helpers — type bucketing, failure classification, protection detection, explainable health score, backoff stage. No I/O. |
| `apps/web/lib/source-reliability-classify.test.ts` | Unit tests for the pure helpers. |
| `apps/web/lib/source-reliability.ts` | Cached data layer composing the reads above into the 10 deliverables. |
| `apps/web/components/source-reliability/panels.tsx` | Server-rendered panels (overview, health, scheduler, retry/backoff, blocks, analytics, dependencies, exec summary). |
| `apps/web/app/dashboard/source-reliability/page.tsx` | Route + read-only guidance banner. |

### Wiring

- `lib/security/rbac-audit.ts` → `PROTECTED_ROUTES`: `/dashboard/source-reliability` = **reviewer** (middleware-enforced).
- `packages/ui/src/nav-roles.ts` → `NAV_VISIBILITY` (`['reviewer','curator']`) + `ALL_NAV_HREFS`.
- `packages/ui/src/navigation.tsx` → "Source Reliability" under **Operations** (Activity icon).
- `packages/ui/tests/nav-roles.test.ts` → invariant + reviewer-gate test.

---

## Deliverables

1. **Reliability dashboard** — totals (total / active / healthy / warning /
   failed / blocked / login-required) + per-type breakdown (RSS, Website, API,
   Government, Research, Podcast, YouTube, Reddit, Forum, Social, Other).
2. **Source health status** — HEALTHY / WARNING / FAILED + detailed reason
   (Healthy, Rate Limited, Cloudflare Protected, Login Required, Access Denied,
   Offline, Timeout, Parse Error, Manual Review), classified from the capture
   event's free-text `status`/`reason`/`error`.
3. **Explainable health score** — `success rate ×0.6 + parse success ×0.2 +
   recency ×0.2 − (consecutive-failure penalty)`, bands **95–100 Excellent /
   80–94 Healthy / 60–79 At Risk / <60 Failing**. The formula and per-source
   factor breakdown are shown (hover the score) — **no black box**. No fabricated
   100s: zero-event sources read "unknown / at risk", never perfect.
4. **Crawl scheduler (read-only)** — cadence policy by type (RSS 15 min, News/
   Website/API/Reddit/Social 30 min, Government/Forum/YouTube 1 hr, Research 6 hr,
   Podcast 12 hr), source count, last fetch, avg response time. Display only.
5. **Retry & backoff visibility** — consecutive failures → observed backoff stage
   (none → immediate → exponential ×2ⁿ → escalated), next-retry hint, failure
   type, last success. Display only; reflects observed history.
6. **Block detection** — Cloudflare / Akamai / Imperva / DataDome / CAPTCHA /
   Robots block / Login wall detected from capture-event text, with first seen,
   last seen, and affected-source count.
7. **Collection analytics** — fetches/day, success %, failure %, avg response,
   content volume (items captured), signals generated, signals/source. Aggregate
   only; no content exposure.
8. **Source dependency risks** — single-source dependency (e.g. "≥40% of signals
   from X"), category concentration (≥50%), and coverage gaps, each with severity
   and a diversification suggestion (reuses Phase 46 coverage/analytics).
9. **Executive summary** — "Can we trust our collection network?": healthy %,
   failing %, blocked %, coverage risk, most-reliable + most-fragile sources, and
   recommended actions (including explicit "respect robots/ToS — do not bypass").
10. **Performance** — 2 cached loaders, single-pass tallies (no N+1), reuses the
    source-registry cache, fully server-rendered.

---

## Public-safety contract

Only safe/aggregate fields: source name, type, status, score, counts, timestamps,
protection vendor names. **Never** PII, reviewer/source identities, internal
notes, raw captured content, credentials, or admin-only metadata.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Classifier unit tests | ✅ new suite passes |
| nav-roles invariant + gate | ✅ pass |
| Full chunked suite | ✅ **2672 / 2672** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; `/dashboard/source-reliability` → `ƒ` (707 B) |

Run from `apps/web` for tsc; tests chunked from repo root:

```
( cd apps/web && npx tsc --noEmit -p tsconfig.json )
git ls-files '*.test.ts' | xargs -n 60 npx tsx --test
rm -rf apps/web/.next && ( cd apps/web && npx next build )
```
