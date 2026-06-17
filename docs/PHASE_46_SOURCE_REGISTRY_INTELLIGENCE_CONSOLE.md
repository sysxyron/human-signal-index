# Phase 46 — Source Registry Intelligence Console

The Source Registry is no longer a CRUD demo table. It is now a **source-
intelligence observatory**: a health dashboard, coverage map, analytics, a
searchable/filterable/groupable source explorer with intelligence cards, and an
on-demand per-source detail drawer (relationships, lifecycle timeline,
reliability). A user immediately sees **where intelligence comes from, what's
active, what's producing signals, and which categories drive reports.**

**Untouched:** RBAC, IAM, auth, middleware, CMS, billing, Stripe, compliance, the
**source ingestion pipeline**, cron jobs, and the review workflow. Read-only
intelligence enhancements only. No schema/RLS changes. The "Manage sources" action
(the existing CRUD surface) is preserved.

---

## Architecture & data flow

```
hsin_sources  +  hsin_signals (source_id, category, status, created_at)  +  hsin_publications (count)
        ▼
lib/source-intelligence.ts → getSourceIntelligence()        [cached, server-only]
   • reuses readPublicClient() from lib/public-intelligence (service-role → anon → null)
   • reuses unstable_cache (tag `source-intelligence`, 120s) + the category mapping
   • THREE bounded reads (sources ≤500, signals ≤8000, one published head-count)
     → in-memory tallies → cards, health, coverage, analytics (NO N+1)
        ▼
app/dashboard/source-registry/page.tsx  (server, RBAC-gated by middleware)
   • <SourceHealthDashboard/>   Part 3 — active / inactive / failing / high-yield / signals / reports
   • <CoverageMap/>             Part 4 — signals + sources per category
   • <SourceAnalytics/>         Part 8 — top / fastest-growing / most-influential / most-active categories
   • <SourceExplorer/>          Parts 1–2 — search · filter · sort · group · intelligence cards
        └─ <SourceDetailDrawer/> (on demand)
              Part 5 relationships (Source → Signals → Reports)
              Part 6 lifecycle timeline (added / validated / last seen / activity / influence)
              Part 7 reliability (coverage / activity / yield / review outcomes / trend)
```

### Derived intelligence (in-memory, from one signals read)
- **Per source:** type bucket (Websites/YouTube/Podcasts/RSS/Social/Documents/Other),
  status (Active/Paused/Disabled/Failing), signal yield, recent (30d) activity, last
  activity, coverage category (top narrative bucket), 6-month trend, approved/rejected
  review outcomes, and two computed 0–100 scores: **health** (status + recency + yield)
  and **reliability/trust** (status + approved-ratio + yield − baseline-risk).
- **Aggregate:** health summary, coverage by category (signals + sources), and analytics.

### Reuse (Part 10)
Same read-client strategy, same `unstable_cache` infrastructure, and same category
mapping as Phases 43–45. The signals read is **bounded and shared** (one query feeds
every per-source tally and the coverage/analytics rollups) — no N+1, no per-source
queries. The detail drawer mounts **on demand** (`AnimatePresence`); per-source trend
and category data are precomputed so the drawer ships no extra payload.

---

## Public safety review (Part 9)

Surfaced: source **name**, type, status, baseline risk level, timestamps
(added / last activity), and **aggregate signal tallies** + computed scores.

**Never surfaced:** PII, reviewer identities, internal/moderation notes,
`created_by`, private source metadata, or any admin-only field. The source query
selects a safe column allowlist only; review **outcomes** are shown as
approved/rejected **counts** derived from signal status (no reviewer identity, no
notes). "Reports influenced" is an aggregate published-report count (no fabricated
per-source attribution). Empty/zero states everywhere when there is no data
(sandbox/CI without env) — no fake analytics.

---

## Performance impact

- Read-only + cached (120s, shared cache tag). Three bounded reads via the cached
  loader; everything else is in-memory. No N+1.
- Explorer search/filter/sort/group run client-side over the already-fetched dataset
  (debounced search). Flat view paginates (12 / "Load more"); grouped view buckets
  by type/health/category.
- The detail drawer is lazy (mounts on open). No client-bundle growth from the server
  lib (type-only imports). Reduced-motion respected for the drawer + trend visuals.

---

## Screenshots

Not capturable in this environment (no browser runner). Verify on a preview deploy
at `/dashboard/source-registry`: the 6-metric health dashboard, the coverage-by-
category bars, the analytics panels, the explorer (facet rail + group/sort + source
cards with health/trust gauges), and the source drawer (relationships flow,
lifecycle timeline, reliability trend). Mobile collapses to a single column.

---

## Files

**Added**
- `apps/web/lib/source-intelligence.ts` — cached, read-only source-intelligence data layer.
- `apps/web/components/source-registry/SourceHealthDashboard.tsx` — overview metrics.
- `apps/web/components/source-registry/CoverageMap.tsx` — coverage by category.
- `apps/web/components/source-registry/SourceAnalytics.tsx` — top / growing / influential / active.
- `apps/web/components/source-registry/SourceExplorer.tsx` — search / filter / sort / group / cards.
- `apps/web/components/source-registry/SourceDetailDrawer.tsx` — relationships / timeline / reliability.
- `docs/PHASE_46_SOURCE_REGISTRY_INTELLIGENCE_CONSOLE.md` — this report.

**Changed**
- `apps/web/lib/public-intelligence.ts` — exported `readPublicClient()` so the new module reuses the same client strategy.
- `apps/web/app/dashboard/source-registry/page.tsx` — live intelligence console (was static demo); "Manage sources" preserved.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**; `/dashboard/source-registry` → 5.47 kB (160 kB first load).
