# Phase 21 — Forecasting, Scenario Planning & Early Warning System

**Final Report**

HSI now has a **forward-looking** intelligence layer. It forecasts possible
developments from signals, consensus, trust trends, and intelligence activity;
plans competing scenarios; and raises early warnings — while keeping a human in
control.

The platform answers: *what is likely to happen next, what scenarios are forming,
how confident is each forecast, what evidence supports it, and what would
invalidate it?* **No prediction is truth. All forecasts are hypotheses. Human
governance remains mandatory.**

---

## 1. Architecture

Two new pure engines, a forward-looking data layer, five dashboards, a 30-minute
forecast worker, and one additive migration — layered exactly like every prior
phase.

```
packages/forecast-engine/   (NEW)  forecasts + confidence/reliability/failure +
                                    accuracy/calibration/Brier
packages/scenario-engine/   (NEW)  scenarios + likelihood/rank/compare/tree +
                                    six early-warning detectors
        │   (deterministic — `now` injected, no Date.now/Math.random; offline-safe)
        ▼
apps/web/lib/forecasting/persistence.ts  (DAL, server-only, RLS-scoped, DbResult)
apps/web/lib/forecasting/view.ts         (client-safe decorators + demo builders)
apps/web/lib/forecasting/actions.ts      ('use server' wrappers + revalidation)
        │
        ├── dashboard/forecasts + /[id]   (board + explainable detail)
        ├── dashboard/scenarios + /[id]    (board + tree/comparison/lifecycle)
        ├── dashboard/warnings             (early-warning board)
        └── dashboard/intelligence/operations  (ForecastingHighlightCards)
        │
apps/worker/jobs/forecast-worker.ts  (every 30 min; registered)
supabase/migrations/0025_forecasting_and_scenarios.sql  (10 tables, RLS, triggers)
packages/shared-types/src/index.ts  (Phase-21 records + view-models + unions)
```

---

## 2. Forecast Engine

`@hsi/forecast-engine`:
- **generateForecast** — builds a hypothesis; confidence = the direction-weighted
  net strength of the supporting signals, scaled by a coverage factor (thin
  evidence is pulled to neutral). It ALWAYS surfaces assumptions, invalidation
  criteria, and limitations (a missing one becomes an explicit caveat).
- **updateForecast / expireForecast** — evolve it (bump version, re-score).
- **scoreForecastConfidence / computeForecastReliability** — the two scores;
  reliability blends historical accuracy with a sample discount.
- **detectForecastFailure** — checks observations against the forecast's *own*
  invalidation criteria (verbatim or ≥60% significant-word overlap) or a low
  observed-success threshold. Advisory — never acts.
- **buildForecastExplanation** — enumerates every factor's signed contribution.

**Reliability layer:** `computeForecastAccuracy` (success/failure rates),
`computeForecastCalibration` (reliability-diagram bins + ECE), `computeForecastBrierScore`,
and `computeForecastDrift` — grounding "how reliable are our forecasts?" in
observed outcomes.

---

## 3. Scenario Engine

`@hsi/scenario-engine`:
- **createScenario / updateScenario** — attributed scenarios; likelihood = the
  weight-normalised mean of (weight × presence) over the drivers.
- **lifecycle** — `EMERGING → ACTIVE → MONITORING → CONFIRMED / INVALIDATED →
  ARCHIVED` via `validateScenarioTransition` / `advanceScenario` (validated,
  audited; verified by a 36-pair matrix test).
- **rankScenarios / compareScenarios** — order competing scenarios and report the
  leader + divergence + an explainable summary (with a "hypotheses, not truth"
  limitation).
- **buildScenarioTree / mostLikelyPath** — a branching tree with per-branch
  probabilities and the highest joint-probability path.

---

## 4. Early Warning System

Six detectors over the platform's forward-looking signals, each returning an
`EarlyWarning` (or null below threshold) at **INFO / WATCH / WARNING / CRITICAL**:
`detectEmergingPatterns`, `detectSignalAcceleration` (second-difference of a
series), `detectTrustCollapse`, `detectNarrativeShift` (composition change),
`detectConsensusInstability` (agreement volatility), `detectForecastRisk`
(confidence/reliability gap or weakening signals). Every alert carries evidence +
an advisory recommendation. **Alerts only — never auto-acts, never auto-escalates.**

---

## 5. Reliability Layer

Forecast reliability is tracked end-to-end: confidence, success/failure rate, ECE
(calibration), Brier score, and drift. The `ForecastAccuracyPanel` +
`ForecastReliabilityChart` render the reliability diagram (predicted vs observed
per confidence bin) so users see *how well-calibrated* the forecasts are.

---

## 6. Migration 0025

`supabase/migrations/0025_forecasting_and_scenarios.sql` (ADD-ONLY). Ten tables:
`hsin_forecasts`, `hsin_forecast_versions` (append-only), `hsin_forecast_outcomes`,
`hsin_forecast_accuracy`, `hsin_forecast_alerts`, `hsin_scenarios`,
`hsin_scenario_versions` (append-only), `hsin_scenario_comparisons` (append-only),
`hsin_scenario_trees`, `hsin_early_warning_alerts`. RLS via a DO-block: researcher+
READ, curator/admin WRITE, admin all; the `set_updated_at()` trigger on the mutable
tables. No prior migration is edited.

> Note: two record names collided with Phase 12/13 (`HsinForecastAccuracyRecord`,
> `HsinScenarioComparisonRecord`); the Phase-21 mirrors were named
> `HsinForecastReliabilityRecord` and `HsinScenarioComparisonSnapshotRecord` to
> avoid interface merging.

---

## 7. Dashboard

| Route | Purpose | Components |
|-------|---------|-----------|
| `/dashboard/forecasts` | forecast board + reliability | ForecastCard, ForecastAccuracyPanel, ForecastReliabilityChart |
| `/dashboard/forecasts/[id]` | explainable detail | ForecastExplanationPanel (factors/assumptions/invalidation/limitations), ForecastTimeline, outcomes |
| `/dashboard/scenarios` | scenario board + comparison | ScenarioComparison, CreateScenarioControl |
| `/dashboard/scenarios/[id]` | tree + ranking + lifecycle | ScenarioTree, ScenarioComparison, ScenarioTransitionControl |
| `/dashboard/warnings` | early-warning board | WarningLevelBadge, EarlyWarningPanel, ResolveWarningControl |
| operations (additive) | cross-surface | ForecastingHighlightCards |

All pages are `force-dynamic`, role-gated, with `NOT_CONFIGURED` → labeled offline
demo. The operations center now shows active forecasts, failures, scenario shifts,
warnings, accuracy, and confidence drift.

---

## 8. Worker

`forecast-worker.ts`, registered as a 30-minute loop: recompute forecast
reliability (accuracy/ECE/Brier) from outcomes → refresh scenario likelihoods →
detect forecast-risk early warnings → persist, flagging WARNING/CRITICAL for human
review. Fault-isolated, retry-safe, deterministic, offline-safe. It **never
auto-predicts, auto-acts, auto-escalates, or auto-publishes** (verified by tests:
no forecast inserts, no investigation transitions, `autoPredict:false`).

---

## 9. Governance

`autoPredict:false`, `autoAct:false`, `autoEscalate:false`, `autoPublish:false` —
enforced. Every forecast exposes its assumptions, supporting evidence, invalidation
criteria, and limitations, and always carries a "hypothesis, not certainty"
limitation. Scenario likelihoods carry a "hypotheses, not probabilities of truth"
caveat. Warnings are advisory; a human acknowledges/resolves each. The DAL
re-checks roles and validates every transition.

---

## 10. Testing

- **`@hsi/forecast-engine`** — 90 tests (forecast generation/scoring/failure/
  explanation, reliability/calibration/Brier, scoring-deep, fixtures).
- **`@hsi/scenario-engine`** — 100 tests (scenario lifecycle/likelihood/rank/
  compare/tree, warning detection, warning-deep, transition matrix, integration,
  fixtures).
- **`forecast-worker`** — 9 tests (offline determinism, reliability compute,
  scenario refresh, forecast-risk warning, no-auto-act, fault isolation).
- **forecasting view helpers** — 21 tests (decorators, formatters, tree/bin
  readers, demo builders).
- **Phase 21 net-new: ~198 tests.**

**Full suite: `1827 tests, 1827 pass, 0 fail`.** No Phase 1–20 regressions.

---

## 11. Build & typecheck status

| Gate | Result |
|------|--------|
| `apps/web` `tsc --noEmit` | **0 errors** |
| `apps/worker` `tsc --noEmit` | **0 errors** |
| `packages/forecast-engine` `tsc` | **0 errors** |
| `packages/scenario-engine` `tsc` | **0 errors** |
| `next build` | **✓ Compiled successfully** — all 5 Phase-21 routes emitted (ƒ) |
| Full test suite | **1827 / 1827 pass** |

> Repo-level `next lint` still fails on the pre-existing ESLint-version
> incompatibility (unrelated to Phase 21); type-checking and the build are clean.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Forecasts are worker-generated stubs (this phase wires reliability + warnings; richer signal ingestion is future work) | the engine + DAL are complete; the worker computes reliability + warnings now, and forecast generation from live signals is a Phase-22 wiring step |
| Forecast-failure detection is text-overlap heuristic | strict ≥60% significant-word overlap avoids false positives (tested); structured invalidation criteria are a future refinement |
| Scenario likelihood ≠ probability | every surface labels likelihoods as hypotheses; comparison carries a "not truth" limitation |
| Worker re-snapshots accuracy each run (append-only growth) | the latest rollup is used; retention/rollup is a Phase-22 item |
| Warnings could fatigue reviewers | levels (INFO→CRITICAL) + human acknowledge/resolve; only WARNING/CRITICAL flag for review |

---

## 13. Deployment steps

1. **Migrate.** Apply `0025_forecasting_and_scenarios.sql` (additive; safe after
   0001–0024). Verify the 10 tables + RLS + triggers.
2. **Install.** `pnpm install` (links the two new workspace packages — already in
   `apps/web` + `apps/worker` deps and `tsconfig.base.json` paths).
3. **Build.** `pnpm build` (web + worker). Both green.
4. **Test.** `npx tsx --test $(find packages apps -name '*.test.ts' …)` → 1827 pass.
5. **Worker.** Deploy the updated worker; `forecastWorkerJob` runs every 30 min
   under the service-role key (safe offline no-op without it).
6. **Verify.** Visit `/dashboard/forecasts` (open a forecast detail and confirm the
   assumptions / invalidation criteria / limitations show), `/dashboard/scenarios`
   (open one, advance its state, view the tree), and `/dashboard/warnings`
   (acknowledge/resolve an alert). Confirm the reliability diagram renders.

---

## 14. Recommended Phase 22 — Signal-Driven Forecast Generation & Adaptive Models

- **Live forecast generation** — wire the forecast worker to real signals
  (velocity, source activity, consensus, trust drift) so forecasts are produced
  from the platform's own data, not seeded inputs.
- **Outcome auto-resolution** — when a forecast horizon elapses, gather observed
  outcomes and record them for the reliability layer (still human-confirmed).
- **Adaptive calibration** — learn per-category confidence corrections from the
  calibration history (à la Phase 16), applied only after human approval.
- **Scenario ↔ forecast binding** — drive scenario drivers directly from named
  forecasts so a forecast update re-ranks scenarios automatically.
- **Warning routing & SLAs** — route CRITICAL warnings into the Phase-18 escalation
  queue with time-to-acknowledge tracking.
- **Backtesting harness** — replay historical periods to measure forecast skill
  (vs a naïve baseline) and surface a skill score.
```
