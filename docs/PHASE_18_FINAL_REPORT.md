# Phase 18 — Autonomous Research Orchestration & Intelligence Operations Center

**Final Report**

HSI is no longer a collection of intelligence engines — it is a **continuously
operating intelligence system**. Phase 18 adds an Operations Center that
discovers research opportunities, schedules investigations, coordinates agents,
drives runs through a 16-stage pipeline, tracks execution state, escalates
unresolved issues, monitors platform health, and routes everything through
governance.

It is **not AGI**. It coordinates the Phase 1–17 engines. Every output remains
**explainable, auditable, human-governed, deterministic, offline-safe, and
backward-compatible** — nothing is auto-published or auto-acted.

---

## 1. Architecture

Two new pure engines, a governance-driven data layer, six dashboards, a
continuous worker loop, and one additive migration — layered exactly like every
prior phase: **pure deterministic engine → server-only DAL → server actions →
server components → client controls**.

```
packages/intelligence-queue/      (NEW)  pure durable priority queue
packages/research-orchestrator/   (NEW)  state machine · agents · discovery ·
                                          escalation · templates · health
        │   (deterministic — `now` injected, no Date.now/Math.random; offline-safe)
        ▼
apps/web/lib/orchestration/persistence.ts  (DAL, server-only, RLS-scoped, DbResult)
apps/web/lib/orchestration/view.ts         (client-safe decorators + demo builders)
apps/web/lib/orchestration/actions.ts      ('use server' wrappers + revalidation)
        │
        ├── app/dashboard/intelligence/operations        (8-widget command center)
        ├── app/dashboard/intelligence/runs + runs/[id]   (list + full replay)
        ├── app/dashboard/intelligence/health             (10 engines + agents)
        ├── app/dashboard/intelligence/opportunities      (proposals → human triage)
        ├── app/dashboard/intelligence/escalations        (issues → human resolve)
        └── dashboard/operations  (OperationsHighlightCards — cross-surface entry)
        │
apps/worker/jobs/research-orchestrator.ts  (15-min continuous loop; registered)
supabase/migrations/0022_research_orchestration.sql  (8 tables, RLS, triggers, indexes)
packages/shared-types/src/index.ts  (Phase-18 records + view-models + unions)
```

---

## 2. Core capabilities delivered

| # | Capability | Where |
|---|-----------|-------|
| 1 | **Research Operations Center** — operations / runs / runs/[id] routes with run id, status, priority, agents, evidence, confidence, trust, outcome | `app/dashboard/intelligence/*` |
| 2 | **Research Run State Machine** — 18 states; `advanceResearchRun` / `transitionResearchRun` / `validateResearchTransition`; every transition audited, no silent failures | `research-orchestrator/states.ts` |
| 3 | **Agent Coordination** — `assignAgents` / `rebalanceWork` / `retryFailedTasks` / `escalateBlockedTasks`; 8 agents; runtime/health/failure/completion tracking | `research-orchestrator/agents.ts` |
| 4 | **Research Queue** — `enqueue/dequeue/retry/cancel/prioritizeResearch`; CRITICAL→LOW; survives restarts (pure over a persisted snapshot) | `packages/intelligence-queue` |
| 5 | **Automated Research Discovery** — `discoverResearchOpportunities` → `ResearchOpportunity` (proposal only) from signals/evidence/alerts/trust drift/outcome failures/narrative spikes | `research-orchestrator/discovery.ts` |
| 6 | **Escalation Engine** — `escalateResearchIssue` → `EscalationRecord` (INFO/WARNING/HIGH/CRITICAL); persisted; shown in the center | `research-orchestrator/escalation.ts` |
| 7 | **Platform Health Monitoring** — `computeEngineHealth` / `platformHealth`; 10 engines HEALTHY/DEGRADED/DOWN with last run, success/failure rate, queue depth | `research-orchestrator/health.ts` + `/health` route |
| 8 | **Workflow Templates** — 7 `ResearchWorkflowTemplate`s (stages, required agents, required evidence, governance flag) | `research-orchestrator/templates.ts` |
| 9 | **Operations Dashboard** — SystemHealth, ActiveRuns, ResearchQueue, Escalation, TrustStatus, GovernanceBacklog, AgentPerformance, RecentFailures panels | `components/intelligence/panels.tsx` |
| 10 | **Research Replay** — full audited timeline of a run's intelligence process + agents + tasks + progress | `runs/[id]` + `RunReplayTimeline` |
| 11 | **Worker Orchestration** — queue poll → assign → advance → fail-handle → escalate; fault-isolated, deterministic, retry-safe, offline-safe | `apps/worker/jobs/research-orchestrator.ts` |
| 12 | **Migration 0022** — 8 tables, indexes, FKs, RLS, `updated_at` triggers, audit support | `supabase/migrations/0022_*.sql` |

---

## 3. Orchestration engine

**State machine** — 18 states. The non-terminal 16 form the pipeline
`CREATED → QUEUED → DISCOVERING → COLLECTING → ANALYZING → REASONING → EVIDENCING →
TEMPORAL → CAUSAL → COUNTERFACTUAL → DECISION → OUTCOME → CALIBRATION → TRUST →
GOVERNANCE → COMPLETE`, one stage per Phase 1–17 engine. `FAILED` / `ESCALATED`
are off-ramps; FAILED may retry (→ QUEUED) or escalate; ESCALATED may resume,
route to GOVERNANCE, or fail; COMPLETE is terminal. `validateResearchTransition`
gates every move; `transitionResearchRun` appends an audited `ResearchRunEvent`
(from→to/actor/reason) and **never silently no-ops** — an invalid transition
returns `ok:false` with a reason.

---

## 4. Queue system

A **pure** priority queue (`@hsi/intelligence-queue`): every op takes a queue
snapshot and returns a new snapshot, so the queue **survives restarts by being
persisted, not by holding memory** (proven by `restart.test.ts` — JSON round-trip
preserves all state + ordering). Deterministic ordering: priority (CRITICAL→LOW)
→ availableAt → enqueuedAt → id. Failures retry with **exponential backoff**
(1m/5m/15m/…capped 1h) up to `maxAttempts`, then become terminal. `cancel`/`fail`
are explicit — **work is never dropped silently**.

---

## 5. Agent coordination

Eight agents (research, evidence, temporal, causal, counterfactual, decision,
outcome, trust) mapped to pipeline stages (`STAGE_AGENT`). `assignAgents` is
idempotent per run-stage; `rebalanceWork` returns blocked tasks to pending;
`retryFailedTasks` resets retryable failures; `escalateBlockedTasks` surfaces
blocked + budget-exhausted tasks for the escalation engine. `agentHealth` rolls
up per-agent HEALTHY/DEGRADED/DOWN from completion/failure/runtime — **the
coordinator escalates, it never force-acts**.

---

## 6. Health monitoring

`platformHealth` rolls up the **ten** engines. Documented thresholds:
DOWN at failureRate ≥ 0.5 (≥2 runs) or queueDepth ≥ 100; DEGRADED at failureRate
≥ 0.2 or queueDepth ≥ 25; idle (zero runs, empty queue) is HEALTHY. The DAL maps
runs → research engine, agent tasks → their engines, trust tasks → calibration,
GOVERNANCE-state runs + backlog escalations → governance — an explainable
mapping, with missing engines defaulting to idle HEALTHY so the dashboard always
shows the full set.

---

## 7. Escalation system

`escalateResearchIssue` turns six triggers (repeated failures, trust collapse,
calibration drift, missing evidence, governance backlog, queue blockage) into an
`EscalationRecord` with a default-but-overridable severity, the evidence, and an
advisory recommendation. Status starts `open` and is **never auto-resolved** — a
curator acknowledges or resolves it with a logged note. The worker raises
`repeated_failures` (budget-exhausted runs) and `queue_blockage` (deep queue, no
ready items) automatically.

---

## 8. Research replay

`/dashboard/intelligence/runs/[id]` reconstructs a run's **entire intelligence
process**: the append-only `hsin_research_run_events` timeline (every from→to
transition with actor + reason), the agents involved (tasks + runtime + state),
escalations, and pipeline progress. *Nothing hidden* — this answers "how did this
conclusion emerge?" and "can I replay the whole process?".

---

## 9. Governance integration

- **Opportunities are proposals.** Discovery proposes; a curator `accepts`
  (spawning a run) or `rejects` — never auto-published.
- **Escalations need humans.** Open until a curator acknowledges/resolves (a
  resolution note is required to resolve).
- **Run transitions are gated + audited.** The DAL re-checks curator role,
  validates via the engine, refuses invalid moves, and writes `audit_logs`.
- **The worker never auto-decides.** Runs reaching `TRUST` / `GOVERNANCE` are
  **left for humans**; the worker logs `autoActed:false`, `autoPublished:false`.
- All Phase 17 trust/calibration overrides remain human-approved + reversible.

---

## 10. Migration 0022

`supabase/migrations/0022_research_orchestration.sql` (ADD-ONLY). Eight tables:
`hsin_research_runs`, `hsin_research_run_events` (append-only), `hsin_research_tasks`,
`hsin_research_queue` (durable), `hsin_research_opportunities`,
`hsin_research_escalations`, `hsin_agent_assignments` (append-only),
`hsin_workflow_templates`. CHECK-guarded enums + ranges; FKs to
`hsin_research_runs(id)` and `public.users(id) on delete set null`; the shared
`set_updated_at()` trigger on the six mutable tables; RLS via a `DO`-block applying
the canonical shape to all eight (**researcher+ read, curator/admin write, admin
all**). No prior migration is edited.

---

## 11. Testing

- **`@hsi/intelligence-queue`** — 38 tests (queue ops, fixtures, restart-survival
  round-trips).
- **`@hsi/research-orchestrator`** — 99 tests (state machine, agents, discovery,
  escalation, templates, health, fixtures, end-to-end integration).
- **`research-orchestrator` worker** — 9 tests (offline determinism, advance +
  assign, human gates, priority order, fault isolation) via an in-memory fake.
- **orchestration view helpers** — 26 tests (decorators, formatters, demo builders).
- **Phase 18 net-new: ~168 tests.**

**Full suite: `1251 tests, 1251 pass, 0 fail`.** No Phase 1–17 regressions.

---

## 12. Build & typecheck status

| Gate | Result |
|------|--------|
| `apps/web` `tsc --noEmit` | **0 errors** |
| `apps/worker` `tsc --noEmit` | **0 errors** |
| `packages/intelligence-queue` `tsc` | **0 errors** |
| `packages/research-orchestrator` `tsc` | **0 errors** |
| `next build` | **✓ Compiled successfully** — all 6 intelligence routes emitted (ƒ) |
| Full test suite | **1251 / 1251 pass** |

> Repo-level `next lint` still fails on the pre-existing ESLint-version
> incompatibility (unrelated to Phase 18); type-checking and the build are clean.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Worker re-arms in-progress runs each poll (no per-run lock) | the run state machine is idempotent-validated — a double advance is refused; a per-run advisory lock is a Phase-19 hardening |
| Health mapping is heuristic (engines inferred from runs/tasks) | every status carries an explainable `detail` string; mapping is documented and falls back to idle HEALTHY |
| `entity_id` / opportunity links are polymorphic text (no FK) | matches the Phase 16–17 model; integrity via CHECK on `source`/`trigger` + `(entity_type,…)` indexes |
| Discovery + queue can grow unbounded | proposals are cheap + human-triaged; reads are capped; retention/rollup recommended for Phase 19 |
| Workflow templates are code-defined, DB-seeded | `seedWorkflowTemplates` upserts idempotently by `template_key`; curators may edit the rows |

---

## 14. Deployment steps

1. **Migrate.** Apply `0022_research_orchestration.sql` (additive; safe after
   0001–0021). Verify the 8 tables + RLS + triggers.
2. **Install.** `pnpm install` (links the two new workspace packages — already in
   `apps/web` + `apps/worker` deps and `tsconfig.base.json` paths).
3. **Seed templates.** Call `seedWorkflowTemplatesAction` (curator) once.
4. **Build.** `pnpm build` (web + worker). Both green.
5. **Test.** `npx tsx --test $(find packages apps -name '*.test.ts' …)` → 1251 pass.
6. **Worker.** Deploy the updated worker; `researchOrchestratorJob` runs every
   15 min under the service-role key (safe offline no-op without it).
7. **Verify.** `/dashboard/intelligence/{operations,runs,health,opportunities,escalations}`
   render (live or labeled demo). Confirm a curator can start a run, accept an
   opportunity, and resolve an escalation, and replay a run end-to-end.

---

## 15. Recommended Phase 19 — Autonomous Intelligence Synthesis & Continuous Publication

- **Per-run locking + parallel orchestration** — advisory locks so multiple
  worker instances can drain the queue concurrently without double-advancing.
- **Closed-loop discovery → run → publication** — when a governed run reaches
  COMPLETE, draft a trust-aware intelligence report (Phase 17 publication) for
  human sign-off.
- **Cross-run synthesis** — detect when several runs converge on the same
  conclusion and synthesise a meta-finding with combined provenance.
- **Adaptive scheduling** — prioritise discovery by historical hit-rate; back off
  sources that repeatedly yield rejected opportunities.
- **SLA + capacity planning** — track time-in-state per stage, surface bottleneck
  agents, and forecast queue drain time.
- **Operator runbooks** — one-click remediations attached to each escalation
  trigger (still human-confirmed).
```
