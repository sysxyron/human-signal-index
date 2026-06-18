# Phase 57 — Scale & Performance Validation

**Type:** audit + validation. No features built, no workflows/RBAC/schema changed.
Evidence: a clean `next build` (route/bundle sizes), a read-only data-layer audit
(query counts, caching, N+1, limits), and reasoned capacity estimates. No synthetic
load tooling was run.

---

## Executive summary

The platform is **architecturally well-suited to beta scale**. Every live surface is
a server-rendered (`ƒ`) route backed by **one shared cached data layer**
(`lib/*-intelligence.ts`) using `unstable_cache` (Data Cache, 60–300 s revalidate).
Because reads are cached, **database load is bounded by cache-refresh frequency, not
by concurrent-user count** — the dominant scaling property here.

Key evidence:
- **No N+1 patterns** anywhere in the data layer (single-read-then-map; batched title
  lookup via `.in(...)`).
- **No `select('*')`** on hot paths — explicit, public-safe column lists.
- Heaviest page (`/dashboard/release-candidate`) composes **9 getters** but they
  **dedupe to ~6 unique cached loaders** via the Data Cache → **~28 DB reads on a cold
  miss, 0 reads warm**.
- First-load JS is **103–162 kB** across all surfaces (88 kB shared baseline); largest
  per-route JS is ≤ 6.3 kB.

**The one real scale risk** is cache-miss behavior under high concurrency:
`unstable_cache` has **no single-flight**, so when a 60 s entry expires while many
requests are in flight, several can run the loader simultaneously (a brief stampede).
Combined with the **per-instance in-memory rate limiter** (already noted in 56.1),
these are the items to watch beyond ~500 concurrent users.

**Launch recommendation: READY** for the current/expanded beta cohort (≤ ~500
concurrent). **MONITOR** toward 1000 (add single-flight + shared rate-limit store).

---

## 1. Dashboard performance table

All target surfaces are `ƒ` (dynamic, server-rendered) — correct for live data.
Sizes from the clean production build. "Cold reads" = unique DB reads on a full cache
miss; "Warm reads" = 0 for all (served from Data Cache within the revalidate window).

| Route | Route JS | First Load JS | Data source | Cold DB reads | Warm | Notes |
|---|---:|---:|---|---:|:---:|---|
| `/` (home) | 11.4 kB | 158 kB | getPublicIntelligenceBundle | 11 | 0 | framer-motion hero |
| `/signal-library` | 4.67 kB | 151 kB | getSignalLibraryData | 2 | 0 | client explorer |
| `/research-reports` | 6.34 kB | 160 kB | getSignalLibraryData (+activity) | 2 | 0 | CMS-first guard |
| `/trust` | 1.8 kB | 115 kB | getTrustData | ~6 (composed) | 0 | + corrections read |
| `/dashboard` | 2.51 kB | 115 kB | bundle+library+source+ops | ~22 | 0 | Mission Control |
| `/dashboard/my-work` | 5.13 kB | 159 kB | bundle+library+source+ops | ~22 | 0 | + InvestigationQueue client |
| `/dashboard/source-registry` | 5.53 kB | 159 kB | getSourceIntelligence | 3 | 0 | 8000-row signals read |
| `/dashboard/watchlists` | 4.03 kB | 162 kB | getAlertsIntelligence | ~22 (composed) | 0 | heaviest first-load |
| `/dashboard/forecasting` | 228 B | 103 kB | getForecastData | ~22 (composed) | 0 | server-only panels |
| `/dashboard/collaboration` | 286 B | 110 kB | getCollaborationData | ~22 (composed) | 0 | server-only |
| `/dashboard/contributors` | 976 B | 114 kB | getContributorNetwork (+Phase 20 board) | ~22 (composed) | 0 | board has own action |
| `/dashboard/release-candidate` | 286 B | 110 kB | getReleaseReadiness (9 getters) | **~28** | 0 | heaviest compose |

Shared baseline: **First Load JS shared by all = 88 kB** (53.6 kB framework chunk +
31.7 kB + 2.7 kB). Server render is in-memory composition over cached data; on a warm
cache the per-request cost is render CPU + payload only (no DB).

---

## 2. API performance table

Both public APIs are `ƒ` server functions (0 B client JS). They return the same
cached bundle/trust data the pages use, with CDN cache headers + the in-memory limiter.

| Endpoint | Response shape | Approx payload | Cold reads | Warm | Cache headers | Rate limit |
|---|---|---:|---:|:---:|---|---|
| `/api/public/intelligence` | `{metrics, latestSignals(≤10), activityFeed(≤8)}` | ~3–6 kB | 11 (shared with home) | 0 | `public, max-age=60, swr=120` | 60/min/IP ✓ |
| `/api/public/trust` | `{metrics, pipeline, corrections(≤50), health}` | ~4–8 kB | ~6 (composed) | 0 | `public, max-age=120, swr=300` | 60/min/IP ✓ |

- **Response time (warm):** dominated by serialization of small bounded payloads —
  sub-50 ms server work expected once cache is warm; cold = the loader cost (one
  Supabase round-trip batch).
- **Cache behavior:** `unstable_cache` (60/120 s) + HTTP `max-age`/`stale-while-
  revalidate` → CDN can serve most public traffic without hitting the function.
- **Rate-limit effectiveness:** correct per-IP 429 with `retry-after`; **caveat** —
  in-memory/per-instance, so a multi-instance serverless fleet enforces the limit
  per-instance, not globally (documented in Phase 56.1; recommend shared store before
  high traffic).

---

## 3. Database findings — Top 10 heaviest queries

No EXPLAIN was run (no live DB in this environment); ranking is by bounded row count
× frequency, from the source. Index coverage referenced from migrations
(`idx_hsin_signals_status`, `idx_hsin_signals_signal_category`,
`idx_hsin_publications_state`, `idx_hsin_publications_published_at`, source indexes).

| # | Table | Columns | Limit | Getter | Index used (likely) | Note |
|---|---|---|---:|---|---|---|
| 1 | `user_roles` | `roles(name)` | 20000 | beta-operations (admin) | PK/FK join | Admin-only, infrequent; small table. Widest cap. |
| 2 | `hsin_signals` | source_id, category, status, created_at | 8000 | source-intelligence | created_at idx | One read tallied in-memory for all sources (no N+1). |
| 3 | `hsin_signals` | created_at | 2000 | signal-library trends | created_at idx | Trend series. |
| 4 | `hsin_publications` | trust_score | 1000 | public bundle (traceability) | state idx | Avg over published. |
| 5 | `hsin_signals` | signal_category | 1000 | public bundle (category) | category idx | Category activity. |
| 6 | `hsin_publications` | categories | 1000 | public bundle (fallback) | state idx | Only if signals path empty. |
| 7 | `hsin_signal_reviews` | decision, created_at | 1000 | operations | created_at | Today's review ops. |
| 8 | `hsin_sources` | safe columns | 500 | source-intelligence | created_at | Source registry. |
| 9 | `hsin_publications` | 12 cols | 300 | signal-library | state/published_at | Explorer cards. |
| 10 | `hsin_publication_retractions` | id, pub_id, reason, created_at | 50 | corrections | created_at | + batched title `.in(ids)`. |

**Plus 11 `count: 'exact', head: true'` counts** (sources/signals/publications/reviews
by status) — these are index-only counts, cheap.

**Findings:**
- **No N+1** — confirmed (source-intel reads signals once; corrections batch titles via `.in`).
- **No `select('*')`** on hot paths.
- **Large scans:** #1 (user_roles 20 000) and #2 (signals 8 000) are the two reads
  worth bounding as data grows — both are **cached** (so infrequent), but on a cold
  miss they transfer the most rows. Recommend capping/paginating #1 and windowing #2
  (e.g. last-90-days) when signal volume is large.
- **Missing indexes:** none identified for current filters; recommend a composite
  `(status, created_at)` on `hsin_signals` if the 8 000-row read becomes hot.

---

## 4. Cache findings

- **Coverage:** all 6 base loaders are `unstable_cache`-wrapped:
  `public-intelligence:v1` (60 s), `public-signal-library:v1` (120 s),
  `source-intelligence:v1` (120 s), `operations-intelligence:v1` (60 s),
  `public-corrections:v1` (300 s), `beta-user-stats:v1` (120 s).
- **Tags:** `public-intelligence`, `source-intelligence`, `beta-operations` — enable
  targeted `revalidateTag` invalidation (currently time-based only; no mutation path
  calls revalidateTag, which is fine for a read-only public surface).
- **Composition dedup:** the 5 composing getters (trust/alerts/forecast/collab/
  contributor/release) issue **zero new DB reads** — they read the cached base
  loaders. The Data Cache returns the memoized value, so the heaviest page's 9-getter
  fan-out collapses to ~6 unique loaders. **No unnecessary recomputation** within the
  revalidate window.
- **ISR:** `/signal-library` uses `revalidate = 120`; dashboard/public surfaces are
  `force-dynamic` but their data is cached at the loader layer (so dynamic render +
  cached data = fast).
- **Gap (High):** `unstable_cache` provides no **single-flight** — concurrent requests
  arriving just after an entry expires can each execute the loader (cache stampede).
  At low/medium concurrency this is negligible; at 500–1000 concurrent it can briefly
  multiply the cold-read cost. Recommendation in §9.

---

## 5. Bundle findings

- **Shared baseline 88 kB** (framework + runtime) — healthy for a Next 14 app.
- **First-load range 103–162 kB.** Heaviest: watchlists 162, research-reports 160,
  my-work 159, source-registry 159, home 158, signal-library 151 — all within normal
  bounds; the deltas above baseline are framer-motion + charts + the client explorers/
  drawers on those routes.
- **Per-route JS is small** (≤ 6.3 kB) — most weight is the shared chunk, not page code.
- **Server-first:** forecasting (228 B), collaboration (286 B), release-candidate
  (286 B), beta-operations (286 B) are almost entirely server-rendered (minimal
  hydration) — the Phase 47+ "panels are server components" approach paid off.
- **Client components (hydration cost):** concentrated in the explorers/drawers
  (signal-library, research-reports, my-work, watchlists) and the homepage hero
  (framer-motion). All reduced-motion-aware. No oversized client trees found.
- **Opportunity (Low):** the framer-motion-heavy homepage hero (158 kB) could lazy-
  load the globe below the fold; minor.

---

## 6. Capacity estimates (reasoned)

Because reads are cache-bounded, steady-state DB load ≈ (unique cold reads) ÷
(revalidate window): ~28 reads spread across 60–300 s windows ≈ **< 1 DB read/sec at
steady state regardless of user count**. The binding constraints are serverless
concurrency, cache-miss stampedes, and Supabase connection/egress.

| Users (concurrent) | DB load | Render/serverless | Verdict |
|---|---|---|---|
| 10 | negligible (cache serves ~all) | trivial | ✅ READY |
| 25 | negligible | trivial | ✅ READY |
| 100 | cache serves ~all; rare misses | comfortable | ✅ READY |
| 500 | reads still bounded; occasional stampede on expiry | watch function concurrency | 🟡 MONITOR |
| 1000 | reads bounded but stampede + per-instance rate-limit + Supabase conn limits matter | needs single-flight + shared limiter | 🟡 MONITOR (mitigate first) |

These assume Supabase Pro-tier limits and Vercel serverless autoscaling. Public traffic
is largely CDN-absorbable via the `max-age`/`swr` headers, raising effective ceiling.

---

## 7. Bottleneck matrix

| Severity | Bottleneck | Evidence | Impact |
|---|---|---|---|
| **Critical** | — none — | | |
| **High** | No single-flight on `unstable_cache` → cache stampede on expiry under high concurrency | `lib/*-intelligence.ts` (60 s windows); `unstable_cache` semantics | Brief DB/CPU spike each revalidation at 500+ concurrent |
| **High** | Rate limiter is per-instance in-memory | `lib/rate-limit.ts` (Phase 56.1) | Limits not enforced fleet-wide at scale |
| **Medium** | `user_roles` read capped at 20 000 (admin) | beta-operations.ts:138 | Wide cold read; admin-only, cached |
| **Medium** | 8 000-row signals read (cold) | source-intelligence.ts:161 | Largest content transfer on miss; cached |
| **Medium** | CSP still Report-Only (not perf, security follow-up) | next.config.mjs (56.1) | Tracked separately |
| **Low** | First-load 150–162 kB on explorer/hero routes | build output | Acceptable; minor lazy-load opportunity |
| **Low** | No composite `(status, created_at)` index on hsin_signals | migrations | Only matters if signal volume grows large |

---

## 8. Optimization recommendations (not implemented — audit phase)

1. **Single-flight for cached loaders** (High): wrap base loaders in a request-
   coalescing layer (e.g. React `cache()` for per-request dedup + a short in-process
   promise map) so a cache miss runs the loader once even under concurrency.
2. **Shared rate-limit store** (High): move `lib/rate-limit.ts` to Upstash/Vercel KV
   for fleet-wide limits before sustained 1000-user traffic (already a 56.1 follow-up).
3. **Bound the widest reads** (Medium): paginate/aggregate `user_roles` (or compute
   role counts via grouped count), and window the 8 000-row signals read to a recent
   period as volume grows.
4. **Composite index** (Low): add `(status, created_at)` on `hsin_signals` if that read
   becomes hot.
5. **Lazy-load homepage globe** (Low): defer the framer-motion globe to trim the
   158 kB hero first-load.

None are blockers for the current cohort.

---

## 9. Launch readiness assessment

| Dimension | Status |
|---|---|
| Query efficiency (no N+1, no `select(*)`, bounded reads) | ✅ |
| Cache effectiveness (all loaders cached, compose-dedup, 0 warm reads) | ✅ |
| Render profile (server-first panels, small route JS) | ✅ |
| Bundle sizes (103–162 kB, 88 kB baseline) | ✅ |
| API behavior (cached, CDN headers, rate-limited) | ✅ |
| High-concurrency robustness (single-flight, shared limiter) | 🟡 monitor / mitigate before 1000 |

### Recommendation: **READY** (current + expanded beta, ≤ ~500 concurrent) · **MONITOR** scaling toward 1000

Evidence-based: the cache-bounded read model means DB load does not grow with users;
the two High items are concurrency-robustness improvements, not current defects.

---

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json` — **clean (exit 0)**.
- `tsx --test` over all `*.test.ts` (chunked) — **2669 / 2669 pass, 0 fail**.
- `next build` (apps/web, clean `.next`) — **exit 0, "Compiled successfully"** (route/
  bundle table above is from this build).

No application code changed this phase; platform remains green, no regressions.
(The repo has no `pnpm typecheck`/`pnpm test` scripts; canonical commands above.)
