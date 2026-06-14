# Phase 24 — Human Operations & Case Management OS

**Status:** ✅ Complete · web + worker typecheck green · build green (121 pages,
+7) · **2,258 tests passing (0 fail, +182)** · route audit green · smoke test
green · no Phase 1–23B regressions.

This phase adds the operational layer that lets teams work together — assignment,
ownership, escalation, lifecycle, workload, capacity, performance, and beta-tester
operations — while preserving every governance guarantee. **No autonomous
decisions, publications, approvals, or governance actions.**

---

## 1. Architecture

```
@hsi/operations-engine (PURE)          @hsi/performance-engine (PURE)
  lifecycle · assignment · escalation    throughput · timing · backlog
  workload · capacity · alerts           (informational only, no gamification)
        │                                        │
        ▼                                        ▼
  apps/web/lib/operations-os (DAL)  ── reads tables, validates writes via engine,
        │                              audits every action to operations_audit_events
        ▼
  7 dashboards (researcher+):  operations-center · my-work · workloads · teams ·
        operations-alerts · executive-operations · contributor-ops
        ▲
  apps/worker/jobs/operations-worker.ts  ── every 30 min: refresh workloads +
        capacity, detect overdue work, write advisory alerts (offline-safe)
        ▲
  supabase/migrations/0027_human_operations_os.sql  ── 10 tables, RLS, audit
```

Pure engines decide and validate; the DAL persists + audits; the worker refreshes
advisory rollups. Everything operational is **advisory** — it assigns work and
surfaces load but never publishes, approves, rejects, or governs.

## 2. Operations Engine (`packages/operations-engine`)

Pure, deterministic (`now` injected), offline, no React, no I/O. Modules:
- **lifecycle** — `SUBMITTED → TRIAGE → RESEARCH → EVIDENCE_COLLECTION → REVIEW →
  PUBLICATION_REVIEW → PUBLISHED → ARCHIVED`; validated `transition()` (actor +
  reason required, no silent changes), `canTransition`, `buildTimeline`,
  `lifecycleProgress`.
- **assignment** — `assignCase` / `reassignCase` / `unassignCase` /
  `getAssignments` / `trackAssignmentHistory` / `ownershipChain`; every action
  yields an auditable history entry (who/what/when/why).
- **escalation** — `escalate` / `deEscalate` (LOW<MEDIUM<HIGH<CRITICAL),
  `escalationHistory`, notify-only `escalationNotifications`. Escalations never
  publish/approve/reject/modify evidence — only notify, prioritize, flag.
- **workload** — `computeWorkload` (per assignee), `computeTeamWorkload` (per
  team, health), `forecastCapacity` (backlog trajectory + staffing gap),
  `detectOpsAlerts` (overdue/stalled/escalation/imbalance — all advisory).
- **fixtures** — `operationsDemo()` end-to-end offline.

**Tests: 162** (lifecycle, assignment, escalation, workload, fixtures, a full
8×8 transition matrix + escalation rank matrix) — exceeds the 100-test minimum.

## 3. Performance Engine (`packages/performance-engine`)

`computePerformance()` + `perActorThroughput()`: cases completed, review/
publication throughput, escalation volume, avg response/completion time, backlog
reduction. **No gamification** — alphabetical (not ranked), explicit
"informational only" note. **12 tests.**

## 4. Lifecycle / Assignment / Escalation systems

All implemented as pure engine functions (above) and surfaced through governed DAL
writes: `transitionCaseDal`, `assignCaseDal`, `escalateCaseDal` — each validates
via the engine and writes an `operations_audit_events` row. Reviewer+ to act.

## 5. Capacity forecasting

`forecastCapacity()` estimates weekly capacity, net backlog change, weeks-to-clear,
projected backlog, staffing gap, and trend. **Advisory only — never auto-assigns
or auto-escalates.** Surfaced on Executive Operations.

## 6. Operations Center

`/dashboard/operations-center` is the primary operational command surface:
open/overdue/escalation/alert counts, team health, advisory alerts, and assignee
workload. Plus six focused dashboards (My Work, Workloads, Teams, Operational
Alerts, Executive Operations, Contributor Ops).

## 7. Database design (migration 0027)

10 add-only tables — `teams`, `team_members`, `assignments`,
`assignment_history`, `workloads`, `escalations`, `operations_alerts`,
`operations_audit_events`, `tester_issues`, `tester_issue_history` — with CHECK
enums, FKs, indexes, `set_updated_at` triggers on mutable tables (append-only
audit tables carry none), RLS (researcher+ READ; reviewer+ WRITE; admin all), and
a seed of the eight canonical teams. No existing table modified.

## 8. Governance guarantees

- No autonomous publication, approval, rejection, or governance action anywhere in
  this phase. Escalations and alerts are advisory (notify/prioritize/flag only).
- Every state change (assignment, reassignment, escalation, lifecycle transition,
  completion) requires an actor + reason and is written to
  `operations_audit_events`. No silent changes.
- The worker never auto-assigns / auto-escalates / auto-approves / auto-publishes.
- Untouched per the hard constraints: evidence, forecasting, simulation, executive
  intelligence engines; governance rules; RBAC permissions; publication approval;
  audit-logging guarantees.

## 9. Testing

| Suite | Tests |
| --- | --- |
| operations-engine | 162 |
| performance-engine | 12 |
| operations-worker | 8 |
| **Phase 24 new** | **182** |
| Full platform suite | **2,258 / 2,258 (0 fail)** |

Coverage: lifecycle transition matrix, assignment/escalation validation + history,
workload/capacity math, alert detection, worker offline determinism + DB mode +
"never writes assignments" + broken-client resilience.

## 10. Deployment

1. `pnpm install` (picks up `@hsi/operations-engine` + `@hsi/performance-engine`).
2. Apply `supabase/migrations/0027_human_operations_os.sql`.
3. Deploy web + worker; the operations worker (`*/30 * * * *`) needs the
   service-role key to write workloads/alerts, else it runs offline (no writes).
4. Add users to teams via `team_members`; assign cases via the dashboards.

## 11. Verification

| Gate | Result |
| --- | --- |
| `tsc` web / worker / engines | ✅ 0 errors |
| `pnpm --filter web build` | ✅ 121 pages (+7 operations routes) |
| Full test suite | ✅ 2,258 / 2,258 |
| Route audit | ✅ 0 missing (79 registry + 56 sidebar) |
| Production smoke test | ✅ 0 fail (migrations 0001→0027 present) |
| RBAC / governance / intelligence / publication / security | ✅ unchanged |

## 12. Future expansion

- A unified `cases` table (or a view over investigations) so My Work and the
  operations center read true per-case lifecycle state live (today the lifecycle
  is enforced by the engine + audited; the live case set is derived from
  assignments + escalations, and My Work / Contributor Ops render a labeled
  sample until a case store is wired).
- Tester-issue board UI on top of `tester_issues` / `tester_issue_history`
  (schema shipped; workflow SUBMITTED→TRIAGED→ASSIGNED→RESOLVED→VERIFIED→CLOSED,
  no automatic closure).
- Notifications delivery for escalations/alerts (engine emits advisory payloads).
- Capacity forecasting fed by the Phase-21 forecasting infrastructure.
