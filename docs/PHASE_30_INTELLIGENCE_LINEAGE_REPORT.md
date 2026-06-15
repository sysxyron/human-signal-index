# Phase 30 — Intelligence Lineage & Traceability Graph

**Status:** ✅ Complete · web + worker + engine typecheck 0 errors · build green
(169 routes, +3) · **2,456 tests passing (0 fail, +16)** · route audit green (98
registered / 74 sidebar) · smoke green (migrations 0001→0034) ·
**no auth / middleware / RBAC / user_roles / IAM changes.**

Every intelligence artifact is now traceable. HSI can answer: *where did this come
from, what evidence supports it, which investigation used it, which reviewers/
governance touched it, which publication emerged, which outcomes resulted, and
which contributors were responsible.*

---

## 1. Architecture & graph model
```
LINK TABLES (materialized)                ENGINE (@hsi/lineage, PURE)
investigation_signals ─┐                  buildGraph · componentFrom
investigation_publications ─┤             getSignalLineage / getInvestigationLineage
investigation_evidence ─┤── worker ─► graph getPublicationLineage / getContributorLineage
publication_evidence ─┤                   validateLineage (orphans/broken/cycles)
outcome_events (P29) ─┘                   computeGraphHealth
        │
        ▼
   /dashboard/lineage · signal page · /dashboard/admin/graph-explorer · graph-health
        │
        ▼  materialized links → outcome attribution (P29) → trust/authority (P27/28)
```
The lineage chain: **Signal → Evidence → Investigation → Review → Governance →
Publication → Outcome**, plus the contributors who touched each. The engine is
generic over nodes/edges and traverses the connected component **both directions**
(provenance + downstream).

## 2. Link tables (Deliverables 1–4) & migration (25)
`supabase/migrations/0034_intelligence_lineage_graph.sql` (add-only):
- `investigation_signals`, `investigation_publications`, `investigation_evidence`,
  `publication_evidence` — M:N, **unique-constrained**, FK'd to the real tables
  (`hsin_signals`, `investigations`, `hsin_publications`, `evidence_sources`),
  indexed, audited.
- `graph_health` — append-only health snapshots.
- RLS: link tables = researcher+ READ, **reviewer+ WRITE**, admin all;
  `graph_health` = researcher+ READ, admin all (worker writes via service role).

## 3. Lineage engine (Deliverables 5–10)
`packages/lineage` — PURE, deterministic, no DB/UI:
- `getSignalLineage` / `getInvestigationLineage` / `getPublicationLineage` /
  `getContributorLineage` (D6–9) — resolve an artifact's connected component,
  bucketed by kind, with trace depth. Many-to-many supported.
- `validateLineage` (D10) — `detectOrphans`, `detectBrokenChains` (publication
  with no source; investigation output with no source), `detectCircularReferences`
  (DFS cycle detection).
- `computeGraphHealth` (D23) — chain completeness, orphan count, broken chains,
  average trace depth, coverage, headline health score.

## 4. Worker + backfill (Deliverables 21, 22)
`contributorNetworkWorker` extended with `runLineage()`:
- **Backfill (D22)** — materializes `publication_evidence` from the real
  research-runs pipeline (`evidence_sources.research_run_id ⋈
  hsin_publications.run_id`).
- Builds the lineage graph from the link tables + outcome events and writes a
  `graph_health` snapshot (D23/24). **Never writes `user_roles`.**

## 5. Integration upgrades (Deliverables 11, 18, 19, 20)
- **Outcome attribution (D20/11)** — `runOutcomeAttribution` now reads the
  materialized `investigation_signals` / `investigation_publications` links and
  builds **real** `signal_to_investigation` / `investigation_to_publication` edges
  (cleaned by the Phase-29 anti-gaming pass) instead of inferring them. Signal
  effectiveness is now lineage-backed.
- **Trust / authority (D18/19)** — consume the same real outcome aggregates that
  the lineage now materializes; impact → trust → authority is unchanged in
  direction and now lineage-backed.

## 6. UI (Deliverables 12–17, 24)
- **`/dashboard/signals/[id]`** (D15) — added an intelligence-lineage card
  (evidence / investigations / publications / outcomes + depth) linking to the
  explorer.
- **`/dashboard/lineage`** (D16) — trace any artifact by kind+id; full bucketed
  lineage + graph-health summary.
- **`/dashboard/admin/graph-explorer`** (D17) — node/edge counts, broken chains,
  orphan records (read-only).
- **`/dashboard/admin/graph-health`** (D24) — health score, coverage, completeness,
  broken/orphan/cycle counts.
- Reviewer+ **link actions** (`linkSignalToInvestigation`, etc.) let the app
  materialize the remaining links going forward; provenance for investigation
  (D13) / publication (D14) / evidence (D12) is served by the lineage engine via
  these surfaces.

## 7. Files

**Created**
- `packages/lineage/` (package.json, tsconfig; `src/`: types, graph, lineage,
  validation, health, fixtures, index; `tests/`: lineage, validation — 15 tests)
- `apps/web/lib/contributor/lineage.ts`
- `apps/web/app/dashboard/lineage/page.tsx`
- `apps/web/app/dashboard/admin/graph-explorer/page.tsx`
- `apps/web/app/dashboard/admin/graph-health/page.tsx`
- `supabase/migrations/0034_intelligence_lineage_graph.sql`
- `docs/PHASE_30_INTELLIGENCE_LINEAGE_REPORT.md`

**Modified**
- `apps/worker/jobs/contributor-network-worker.ts` (+ `.test.ts`) — lineage backfill
  + graph health + materialized attribution edges
- `apps/web/app/dashboard/signals/[id]/page.tsx` — lineage card
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` — Lineage + Graph Explorer + Graph Health nav
- `apps/web/lib/launch/migration-audit.ts` (+0034) + `migration-audit.test.ts`
- `tsconfig.base.json`, `apps/web/package.json`, `apps/worker/package.json` — new package

## 8. Verification

| Item | Result |
| --- | --- |
| Migration | `0034_intelligence_lineage_graph.sql` |
| Tests added | 16 (15 engine, 1 worker) |
| Full test suite | ✅ **2,456 / 2,456**, 0 fail |
| Web / worker / engine typecheck | ✅ 0 errors each |
| Build | ✅ compiled (169 routes) |
| Route audit | ✅ 98 registered / 74 sidebar resolve |
| Migration audit / smoke | ✅ 0001→0034, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 9. Security audit (Deliverable 27)
- **No auth / RBAC / middleware / user_roles / IAM changes** (verified: no diff to
  `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **No role escalation** — lineage is traceability only; the worker never writes
  `user_roles`.
- **No service-role exposure** — `lineage.ts` is `'use server'`, imported only by
  server pages; reads use the RLS user client / `requireAdmin`; only the worker
  writes via service role. Link writes are reviewer+ via RLS.
- **Anti-cycle** — the engine rejects circular references (tested); link tables are
  unique-constrained (no duplicate edges).

## 10. Remaining gaps / Phase 31 recommendation
- **signal↔investigation & investigation↔publication links** are written by the new
  reviewer+ link actions but not yet auto-derived (the Phase-25 `investigations`
  table has no FK to `research_runs`/signals). Phase 31: add a one-time derivation
  (or wire the investigation workflow to record the originating signal) so these
  links backfill automatically like `publication_evidence` does.
- **Visual graph** — the explorer is list/bucket-based; a node-link visualisation
  is a future enhancement.
- **review/governance lineage nodes** — reviews and governance decisions are
  modelled in the engine but not yet emitted as lineage edges by the worker; wire
  `investigation_to_review` / `review_to_governance` next for the full chain.
