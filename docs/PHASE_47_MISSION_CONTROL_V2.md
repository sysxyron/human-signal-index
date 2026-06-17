# Phase 47 — Mission Control V2

The dashboard landing page is now a real **intelligence operations center**. A
researcher lands and immediately sees what's happening, what matters, what needs
attention, and what to investigate next — all from real, cached platform data.

**Untouched:** RBAC, IAM, auth, middleware, CMS, billing, Stripe, compliance, role
approval workflow. Read-only operational layer — **no workflow changes**. No
schema/RLS changes. `RoleTaskCards`, `AccessDeniedNotice`, and the role-gated
"New report" action are preserved.

---

## Architecture & operational data flow

```
public-intelligence.ts   → getPublicIntelligenceBundle()  (metrics, activityBar, activityFeed, categoryActivity)
                         → getSignalLibraryData()          (risk facets, risk trend, recent publications)
source-intelligence.ts   → getSourceIntelligence()         (health, top sources, coverage)
operations-intelligence  → getOperationsIntelligence()     (signal-flow pipeline, review ops)   [NEW]
supabase/server          → getSessionRole()                (role-aware quick actions)
        ▼ Promise.all (4 cached reads + role)
app/dashboard/page.tsx  (SERVER component — was a static 'use client' demo)
  • Executive summary        Part 9  — status / top risk / top category / top source cat / backlog / health
  • Operations overview      Part 1  — active signals / pending / published today / high-risk / sources / traceability
  • Analyst quick actions    Part 10 — role-aware (canSeeRoute), shows only links the role can already see
  • Risk command + Review    Part 3,4
  • Signal flow pipeline      Part 5  — Signal → Evidence → Analysis → Review → Publication (real status counts)
  • Category heatmap + Stream Part 6,2
  • Source ops + Pub ops      Part 7,8
```

### New data layer — `lib/operations-intelligence.ts`
Supplies only what the existing bundles didn't: the **signal-flow pipeline** (real
`hsin_signals` status counts mapped to lifecycle stages — new→Signal, needs_research
→Evidence, reviewing→Analysis, approved→Review, published→Publication) and **review
operations** (pending/backlog from open statuses; approved/rejected *today* from
`hsin_signal_reviews` decision+timestamp). Reuses `readPublicClient()` and
`unstable_cache` (tag `public-intelligence`, 60s). `avgReviewHours` is `null`
(not derivable publicly) and renders as "—".

### Reuse (Part 11)
Everything else is sliced from the **already-cached** Phase 43–46 bundles — no
duplicate queries. The five reads run via `Promise.all`. Counts are head-only or
in-memory tallies; no N+1. The page ships no heavy client bundle — panels are
server-rendered; only `TopNav`, `RoleTaskCards`, and `AccessDeniedNotice` remain
client islands. Charts (Donut) are presentational.

---

## Role-aware behavior (Part 10)

Quick actions are filtered with the shared `canSeeRoute(href, role)` (the exact
predicate the sidebar uses): Submit Signal / Signal Library / Research Reports are
public and always shown; Review Queue (`/dashboard/review`) appears only for
reviewer/curator/admin; Source Registry follows its nav visibility. This is **UX
only** — RBAC + middleware still gate every destination; nothing here grants access
or changes permissions. The pre-existing `RoleTaskCards` and `AccessDeniedNotice`
remain unchanged.

---

## Public safety review

- Only aggregate counts, derived scores, and already-public published content flow
  to the page. Review operations show **decision counts** (approved/rejected today)
  — never reviewer identities, notes, or signal raw content.
- The activity stream reuses the public-safe event feed (publication titles;
  signal **categories** only; generic source/review events).
- Source operations show health counts + highest-yield names + coverage gaps — no
  PII, no private source metadata, no admin-only fields.
- Graceful empty/zero states everywhere (sandbox/CI without env): no fabricated
  metrics, pipeline, or activity.

---

## Performance impact

- Four cached reads (shared `public-intelligence` cache tag) + one cookie-based role
  lookup, all via `Promise.all`. A burst of dashboard loads collapses to ≤1 DB pass
  per cache window. No N+1.
- The page changed from a fully client-rendered demo to a **server component** with
  small client islands → less client JS. Reduced-motion is respected (no new
  animations beyond existing islands).

---

## Screenshots

Not capturable here (no browser runner). Verify on a preview deploy at `/dashboard`:
executive summary card with status pill, the 6-metric overview, role-aware quick
actions, risk command (tier counts + donut) beside review operations, the signal-
flow pipeline, category heatmap beside the activity stream, and source ops beside
publication ops. Mobile collapses to a single column.

---

## Files

**Added**
- `apps/web/lib/operations-intelligence.ts` — pipeline + review ops (cached, read-only).
- `apps/web/components/mission-control/OverviewPanels.tsx` — executive summary + operations overview.
- `apps/web/components/mission-control/RiskOpsPanels.tsx` — risk command + pipeline + review ops.
- `apps/web/components/mission-control/IntelPanels.tsx` — category heatmap + activity stream + source ops + publication ops.
- `apps/web/components/mission-control/QuickActions.tsx` — role-aware shortcuts.
- `docs/PHASE_47_MISSION_CONTROL_V2.md` — this report.

**Changed**
- `apps/web/app/dashboard/page.tsx` — Mission Control V2 (server component); was a static client demo. Reuses Phase 43–46 cached data layers.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**; `ƒ /dashboard` → 2.51 kB (115 kB first load — down from the prior fully-client demo).
