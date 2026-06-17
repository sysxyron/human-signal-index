# Phase 48 — Analyst Workspace

`/dashboard/my-work` is now the analyst's **operational workspace** — answering
"what am I working on?" (vs Mission Control's "what is happening?"). An analyst
lands and immediately sees what they own, what needs attention, what's blocked,
and what to work next, from real cached platform data.

**Untouched:** RBAC, IAM, auth, middleware, billing, Stripe, compliance, **review
workflow logic**, and existing permissions. The page's existing **researcher+ gate
(`canResearch`)** and `OperationsNav` are preserved exactly; the Phase 24
operations-os "My Work" data layer (`lib/operations-os/*`) is **left intact** — it
is simply no longer rendered here (not modified). Workspace layer only.

---

## Architecture & data flow

```
public-intelligence.ts   → getPublicIntelligenceBundle()  (metrics, activityBar)
                         → getSignalLibraryData()          (cases, risk facets)
source-intelligence.ts   → getSourceIntelligence()         (cached alongside)
operations-intelligence  → getOperationsIntelligence()     (pipeline stages, review ops)
supabase/server          → getSessionRole() / getUser()    (gate + role-aware actions)
        ▼ gate: canResearch(role) preserved → ErrorState if not authorized
        ▼ Promise.all (4 cached reads)
app/dashboard/my-work/page.tsx  (SERVER component, force-dynamic)
  • My work overview          Part 1  — assigned signals / reviews / reports / pending / completed today
  • Quick actions             Part 9  — role-aware (reuses Mission Control QuickActions / canSeeRoute)
  • Priority engine           Part 8  — Critical / High risk / Review due / Recently escalated / Stale
  • Workload view             Part 4  — Open / In progress / Waiting review / Published / Completed
  • Personal metrics          Part 7  — investigations / reviews / turnaround / impact / traceability
  • Investigation queue       Part 2,3 — sortable/filterable case cards (client)
        └─ <CaseDrawer/> (on demand)  Part 5 timeline + Part 6 collaboration (public-safe)
```

### Mapping (real data → workspace)
- **My work / workload / pipeline:** the operations pipeline stage counts
  (`new→Signal`, `needs_research→Evidence`, `reviewing→Analysis`, `approved→Review`,
  `published→Publication`) + review ops (pending/backlog, approved/rejected today) +
  `activityBar.publishedToday`. Framed as the analyst's role-relevant workload.
- **Investigation queue / case workspace:** the cached library cases
  (`PublicLibrarySignal[]`) — each with category, risk (priority), status, evidence
  count, traceability, review state, and publication date (last activity). Sortable
  by priority / recency / age / traceability; filterable by status / risk / category.
- **Priority engine:** Critical & High from the library risk facets; Review due from
  pending reviews; Recently escalated = risk≥4 published in the last 30 days; Stale =
  cases older than 180 days. All real, server-computed.
- **Personal metrics:** aggregate role-relevant outcomes (publications, today's
  review decisions, traceability avg). `Avg turnaround` is `—` (not derivable
  publicly) — never fabricated.

### Reuse (Part 10)
No new data layer — every read is a slice of the **already-cached** Phase 43–47
bundles, run via `Promise.all` (no N+1). Panels are **server-rendered**; only the
investigation queue + case drawer are client islands, and the drawer mounts **on
demand** (`AnimatePresence`). Quick actions reuse the Mission Control component.

---

## Role-aware behavior

- The **researcher+ gate is unchanged** (`canResearch(role)`); viewers/contributors
  get the same `ErrorState` as before. RBAC + middleware still gate the route.
- Quick actions filter through the shared `canSeeRoute(href, role)` — Review Queue /
  Source Registry appear only for roles that already see them; Submit Signal / Signal
  Library / Research Reports are public. UX only; **no permission changes**.

---

## Public safety review

- **Collaboration view exposes NO identities, NO notes, NO messaging** — ownership is
  shown at pool level ("Analyst pool" / "Unassigned"), with last-update date and
  review status only. This is stated in the drawer itself.
- Cases are published/archived public content; counts, scores, categories, and dates
  only — no raw signal content, source names, reviewer identities, or PII.
- Graceful empty/zero states everywhere (sandbox/CI without env) — no fabricated
  queue, metrics, or priorities.

---

## Performance impact

- Four cached reads + the existing gate lookup, via `Promise.all`; shared
  `public-intelligence` cache tag → ≤1 DB pass per cache window. No N+1.
- Server-rendered panels; client JS limited to the queue + drawer; drawer is lazy.
  Reduced-motion respected (timeline pulse, drawer slide). Date math for stale/
  escalated runs server-side (the page is force-dynamic) — no hydration risk
  (display uses server-formatted date labels, not relative client time).

---

## Files

**Added**
- `apps/web/components/analyst-workspace/WorkspacePanels.tsx` — my work / workload / personal metrics / priority engine.
- `apps/web/components/analyst-workspace/InvestigationQueue.tsx` — sortable/filterable case queue + cards.
- `apps/web/components/analyst-workspace/CaseDrawer.tsx` — collaboration (public-safe) + investigation timeline.
- `docs/PHASE_48_ANALYST_WORKSPACE.md` — this report.

**Changed**
- `apps/web/app/dashboard/my-work/page.tsx` — Analyst Workspace (gate + OperationsNav preserved); reuses Phase 43–47 cached layers.

> Reuses `QuickActions` from `components/mission-control`, and the
> `public-/source-/operations-intelligence` data layers. No new queries.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**; `ƒ /dashboard/my-work` → 5.13 kB (159 kB first load).
