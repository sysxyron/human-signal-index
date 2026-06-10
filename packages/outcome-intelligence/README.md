# @hsi/outcome-intelligence

Recommendation **outcome tracking + confidence learning + alerting + governance**
for HSI **Phase 15**. It closes the **decision → outcome → learning loop**:

> Did the recommendation actually work — and are recommendations getting better?

Built on `@hsi/decision-intelligence` (`Recommendation` / `DecisionRun`) and
`@hsi/counterfactual-engine` (`ConfidenceBand` / calibration). It compares a
recommendation's **expected** effect against the **actual observed** data, scores
success, updates confidence, learns per intervention type, raises advisory
alerts, and records a fully traceable governance + audit chain.

## Principles (binding)

- **Pure & deterministic** — callers inject `now`/seed. No `Date.now()`, no
  `Math.random()`. Same inputs → identical outputs.
- **Offline** — fixtures + local heuristics. No network, clocks, or keys.
- **Zero runtime deps** beyond the `@hsi` workspace.
- **Never certainty, never black-box** — every output carries a success score, a
  confidence, an explanation, and explicit **limitations**, all tied to real
  observed data.
- **No auto-actions** — alerts and reviews are aids for a human reviewer.

## Public API

| Module | Export | Signature |
| --- | --- | --- |
| `outcome` | `evaluateOutcome` | `(rec, observed, now) => OutcomeEvaluation` |
| `measurement` | `measureDelta` | `(expected, observed) => OutcomeMeasurement[]` |
| `measurement` | `compareExpectedVsActual` | `(rec, observed) => { directionMatch, magnitudeRatio, measurements }` |
| `measurement` | `expectedMetricsFor` / `observedMetricsFor` | helpers |
| `learning` | `learnFromOutcomes` | `(evaluations, priorLearning?, now) => ConfidenceLearningEntry[]` |
| `learning` | `calibratedConfidenceFor` | `(type, learning[]) => number \| undefined` |
| `learning` | `tagInterventionType` / `evaluationInterventionType` | grouping helpers |
| `alerts` | `detectOutcomeAlerts` | `(input) => OutcomeAlert[]` |
| `governance` | `buildGovernanceReview` | `(evaluation, now) => GovernanceReview` |
| `governance` | `applyGovernanceDecision` | `(review, decision, opts) => GovernanceReview` |
| `governance` | `isTerminal` / `canValidate` | predicates |
| `governance` | `buildOutcomeAuditTrail` | `(rec, evaluation, learning?, review?) => OutcomeAuditStep[]` |
| `fixtures` | `outcomeDemo` | `() => OutcomeDemo` (full offline chain) |

## Heuristics

**Success score (0..100):** base `50`; `+35` right direction / `−40` wrong
direction; `+15` scaled by magnitude closeness; `±5` per-metric coverage;
clamped. **Status:** `successful ≥75`, `partially 50–74`, `neutral 25–49 (right
dir, weak)`, `unsuccessful <25 or wrong direction`, `inconclusive (thin data)`.

**Confidence update:** `confidenceAfter = clamp(before + decisiveness · sign ·
0.2)`, clamped to `(0, 0.99]` — **never 1.0**.

**Confidence learning (Bayesian-ish):** `(K·prior + N·p) / (K + N)` with `K=3`,
`p = successCount/N`. Repeated success → up; repeated failure → down; bounded
`[0.02, 0.95]`. Merges incrementally with prior learning.

**Alerts (threshold-gated, advisory):** `recommendation_failed`,
`confidence_drift`, `narrative_spike`, `forecast_miss`, `resurgence`,
`security_anomaly`.

## Limitations

- Single observation windows — outcomes may be confounded by exogenous events.
- One sample per evaluation; confidence updates are bounded, not proof of
  causation.
- Thin data is surfaced honestly as `inconclusive`, never fabricated.
- Alerts are advisory only — no automated action is ever taken.
