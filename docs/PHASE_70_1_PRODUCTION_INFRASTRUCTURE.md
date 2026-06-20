# Phase 70.1 — Production Infrastructure, Resilience & Observability

**Status:** Complete (uncommitted) · **Type:** Additive operational hardening
**Route:** `/dashboard/infrastructure` (admin) · `/api/cron/uptime` (CRON_SECRET) · `/api/observability/report` (rate-limited)
**Migration:** `0056_infrastructure_observability.sql` (additive)

Production-ops layer for expanded beta + enterprise evaluation. **Strictly additive,
admin-facing, read-only over the systems it observes.** No ingestion / review /
publishing / collection / workflow / AI changes. All metrics computed from real
records or live probes — no fabricated counts.

---

## Deliverables (all 8)

| # | Deliverable | Implementation (reuses existing patterns) |
|---|---|---|
| 1 | **Infrastructure health** | `lib/infra/probes.ts` — reuses Phase health `probeRest/probeAuth/probeStorage` + reachability checks for notifications/agents/forecast/marketplace/transparency |
| 2 | **Backup & recovery** | `infra_backups` ledger; RPO computed (time since last good backup) vs policy target; RTO target; restore-tested flag |
| 3 | **Deployment ledger** | `infra_deployments` (version/commit/env/status/timestamp); current build read from env (`VERCEL_GIT_COMMIT_SHA`) |
| 4 | **Migration verification** | reuses Phase 23 `getMigrationAudit` — repo vs applied vs missing + drift; honest "not verifiable" labeling |
| 5 | **Operational metrics** | real counts: sources/signals/evidence/narratives/forecasts/marketplace/notifications/agents |
| 6 | **Infra audit events** | `infra_events` (backup/restore/deployment/migration/error/uptime/incident) — every admin action logs one |
| 7 | **Sentry integration layer** | `lib/infra/observability.ts` `reportError()` → records `infra_events` + Sentry-capturable `console.error` (dependency-free; auto-captured once `@sentry/nextjs` is installed). `app/global-error.tsx` beacons frontend errors to `/api/observability/report`; cron/agent failures already alert and can call `reportError` |
| 8 | **Uptime monitoring** | `lib/infra/uptime.ts` `runUptimeCheck` → `infra_uptime_checks` + `infra_incidents` (open/resolve); cron `/api/cron/uptime`; historical uptime % computed per subsystem |

---

## Architecture

```
lib/infra/
  types.ts        PURE — health state, RPO/RTO/uptime math, data shapes (+ test)
  probes.ts       8-subsystem health (reuses Phase health probes)
  persistence.ts  DAL — backups/deployments/events/uptime/incidents + operational counts
  uptime.ts       runUptimeCheck (probe → record checks → manage incidents)
  observability.ts reportError — infra_events + Sentry-capturable surface
  data.ts         getInfrastructureDashboard (admin composition)
  actions.ts      record backup/restore/deployment + run uptime (admin, audited)

app/dashboard/infrastructure/page.tsx     admin dashboard (8 panels)
app/api/cron/uptime/route.ts              scheduled uptime (service-role, CRON_SECRET)
app/api/observability/report/route.ts     frontend error sink (rate-limited)
app/global-error.tsx                      root error boundary → observability beacon
components/infra/                          panels (server) + controls (client)
supabase/migrations/0056_*.sql            5 ledger tables, RLS admin, idempotent
```

---

## Security

- **Admin-only:** all `infra_*` tables RLS = `is_admin()`; route gated admin
  (`PROTECTED_ROUTES` + nav-roles + page self-gate); all actions audited via
  `recordSecurityAudit`.
- **Service-role confined:** only the uptime cron (CRON_SECRET) + the existing
  controlled paths use it — consistent with the Phase 70 audit.
- **Public surface:** only `/api/observability/report` (rate-limited 30/min, stores
  message + short context, no sensitive data). No metrics leak; no auth bypass.

---

## Real-data guarantee

Every number derives from a real source: live probes (db/auth/storage reachability),
recorded ledger rows (backups/deployments), `schema_migrations` (migration audit),
`infra_uptime_checks` (uptime %), and head-count queries (operational metrics).
Where there is no data yet (no backups recorded, no uptime checks), the dashboard
shows "—" / "not recorded" — never a fabricated value. RPO/RTO **targets** are
clearly labeled as policy; the RPO **actual** is computed from the last backup.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Infra + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2764 / 2764** pass, 0 fail |
| `next build` (clean `.next`) | ✅ compiled successfully; `/dashboard/infrastructure` + `/api/cron/uptime` + `/api/observability/report` → `ƒ` |
| Migration idempotency | ✅ re-runnable (if-not-exists + DO-block RLS) |
| No workflow changes / no AI / no fabricated metrics | ✅ additive observability only |

> Migrations `0048`–`0056` must be applied; register the `/api/cron/uptime` cron
> (alongside source-capture / source-monitoring / agents) for automatic uptime
> history. Sentry is optional — install `@sentry/nextjs` + set `SENTRY_DSN` and the
> `reportError` console/error surfaces are captured automatically.

---

## Operational integration

This layer makes HSI 1.0 enterprise-evaluable: a single admin board shows whether
every subsystem (db/auth/storage/notifications/agents/forecast/marketplace/
transparency) is healthy, the backup/recovery posture (RPO/RTO), the deployment
history, migration drift, live operational volumes, uptime %, and open incidents —
plus a captured error stream ready to forward to Sentry. It complements (does not
replace) the Phase 56/59/70 security + readiness audits.
