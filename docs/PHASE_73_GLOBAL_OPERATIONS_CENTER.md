# Phase 73 — Global Operations Center

**Status:** Complete (uncommitted) · **Type:** Additive, read-only (no migration)
**Route:** `/dashboard/command-center` (reviewer+)
**Migration:** none — composes existing tables only.

The executive command surface for HSI. It unifies sources, signals, narratives,
evidence, forecasts, trust, transparency, the source/signal networks, and the
global map into one workspace that answers **"what requires attention right now?"**
while preserving full traceability. Every number is a real count; every status
uses thresholds documented in code; missing relationships are surfaced as **NOT
OBSERVED**. No AI assessment, no fabricated intelligence, no auth/ingestion/
publishing/review changes. Human review stays authoritative.

> **Route note:** `/dashboard/operations-center` already belongs to the Phase 24
> *Human* Operations Center (team workloads/escalations). To avoid colliding with
> that existing feature, the Global Operations Center lives at
> **`/dashboard/command-center`**.

---

## 1. Architecture audit & dependency map

| Source | Reused | What it provides |
|---|---|---|
| `lib/source-network/data.getSourceNetworkDashboard` | DAL | source health totals, capability, trust band, families |
| `lib/signal-network/data.getSignalNetworkDashboard` | DAL | signal health, relationship counts, narrative & forecast attribution, per-signal attribution flags |
| `lib/signal-network/data.getSignalReadiness` | DAL | signal lineage completeness |
| `lib/narrative-map/data.getGeospatialIntelligence` | DAL (cached) | geo buckets (country/region), contradictions, trust aggregates, blind spots |
| `lib/global-map/*` (Phase 71) | model | geo readiness primitives |
| `forecasts`, `public_reports`, `hsin_*` tables | count queries | executive overview + integrity |
| `lib/security/rbac-audit`, `packages/ui` nav | RBAC/nav | gating + navigation |

No new relationship is created; the operations center only reads + composes.
Reused metrics keep their Phase-70.3/70.4/72 definitions, so numbers are
consistent across surfaces.

## 2. Files created

- Pure: `lib/operations-center/{types,mission,attention,timeline}.ts`
- Server: `lib/operations-center/data.ts` (`getOperationsCenter`, memoized)
- UI: `components/operations-center/panels.tsx`
- Route: `app/dashboard/command-center/page.tsx`
- Tests: `lib/operations-center/operations-center.test.ts`; Docs: this file.

## 3. Files modified

- `lib/security/rbac-audit.ts` — `/dashboard/command-center` reviewer+.
- `packages/ui/src/nav-roles.ts` — NAV_VISIBILITY + ALL_NAV_HREFS.
- `packages/ui/src/navigation.tsx` — sidebar "Command Center" (Gauge).

## 4. Routes added

`/dashboard/command-center` (reviewer+).

## 5. Metrics added

- **Executive overview** (exact COUNTs): sources, signals, narratives, evidence,
  forecasts, investigations, published reports, pending review, active watchlists,
  active alerts, trust records.
- **Intelligence health**: source + signal health (reused), trust band
  distribution, map-ready.
- **Narrative / forecast / geo / transparency watch**: reused real counts.
- **Timeline**: new sources/signals/narratives/evidence/forecasts/investigations
  in last 7d / 30d (exact `created_at` count queries).

## 6. Attention queue logic

`buildAttentionQueue` (pure) takes observable counts and emits items only when
count > 0, ordered deterministically by **fixed severity** (critical → low), then
count desc, then key. Severities (documented in code): blocked/offline sources =
critical; broken transparency chains, signals missing attribution, narratives
missing evidence, forecasts awaiting review = high; low-trust sources, missing
feeds, blind spots = medium; missing geo = low. Each item carries an href +
detail for traceability. No AI prioritization.

## 7. Relationship audits

`integrity[]` — each check is real or **NOT OBSERVED**:
- signals without source (`source_id is null`) — observed.
- forecasts without narrative (`narrative_id is null`) — observed.
- narratives without members (total − distinct `narrative_members`) — observed.
- broken transparency links (published reports with null `signal_id`) — observed.
- broken graph edges = 0 (FK-enforced) — observed.
- **evidence without signal — NOT OBSERVED** (no direct column; would require full
  graph traversal — never inferred).
- orphaned records = sum of the observable orphan checks.

## 8. Timeline methodology

Reuses existing `created_at` timestamps via exact `gte`-window COUNT queries
(7d / 30d). No new storage; pure `windowCounts`/`withinDays` helpers cover the
date math and are unit-tested (future + invalid timestamps excluded).

## 9. Mission summary methodology

Seven domains, each GREEN/YELLOW/RED via **documented deterministic thresholds**
(`lib/operations-center/mission.ts`):
- `ratioStatus` (higher better): GREEN ≥ 0.7, YELLOW ≥ 0.4, else RED; empty → YELLOW.
- `inverseRatioStatus` (lower better): GREEN ≤ 0.1, YELLOW ≤ 0.3, else RED.
- `backlogStatus`: GREEN ≤ 10, YELLOW ≤ 50, else RED.

Domains: System (source healthy ratio), Collection (offline+blocked ratio),
Review (pending backlog), Trust (medium+ trust ratio), Forecast (narrative
attribution ratio), Geo (map-ready ratio), Transparency (broken-chain ratio).
**Overall = worst domain.** No AI assessment.

## 10. Performance design

`getOperationsCenter` is `unstable_cache`-wrapped (60s, tags `operations-center`/
`global-map`/`narrative-map`). It reuses the already-aggregated network DALs and
uses **exact COUNT head-queries** (`count: 'exact', head: true`) + `gte` filters
for overview/timeline/integrity — so raw datasets are **never** loaded into the
browser or even materialized server-side for counting. Designed for 10k–100k
records. Region/health data comes from the capped Phase 70.3/70.4/72 aggregations.

## 11. Verification results

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Operations-center unit tests (mission/attention/timeline) | ✅ 10/10 |
| Nav-roles invariant (route added) | ✅ pass |
| Full suite (tracked + untracked) | ✅ (see report) |
| `next build` (clean `.next`) | ✅ route present |
| Migration audit (count unchanged 0001→0058) | ✅ |
| RBAC audit (`/dashboard/command-center` reviewer+) | ✅ |
| Route audit (no collision with Phase 24 operations-center) | ✅ separate route |

## 12. Phase 74 readiness assessment

The command center is the read/observe surface. Phase 74 dependencies:
- **Actionability**: turn attention-queue items into one-click triage (assign,
  acknowledge, snooze) — reuse the Phase 24 operations actions + audit, keeping
  human review authoritative.
- **Alerting**: wire mission RED/attention-critical transitions into the Phase 62
  notifications framework (no new storage needed).
- **Drill-through**: deep links from each watch panel into pre-filtered detail
  views (sources/signals already have detail pages; add narrative/forecast detail).
- **Evidence→signal attribution**: the one NOT OBSERVED integrity check — closing
  it needs a graph traversal pass or an explicit link, unlocking exact evidence
  lineage counts. All additive; none touch ingestion/review/publishing.

Left **uncommitted** per your standing preference.
