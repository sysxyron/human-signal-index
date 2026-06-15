# Phase 33 — HSI 1.0 Launch Readiness & Production Hardening

**Status:** ✅ Complete · web + engine typecheck 0 errors · build green (177
routes, +1) · **2,492 tests passing (0 fail, +10)** · route audit green (102
registered / 78 sidebar) · smoke green (migrations 0001→0037) ·
**no auth / RBAC / middleware / user_roles changes; readiness DAL is admin-only.**

This is the HSI 1.0 release-candidate phase — it adds no business features; it
hardens, validates, audits, monitors, and certifies the platform.

---

## 1. Architecture
```
ENGINE (@hsi/launch-readiness, PURE)     DAL (lib/admin/system-health.ts, admin-only)
workerHealth · queueHealth               getSystemHealth (workers/queue/metrics/
integrityReport · computeKpis              KPIs/integrity/checklist/config)
buildReadinessReport · evaluateChecklist exportAudit (CSV/JSON)
auditConfig · exportAudit (CSV/JSON)            │
        │                                       ▼
        ▼                            /dashboard/admin/system-health
   aggregates existing audits (route-audit · rbac-audit · migration-audit ·
   lineage validation · graph_health) + ops tables (0037)
```

## 2. Monitoring & ops storage (Deliverables 5, 6, 10, 11, 13, 25)
`supabase/migrations/0037_hsi_launch_readiness.sql` (add-only, **admin-only RLS**):
`system_failures` (append-only), `incident_log`, `backup_runs`, `recovery_tests`,
`rate_limits` (seeded registry). No business features; observability only.

## 3. Health, metrics, KPIs (Deliverables 2, 3, 4, 7, 8, 9)
`/dashboard/admin/system-health` shows: **overall status**; **worker health**
(contributor / trust / lineage — derived from each output table's `computed_at` +
recent `system_failures`); **queue** (pending/running/failed/completed +
failure-rate); **platform metrics** (users/signals/investigations/publications/
contributors); **operational KPIs** (acceptance, review accuracy, governance
effectiveness, publication throughput/wk). Worker thresholds: down if never-ran or
>3× overdue, degraded if overdue/failing, else healthy.

## 4. Audits (Deliverables 1, 19, 20, 21, 22)
- **Launch readiness audit (D1)** — `buildReadinessReport` over per-subsystem checks
  (RBAC, CMS, investigations, publishing, trust, lineage, beta).
- **Data integrity (D19)** — `integrityReport`: orphans (warning), broken lineage /
  invalid attribution / invalid trust links (critical), sourced from the latest
  `graph_health` snapshot.
- **Navigation audit (D20)** — the existing `route-audit.ts` (102 registered / 78
  sidebar routes resolve) — green.
- **Permission audit (D21)** — the existing `rbac-audit.ts` `PROTECTED_ROUTES`
  remain intact; `route-gate.test.ts` proves restricted routes stay gated.
- **Role matrix (D22)** — `docs/ROLE_NAVIGATION_MATRIX.md` (Phase 24D) + the
  `nav-roles` source of truth.

## 5. Backups / recovery / retention / rate limits / security (Deliverables 10–14)
`backup_runs` + `recovery_tests` registries; `rate_limits` documented + seeded;
retention is documented (append-only audit/event/history tables are the system of
record); security monitoring reuses the existing `security_audit_events` +
`/dashboard/admin/access-logs` + `/dashboard/security-monitor`.

## 6. Audit export + config audit (Deliverables 15, 18)
`exportAudit` serialises any audit table to **CSV or JSON** with proper escaping
and **spreadsheet formula-injection neutralisation**. `auditConfig` checks required
env/secrets/flags (Supabase URL/anon/service-role/app-url) + optional (Sentry).

## 7. Release checklist + reports (Deliverables 16, 17, 23, 24, 28)
`RELEASE_CHECKLIST` (11 items across build/quality/data/security/ops/docs) rendered
live on the health page. Operational report windows (daily/weekly/monthly) via the
engine. **`docs/HSI_1_0_CERTIFICATION.md`** (D28) + this report (D24) are the
launch documentation hub.

## 8. Files

**Created**
- `packages/launch-readiness/` (package.json, tsconfig; `src/`: types, health,
  integrity, audit, export, fixtures, index; `tests/`: readiness — 10 tests)
- `apps/web/lib/admin/system-health.ts`
- `apps/web/app/dashboard/admin/system-health/page.tsx`
- `supabase/migrations/0037_hsi_launch_readiness.sql`
- `docs/PHASE_33_HSI_LAUNCH_READINESS_REPORT.md`, `docs/HSI_1_0_CERTIFICATION.md`

**Modified**
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` — System Health nav
- `apps/web/lib/launch/migration-audit.ts` (+0037) + `migration-audit.test.ts`
- `tsconfig.base.json`, `apps/web/package.json` — new package

## 9. Verification

| Item | Result |
| --- | --- |
| Migration | `0037_hsi_launch_readiness.sql` |
| Tests added | 10 (launch-readiness engine) |
| Full test suite | ✅ **2,492 / 2,492**, 0 fail |
| Web / engine typecheck | ✅ 0 errors each |
| Build | ✅ compiled (177 routes) |
| Route audit | ✅ 102 registered / 78 sidebar resolve |
| Migration audit / smoke | ✅ 0001→0037, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 10. Security review (Deliverable 27)
- **No auth / RBAC / middleware / user_roles changes** (verified: no diff to
  `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **No role escalation** — observability only.
- **No service-role exposure** — the readiness DAL uses the RLS user client +
  `requireAdmin`; all 0037 tables are admin-only RLS; `system-health.ts` is
  `'use server'`, imported only by the admin server page.

## 11. Remaining gaps / post-launch
- **Worker heartbeat** is derived from output-table `computed_at`; a dedicated
  `worker_runs` heartbeat table would make health exact (vs proxy).
- **Queue counts** default to 0 unless a queue table is present; wire the
  intelligence-queue counts for live backlog.
- **Backups/recovery** are registry tables; the actual backup/restore jobs are an
  infra concern (Supabase PITR) recorded here.
- A dedicated **documentation-hub page** could surface `docs/*` in-app; the docs
  directory + certification serve that today.
