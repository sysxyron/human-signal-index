# Phase 53 — Collaboration & Investigation Network

A new researcher+ surface at `/dashboard/collaboration` for **structured operational
coordination** — who is working on what, where the bottlenecks are, what's
publication-ready. It is **not chat / not Slack**: there is no messaging, no write
actions, no workflow changes — only read-only coordination views built from the
cached intelligence layers, respecting existing RBAC.

**Untouched:** RBAC, IAM, auth, middleware, Stripe, billing, compliance, review /
publishing / signal / source workflows. No identities are ever exposed.

---

## Architecture & operational model

```
operations-intelligence  → getOperationsIntelligence()    (pipeline stages, review ops)
public-intelligence.ts   → getPublicIntelligenceBundle() / getSignalLibraryData()  (activity, risk facets, cases)
source-intelligence.ts   → getSourceIntelligence()        (coverage, source analytics)
forecasting-intelligence → getForecastData()              (fastest-growing categories)
beta-operations.ts       → getBetaOperations()  (ADMIN ONLY — aggregate role counts for load ratios)
        ▼ getCollaborationData(role)  (Promise.all over cached sources — no duplicate reads, no N+1)
app/dashboard/collaboration/page.tsx  (SERVER, force-dynamic, researcher+ via canResearch)
  • Executive collaboration summary  Part 9
  • Team operations overview         Part 2
  • Investigation ownership          Part 3   • Investigation health   Part 8
  • Workload balancing               Part 4 (per-analyst ratios admin-only)
  • Escalation center                Part 5   • Cross-team intelligence Part 7
  • Collaboration timeline           Part 6
```

### Operational model (observable workflow state → coordination)
The pipeline stage counts (real `hsin_signals` statuses) drive everything:
- **Team ops / ownership:** active = Signal+Evidence+Analysis; in-progress =
  Evidence+Analysis; pending review = open reviews; awaiting publication = approved
  stage; published = publication stage; escalated = critical findings.
- **Investigation health:** Healthy / At-risk (critical+high) / Delayed (awaiting
  publication) / Blocked (evidence stage) / Published — observable state only.
- **Cross-team intelligence:** most-active (category activity), fastest-growing
  (forecasting momentum), most-published (per-category published count), source
  concentration (top source's share of signals).

## Escalation model (Part 5)

Escalations surface **only when thresholds are exceeded**: critical/high risk
present, aging investigations (>180 days), publication delays (>10 awaiting),
traceability failures (<80%), review bottleneck (>20 pending). When none breach,
the panel states all thresholds are within range. Each carries a high/medium tag.

## Role-aware access (Part 10)

- **Gate:** researcher+ via the existing `canResearch(role)` (same `ErrorState` for
  others; RBAC + middleware still enforce). No permission changes.
- **Researchers** see the team-ops / ownership / health / timeline coordination
  views. **Reviewers** additionally have review-queue emphasis (pending review,
  awaiting publication, escalations). **Admins** additionally see **workload
  balancing per-analyst/reviewer ratios** — computed from *aggregate* role counts
  (`getBetaOperations`, admin-only), never names. Non-admins see those ratios as
  "—" with an explanatory note.

---

## Performance

- Up to six cached reads via `Promise.all` (shared cache tags) → ≤1 DB pass per
  cache window; the admin role-count read runs only for admins. No duplicate reads,
  no N+1. Fully server-rendered (no client islands).

## Public safety

- Aggregates + workflow-state counts only; reuses the public-safe activity feed for
  the timeline. **No identities, no notes, no messaging.** Per-analyst load is an
  aggregate ratio (cases ÷ role count), admin-only. Graceful empty/"within range"
  states throughout.

---

## Files

**Added**
- `apps/web/lib/collaboration-intelligence.ts` — composed coordination data (role-aware, read-only).
- `apps/web/components/collaboration/panels.tsx` — exec summary, team ops, ownership, workload balancing, escalation, timeline, cross-team, investigation health.
- `apps/web/app/dashboard/collaboration/page.tsx` — Collaboration & Investigation Network.
- `docs/PHASE_53_COLLABORATION_NETWORK.md` — this report.

> Reuses operations / public / source / forecasting / beta-operations layers. No new
> queries, no workflow or permission changes.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build` (clean `.next`): **exit 0, "Compiled successfully"**; `ƒ /dashboard/collaboration` → 283 B (110 kB first load), fully server-rendered.
