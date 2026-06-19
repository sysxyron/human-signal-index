# Phase 66 — Agent Automation Layer

**Status:** Complete (uncommitted)
**Routes:** `/dashboard/agents` + `/dashboard/agents/[id]` (reviewer+; admins run/schedule) · `/api/cron/agents` (CRON_SECRET, service-role)
**Migration:** `0053_agent_automation.sql` (additive)

Operational **agents** that automate intelligence workflows with **deterministic
rules** over the existing Phase 61–65 services. Agents **do not publish, review
evidence, moderate, override humans, or score truth** — they observe, analyze, and
produce explainable findings + alerts. Every agent action is **observable,
auditable, reproducible, deterministic, and human-reviewable**. No hidden
reasoning, no dynamic code execution.

---

## Architecture

```
lib/agents/
  types.ts       PURE — vocabulary, canonical Finding model, scheduling math
  registry.ts    PURE — the 8 agents registered centrally (no dynamic code)
  handlers.ts    deterministic handler per agent — REUSES Phase 61–65 layers
  persistence.ts DAL — runs/actions/results/alerts/metrics/schedules
  engine.ts      runAgent() — execute → record run/actions/findings/alerts/metrics
  scheduler.ts   runDueAgents() — runs agents whose cadence is due
  service.ts     RBAC API (reviewer+ reads, admin mutations)
  data.ts        getAgentsDashboard()
  actions.ts     run / retry / schedule / cancel (admin, audited)

app/dashboard/agents/page.tsx + [id]/page.tsx     reviewer+ dashboard + detail
app/api/cron/agents/route.ts                       scheduled runner (service-role)
components/agents/                                  panels (server) + controls (client)
supabase/migrations/0053_agent_automation.sql      8 tables, seeded registry, RLS
```

Each handler **reuses** an existing layer — no duplicated logic: Phase 61
`getSourceReliability`, Phase 63 monitoring state, Phase 64 `getCountsDal`/
`topConnectedDal`, Phase 65 narrative DALs, plus submission/review/publication
reads. Alerts flow through **Phase 62**; failures surface as failed runs +
`AGENT_FAILURE` alerts (visible to monitoring).

---

## Agent registry (Deliverable 3)

Eight agents, registered centrally in `registry.ts` and seeded into `agents` by the
migration (stable text `agent_key`; no dynamic code):

| Agent | Consumes | Responsibility (read + report only) |
|---|---|---|
| `SOURCE_HEALTH_AGENT` | 61, 63 | failures / stale / gaps / reliability drops |
| `NARRATIVE_WATCH_AGENT` | 65 | growth / decline / fragmentation / contradiction |
| `GRAPH_ANALYST_AGENT` | 64 | isolated nodes / concentration / hubs |
| `REVIEW_QUEUE_AGENT` | submissions+reviews | bottlenecks / aging / backlog (no assignments) |
| `PUBLICATION_MONITOR_AGENT` | publications | velocity / correction trends + clusters |
| `TRUST_ANOMALY_AGENT` | 64, 65 | concentration / rapid shifts / evidence anomalies (flag only) |
| `EXECUTIVE_BRIEF_AGENT` | 61, 64, 65 | explainable daily/weekly summary |
| `FORECAST_PREP_AGENT` | 61–65 | forecast-readiness indicators (no forecasting) |

---

## Execution model (Deliverable 4)

`runAgent(writer, agentKey, trigger, actorId)`:
1. resolve the registry definition → its **fixed** handler (no dynamic dispatch).
2. create an `agent_runs` row (`running`).
3. run the handler → `{ findings, actions }`; persist the **action log**
   (`agent_actions`) and the **findings** (`agent_results`).
4. for each WARNING/CRITICAL finding (capped at 10): write an `agent_alerts` row
   and notify admins via Phase 62 (`SYSTEM_ALERT`, honoring preferences); link the
   notification back.
5. finish the run (`succeeded`, duration, counts); update the schedule
   (`last_run_at` + `next_run_at`) and roll up `agent_metrics`.
6. **on error:** the run is recorded `failed` + an `AGENT_FAILURE` alert is raised
   and admins notified — failures are captured, never swallowed.

Triggers: `manual` (admin button), `scheduled` (cron), `retry`. Writes prefer the
service-role client (admin alert fan-out). Everything is audited.

---

## Scheduling (Deliverable 15)

Cadences: `manual · hourly · daily · weekly · disabled` (manual/disabled never
auto-run). Pure math in `types.ts` (`cadenceMs`, `nextRunAt`, `isDue`). The
existing cron pattern (`/api/cron/agents`, CRON_SECRET-guarded, service-role) calls
`runDueAgents()` — no external scheduler changes. Admins change cadence inline.

---

## Findings model (Deliverable 16)

Canonical, traceable output — `{ finding, severity, category, evidence, source }` —
persisted per run in `agent_results` with `agent_key` + `created_at`. Severity uses
the Phase 62 scale (`INFO/NOTICE/WARNING/CRITICAL`). Every finding names its
`source` (the entity/layer it came from) and carries structured `evidence`.

## Alert model (Deliverable 17)

`AGENT_ALERT` (critical findings) · `AGENT_FAILURE` (run failed) · `AGENT_FINDING`
· `AGENT_WARNING` (warning findings) · `AGENT_RECOMMENDATION` (e.g. reviewer
imbalance). Persisted in `agent_alerts` and delivered internally via Phase 62
(no email yet); the notification id is linked to the alert.

---

## RBAC & safety

Reviewer+ read (`is_reviewer_or_above`), admin manage (`is_admin`) — enforced by
RLS on all 8 tables, the middleware route gate (`/dashboard/agents` reviewer),
nav-roles visibility, and page self-gates. **No autonomous publishing, review
decisions, moderation, or truth scoring** — agents only read existing systems and
write to their own tables + notifications.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Agent + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2739 / 2739** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; `/dashboard/agents` + `/[id]` + `/api/cron/agents` → `ƒ` |
| Migration idempotency | ✅ re-runnable (DO-block RLS + seed on-conflict-do-nothing) |
| No regressions / no autonomous publish/review/moderation | ✅ read + report only |

> Migrations `0048`–`0053` must be applied to Supabase; the registry self-seeds via
> the migration. Register the Vercel cron for automatic scheduled runs; the admin
> "Run now" works immediately.

---

## Phase 67 readiness (Forecast Validation Engine)

- The `FORECAST_PREP_AGENT` already computes readiness indicators (source
  stability, graph completeness, narrative stability, data completeness, coverage
  risk) — Phase 67's direct inputs, produced deterministically with no forecasting.
- `runAgent` / `runDueAgents` are clean tool entry points a forecast-validation
  loop can call; agent findings + alerts are structured, traceable inputs.
- The findings/alerts/metrics substrate generalizes: a `FORECAST_VALIDATION_AGENT`
  slots into the same registry + engine with no schema change.

---

## Known limitations

- **Read + report only by design** — agents never mutate the systems they observe.
- **Handlers use bounded reads + documented thresholds** (e.g. backlog ≥25, growth
  ±50%); findings are deterministic, not ML-scored.
- **`agent_jobs`** backs cancel/queue semantics; the current scheduler runs due
  agents inline (no distributed queue) — sufficient for the cron cadence.
- **ACTOR/EVENT/ORGANIZATION-dependent findings** appear once those graph nodes are
  populated (Phase 64 reserves them); agents compute to neutral until then.
- **Email delivery** is deferred (Phase 62 internal notifications only).
