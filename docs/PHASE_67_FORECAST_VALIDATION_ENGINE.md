# Phase 67 — Forecast Validation Engine

**Status:** Complete (uncommitted)
**Routes:** `/dashboard/forecast-validation` + `/dashboard/forecast-validation/[id]` (reviewer+; admins create/resolve)
**Migration:** `0054_forecast_validation.sql` (additive)

Infrastructure to **record forecasts, track outcomes, measure accuracy, and
compute calibration**. This does **not** create AI predictions or autonomous
forecasts — humans/agents record predictions; the engine evaluates them against
reality **deterministically**. Forecasts are first-class, **immutable, time-bound,
auditable, reproducible** objects.

> **Route note:** `/dashboard/forecasts` already exists (the Phase 21 forecasting
> board) and is preserved unchanged. Phase 67 lives at
> `/dashboard/forecast-validation` to avoid any regression.

---

## Architecture

```
lib/forecasts/
  types.ts        PURE — statuses, prediction types, results, data shapes
  evaluation.ts   PURE — deterministic evaluatePrediction() + brierScore()
  calibration.ts  PURE — calibration curve, calibration score, performance metrics
  persistence.ts  DAL — forecasts/predictions/outcomes/evaluations/scores/calibration/snapshots/alerts
  engine.ts       create / recordOutcome / evaluate / resolve / expire / recompute
  service.ts      RBAC API (reviewer+ reads, admin mutations)
  data.ts         getForecastsDashboard()
  actions.ts      create / record outcome / resolve / expire / recompute (admin, audited)

app/dashboard/forecast-validation/page.tsx + [id]/page.tsx     reviewer+ dashboard + detail
components/forecasts/                                           panels (server) + controls (client)
supabase/migrations/0054_forecast_validation.sql               8 tables, RLS, + seeds the validation agent
```

Consumes Phase 61–66: **65** (forecasts reference narratives via `narrative_id`),
**64** (`graph_node_id`), **62** (alerts), **66** (the `FORECAST_PREP_AGENT`
readiness drives the readiness panel; the new `FORECAST_VALIDATION_AGENT` runs the
engine on a schedule).

---

## Forecast model

`forecasts`: `id`, `title`, `description`, `prediction_type`, `status`,
`confidence` (0–1), `forecast_date`, `resolution_date`, `outcome`, `source`,
`agent_id`, `narrative_id`, `graph_node_id`, audit fields. **Statuses:** `draft ·
active · resolved · expired · cancelled`. The prediction payload lives in an
immutable `forecast_predictions` row; outcomes in `forecast_outcomes`. Forecasts
are not edited after recording — only outcome/status transitions occur (engine-
enforced), and `forecast_evaluations` is append-only.

**Prediction types** (deterministic, no LLM): `binary · probability ·
multi-outcome · range · narrative · event · trend`.

---

## Evaluation model

`evaluatePrediction(type, predicted, actual)` → `{ result, score, rationale }`,
deterministic per type:

| Type | Rule | Score |
|---|---|---|
| binary / event | yes/no match | 1 or 0 |
| probability | Brier `(p−actual)²`; correct if `(p≥0.5)==actual` | `1 − Brier` |
| multi-outcome / narrative / trend | option/direction match | 1 or 0 |
| range | value in `[min,max]` → correct; within 10% → partial | 1 / 0.5 / 0 |

Results: `correct · incorrect · partial · unresolved · expired`. No outcome →
`unresolved`. Every evaluation is stored append-only (immutable history).

---

## Calibration model

`buildCalibrationCurve(records)` groups evaluated forecasts into confidence bands
(`0.0–0.1` … `0.9–1.0`) and computes, per band, **stated confidence vs actual
accuracy** + count — the calibration curve. `calibrationScore = 1 − mean|predicted
− actual|` (1.0 = perfectly calibrated). `confidenceBias` reveals over/under-
confidence. Empty input → 0 (never fabricated). The global curve is persisted to
`forecast_calibration` (replaced each recompute) and a performance snapshot to
`forecast_snapshots`.

---

## Performance model

`performanceMetrics(records)` → accuracy (correct/resolved), precision
(correct/(correct+incorrect)), resolution rate, expiration rate, confidence
quality (`1 − mean Brier`), calibration score, volume, and trend accuracy — all
computed, empty → 0.

---

## Alert model (Phase 62)

`FORECAST_DUE · FORECAST_RESOLVED · FORECAST_EXPIRED · FORECAST_MISSED ·
FORECAST_CALIBRATION_DROP · FORECAST_PERFORMANCE_CHANGE`. Persisted to
`forecast_alerts` and delivered to admins via the Phase 62 framework
(`FORECAST_TRIGGER`, honoring preferences); calibration-drop / performance-change
are raised on recompute by comparing to the previous snapshot.

---

## Agent integration (Phase 66)

A new **`FORECAST_VALIDATION_AGENT`** is registered in the Phase 66 registry +
handlers (seeded additively by `0054`). On its schedule (via the existing
`/api/cron/agents`), it: detects due forecasts (active + resolution passed),
**evaluates** those with recorded outcomes, computes scores, recomputes
calibration, and raises alerts. **Validation only — it never forecasts.** It calls
the Phase 67 engine (`validateDueForecasts`) — no duplicate logic. Readiness on the
dashboard comes from the existing `FORECAST_PREP_AGENT` findings.

---

## RBAC & safety

Reviewer+ read (`is_reviewer_or_above`), admin manage (`is_admin`) — RLS on all 8
tables + middleware gate (`/dashboard/forecast-validation` reviewer) + nav-roles +
page self-gates. **No AI forecasting, no autonomous predictions, no fabricated
scores** — humans/agents record predictions; evaluation + calibration are computed
deterministically from recorded outcomes.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Forecast + agent + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2752 / 2752** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; new routes `ƒ`; **Phase 21 `/dashboard/forecasts` preserved** |
| Migration idempotency | ✅ re-runnable (DO-block RLS + agent seed on-conflict) |
| No regressions / no AI forecasting / no fabricated scores | ✅ deterministic evaluation only |

> Migrations `0048`–`0054` must be applied to Supabase; `0054` seeds the
> validation agent. The agent runs via the existing agents cron; admins can also
> create/resolve forecasts immediately.

---

## Phase 68 readiness (Transparency Portal 2.0)

- Forecasts, evaluations, calibration curves, and performance metrics are
  computed + persisted — ready to surface publicly (published/aggregate only) in
  the Transparency Portal, following the existing public-safety contract.
- Calibration + accuracy trends are the credibility evidence a transparency portal
  needs ("how accurate are HSI's forecasts?"), and they're immutable + auditable.
- The same pattern (record → evaluate → calibrate → publish) generalizes to a
  future forecast **marketplace**: forecasts are already first-class, scored, and
  attributable (`source` / `agent_id` / `created_by`).

---

## Known limitations

- **Validation, not generation** — by design, nothing predicts; outcomes are
  human/agent-recorded.
- **Calibration is global** (single curve); per-source/per-agent calibration is a
  future extension (the data supports it).
- **Narrative/graph references** are stored + linkable; richer cross-display is
  incremental.
- **Email delivery** deferred (Phase 62 internal notifications only).
