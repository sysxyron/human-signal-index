# Phase 22 — Executive Command Center & Strategic Intelligence OS

**Status:** ✅ Complete — build green, typecheck green, 2,033 tests passing (0 failures), no regressions through Phases 1–21.

**Date:** 2026-06-12 · **Branch:** `feat/phase15-outcome-intelligence`

> This is the **final integration phase**. It creates **no new intelligence** — it creates the **command layer** that operates all the intelligence built in Phases 1–21. Human governance remains mandatory: `autoPublish` / `autoApprove` / `autoAct` / `autoGovern` = **false**. This completes the Human Signal Index Intelligence OS roadmap.

---

## 1. Architecture

Phase 22 unifies every prior subsystem behind one command layer that answers the executive questions: *what is happening now, what matters most, what needs attention, and what risks / opportunities / investigations / consensus / forecasts / governance items exist.*

```
            Phases 1–21 subsystems (research, evidence, decisions, outcomes,
            trust, forecasts, scenarios, consensus, publishing, operations, …)
                                   │
                                   ▼  (DAL / worker read across all tables)
                        ┌──────────────────────┐
                        │  UnifiedInputs        │  normalised, clamped
                        └──────────┬───────────┘
                                   ▼
                    buildUnifiedSystemState(now)        ← pure, deterministic
                                   │
        ┌──────────────┬──────────┼───────────┬──────────────┐
        ▼              ▼          ▼           ▼              ▼
  rankStrategic   computeOper-  compute-   buildExecutive  build*Brief /
  Priorities      ationalRisk   Strategic   Snapshot        DailyIntelligence
        │          Opportunity   Attention      │            Report
        ▼              ▼          ▼              ▼              ▼
            ExecutiveSnapshot + Briefs + Daily Report (all ADVISORY)
                                   │
                                   ▼
                      Human governance (queue → decide)
                  reviewer + reason required · reversible · audited
```

- **Engine:** `packages/executive-intelligence/` — a single self-contained **pure** package (no `@hsi/*` deps). It operates on a normalised `UnifiedSystemState`, so it has no knowledge of any subsystem's storage. `now` is injected; **no** `Date.now()` / `Math.random()`; fully offline; fully tested.
- **Web DAL:** `apps/web/lib/executive/{persistence,view,actions}.ts` — reads across every subsystem table to assemble `UnifiedInputs`, runs the engine live, and persists governed snapshots / reviews / decisions. `NEVER throws`; empty env → `NOT_CONFIGURED` → labeled demo.
- **Worker:** `apps/worker/jobs/executive-worker.ts` — the hourly command loop; service-role, fault-isolated, retry-safe, offline-safe.

---

## 2. Executive Intelligence Engine

`packages/executive-intelligence/src/`

| Module | Responsibility |
| --- | --- |
| `types.ts` | The whole type surface: `UnifiedSystemState` (+ 11 sub-types), `UnifiedInputs`, `PriorityInput`, `StrategicPriority`, `OperationalRisk`, `StrategicOpportunity`, `ExecutiveAttention`, `ExecutiveSnapshot`, `ExecutiveBrief`, `DailyIntelligenceReport`, the governance types. |
| `unified.ts` | `buildUnifiedSystemState()` normalises + clamps every subsystem list into one model; `summarizeSystemState()` → headline counts + a one-paragraph summary. |
| `priority.ts` | The **Strategic Priority Engine**: `computeUrgency/Impact/ConfidenceWeight/EvidenceWeight`, `categoryModifier`, `computePriorityScore` (0–100), `attentionForScore`, `buildPriorityExplanation`, `rankPriority`. Weights: urgency 0.30 · impact 0.35 · confidence 0.20 · evidence 0.15. |
| `analysis.ts` | `computeOperationalRisk` (warnings, failing forecasts, disputed consensus, low/degrading trust, open escalations), `computeStrategicOpportunity` (research opportunities, reliable forecasts, strong undisputed consensus), `computeExecutiveAttention` (0–100 index). |
| `snapshot.ts` | `rankStrategicPriorities` (derives priority inputs from **every** part of state), `buildExecutiveSnapshot`, `buildDailyIntelligenceReport`, `generateExecutiveReport`. |
| `briefing.ts` | The **Briefing Engine**: `generateDaily/Weekly/Critical/Governance/Forecast/OperationsBrief` + `buildExecutiveBrief` dispatch. Every section carries source references; every brief carries limitations. |
| `governance.ts` | `queueExecutiveReview`, `approve/reject/archiveExecutiveDecision` — reviewer + reason required (throws `ExecutiveGovernanceError` otherwise), append-only audit trail, `reversible: true`, previous status preserved. |
| `fixtures.ts` | `FIXTURE_NOW`, `DEMO_INPUTS` (spans every subsystem), `executiveDemo()` runs the full chain offline & deterministically. |

**Determinism:** every function takes `{ now }`; identical inputs → byte-identical outputs (asserted in tests).

---

## 3. Strategic Priority Engine

`computePriorityScore` blends four base factors (urgency, impact, confidence, evidence) with a **category modifier** (0–0.4) that raises priority for risk magnitude, opportunity magnitude, low trust, contested consensus, and pending governance. The score maps to an attention level:

| Score | Attention |
| --- | --- |
| ≥ 75 | `urgent` |
| ≥ 55 | `elevated` |
| ≥ 40 | `notable` |
| else | `routine` |

`rankPriority` returns priorities sorted high→low with sequential ranks, each carrying its **explanation** (the numbers + reasoning), **recommendation** (kind-specific), and **limitations** (always including the advisory caveat). Missing signals default to a neutral 0.5 and add an explicit limitation.

---

## 4. Briefing Engine

Six brief kinds, each explainable and evidence-linked:

- **daily** — top risks, opportunities, investigations, consensus changes, forecast shifts, governance pending, open alerts.
- **weekly** — the daily rollup reframed for the week.
- **critical** — only CRITICAL/HIGH warnings, risks, and governance.
- **governance** — the full governance queue + a by-source breakdown.
- **forecast** — active + failing forecasts + emerging scenarios.
- **operations** — platform health, publishing, outcomes.

`buildExecutiveBrief(kind, …)` dispatches; `buildDailyIntelligenceReport` wraps the snapshot + daily brief + top-5 risks/opportunities. **Never auto-sent, never auto-published.**

---

## 5. Migration 0026

`supabase/migrations/0026_executive_command_center.sql` — **ADD-ONLY** (does not edit 0001–0025). Six tables:

| Table | Purpose |
| --- | --- |
| `hsin_executive_snapshots` | attention index + level + counts + executive summary + full snapshot jsonb |
| `hsin_executive_priorities` | ranked priorities (score/rank/kind + attention + recommendation + explanation) |
| `hsin_executive_briefs` | generated briefs (daily/weekly/critical/governance/forecast/operations) |
| `hsin_executive_reviews` | the executive review queue |
| `hsin_executive_reports` | the daily intelligence report jsonb |
| `hsin_executive_decisions` | **human** decisions (reviewer + reason **NOT NULL**, reversible, append-only audit trail) |

CHECK-guarded enums, FKs, indexes, the shared `set_updated_at()` trigger on all six (mutable) tables, RLS via a DO-block: **researcher+ READ; curator/admin WRITE; admin all**. The service-role worker bypasses RLS. Conventions match 0001–0025 exactly.

---

## 6. Dashboard

`apps/web/app/dashboard/` — six routes, all Server Components, `force-dynamic`, researcher+ gated, offline → labeled demo:

| Route | Surface |
| --- | --- |
| `/executive` | `ExecutiveSnapshot` + `DailyIntelligenceCard` + `ExecutivePanels` (forecast/consensus/operations) + top priorities |
| `/priorities` | `PriorityBoard` + per-priority `QueueReviewControl` (curator+) |
| `/risks` | `RiskMatrix` (grouped by severity) |
| `/opportunities` | `OpportunityBoard` |
| `/briefings` | `ExecutiveBriefViewer` list + `PersistBriefButton` (curator+) |
| `/exec-governance` | `GovernanceQueue` (queue + decision log + `DecideReviewControl`) |

> Note: `/dashboard/governance` is owned by Phase 15, so the executive governance route is `/dashboard/exec-governance` to avoid a collision.

Components live in `apps/web/components/executive/`: `ExecutiveNav`, `ExecutiveSnapshot`, `PriorityBoard`, `RiskMatrix`, `OpportunityBoard`, `panels` (`ForecastPanel`/`ConsensusPanel`/`OperationsPanel`/`ExecutivePanels`), `ExecutiveBriefViewer`, `DailyIntelligenceCard`, `GovernanceQueue`, `controls`, `briefControls`, `badges`, `ExecutiveHighlightCards`. Theme tokens only (`text-verified`/`text-risk`/`text-warning`/`text-electric`/`text-accent`).

---

## 7. Worker

`apps/worker/jobs/executive-worker.ts` — `executiveWorkerJob`, cron **`0 * * * *`** (every 60 min, on the hour), registered in `apps/worker/jobs/index.ts`.

1. **ASSEMBLE** — `assembleUnifiedInputs()` reads across the subsystem tables (each read best-effort → `[]` on any error).
2. **BUILD** — unified state → snapshot + priorities + daily report + governance brief.
3. **PERSIST** — writes the snapshot, up to 50 priorities, the daily + governance briefs, and the daily report.

Fault-isolated (every step wrapped — logs + continues, **never throws**), retry-safe, deterministic (`now = ctx.runAt`), **offline-safe** (no service-role env → runs `executiveDemo()` fixtures, logs, **no writes**). Declares `autoPublish/autoApprove/autoAct/autoGovern = false`.

**Operations Center integration:** an additive `ExecutiveHighlightCards` strip (attention index, top priorities, open risks, open opportunities, governance pending, daily-brief status) was added to `/dashboard/intelligence/operations` — defensive, demo-aware, alongside the Phase 17/18/20/21 strips. No existing markup changed.

---

## 8. Governance

Every executive output is **advisory**. The only state-changing operations are governance:

- `queueExecutiveReview(priority)` → a `queued` review item (severity derived from attention level).
- `approve / reject / archiveExecutiveDecision(review, { reviewer, reason }, { now })` → throws `ExecutiveGovernanceError` if reviewer **or** reason is blank; otherwise records the decision with an **append-only audit trail**, preserves the previous status, and sets `reversible: true`.

The DAL gates writes at **curator+** and records an `audit_logs` entry per action. The migration makes `reviewer` and `reason` **NOT NULL** at the database layer. There is **no** code path that approves, publishes, acts, or governs without a named human and a reason.

---

## 9. Testing

- **Engine:** 195 tests across `priority`, `unified`, `analysis`, `snapshot`, `briefing`, `governance`, `fixtures`, `integration`, `matrix`, `governance-deep` — score monotonicity, ranking, risk/opportunity derivation, attention index, brief well-formedness over rich + empty states, governance invariants over every decision × priority kind, determinism, offline safety.
- **Worker:** 11 tests — offline determinism, DB persistence, priority ranking from subsystem rows, brief + report persistence, *no* decision/review auto-writes, broken-client resilience, hourly schedule + no-auto-action declaration.
- **Total new:** **206** (195 engine + 11 worker).
- **Suite total:** **2,033 passing, 0 failing** (was 1,827 → +206). No regressions across Phases 1–21.

Runner: `npx tsx --test`.

---

## 10. Build & typecheck status

| Check | Result |
| --- | --- |
| `tsc -p packages/executive-intelligence` | ✅ 0 errors |
| `tsc -p apps/web` | ✅ 0 errors |
| `tsc -p apps/worker` | ✅ 0 errors |
| `pnpm --filter web build` | ✅ Compiled successfully · 104/104 static pages · all 6 routes present |
| Full test suite | ✅ 2,033 / 2,033 passing |

(`next lint` remains broken repo-wide from a pre-existing ESLint version incompatibility — not a gate; build + tsc are the gates.)

---

## 11. Deployment steps

1. `pnpm install` (picks up the new `@hsi/executive-intelligence` workspace dep in web + worker — already done).
2. Apply `supabase/migrations/0026_executive_command_center.sql` to the database.
3. Deploy the web app and the worker. The worker requires `SUPABASE_SERVICE_ROLE_KEY` (+ URL) to persist; without it, it runs offline fixtures and writes nothing.
4. The command center reads live on every request; the worker backfills persisted snapshots/briefs/reports hourly. No backfill is required for the dashboards to render.

---

## 12. Platform Summary

The Human Signal Index is now a complete, human-governed intelligence operating system:

- **Capture & classify** raw signals from many sources (Phases 1–9).
- **Model time, causality, counterfactuals, and decisions** over narratives (Phases 10–13).
- **Track outcomes, calibrate trust, and recalibrate** continuously (Phases 14–17).
- **Orchestrate research, publish, and distribute** intelligence (Phases 18–19).
- **Form consensus** across a collective and **forecast** the future with scenarios + early warnings (Phases 20–21).
- **Command** all of it from one executive layer that ranks attention, surfaces risk + opportunity, briefs leadership, and routes every consequential choice to a human (Phase 22).

Across every phase the same non-negotiables hold: pure deterministic engines, explainable + auditable outputs, offline-safe workers, RLS-gated data, and **mandatory human governance** — nothing auto-publishes, auto-approves, auto-acts, or auto-governs.

---

## 13. Full Phase Timeline (1–22)

| Phase | Theme |
| --- | --- |
| 1–5 | Foundations: sources, capture, classification, traceability, evidence |
| 6 | Human review & curation |
| 7 | Signal intelligence (drift, alerts) |
| 8 | Scheduler, queue & narrative graph |
| 9 | Provider adapters, scaled queue & SLA escalation |
| 10 | Temporal intelligence |
| 11 | Causal intelligence & replay |
| 12 | Counterfactual simulation |
| 13 | Decision intelligence |
| 14 | Auth security hardening & startup env validation |
| 15 | Outcome intelligence & governance |
| 16 | Trust calibration |
| 17 | Public trust, recalibration & intelligence governance |
| 18 | Autonomous research orchestration & Intelligence Operations Center |
| 19 | Public intelligence publishing, subscriber network & distribution |
| 20 | Collective intelligence network, peer review & consensus engine |
| 21 | Forecasting, scenario planning & early warning system |
| **22** | **Executive Command Center & Strategic Intelligence OS** |

---

## 14. Future Expansion Ideas

- **Trend-aware attention** — feed historical snapshots back in so attention reflects *deltas* (rising/falling), not just the current level.
- **Priority feedback loop** — learn priority weights from which queued reviews humans actually approve vs. reject.
- **Scheduled briefings** — a human-approved digest that emails the daily/weekly brief to subscribers (reusing the Phase 19 distribution engine; opt-in, never auto-sent).
- **Cross-phase what-if** — let an executive ask "if this risk materialises, what decisions/forecasts/consensus shift?" by composing the Phase 12/13 engines under the command layer.
- **Multi-tenant command views** — per-team unified states scoped by RLS, each with its own attention index.
- **Natural-language command** — a retrieval layer over snapshots/briefs so leadership can ask questions in prose, answered strictly from persisted, cited intelligence.

---

*Generated for Phase 22 — the final integration phase. The Human Signal Index Intelligence OS roadmap is complete.*
