# @hsi/decision-intelligence

Strategic **decision intelligence + war-gaming** for WorldForge / HSI **Phase 13**.

Built on top of `@hsi/counterfactual-engine`, `@hsi/causal-intelligence`, and
`@hsi/temporal-intelligence`, this package answers two human questions from a
narrative's **actual** signal / causal / counterfactual history:

- **"What should we do next?"** → a calibrated `Recommendation` + full `DecisionRun`.
- **"Which intervention has the highest probability of success?"** → a ranked,
  signed `InterventionRanking[]` + head-to-head scenario war-gaming.

## Principles (binding)

- **Pure & deterministic** — callers inject `now`; no `Date.now()` / `Math.random()`.
- **Offline** — fixtures + local heuristics; zero network, clocks, or keys.
- **Zero runtime deps** beyond the `@hsi` workspace.
- **Never certainty, never black-box** — every output carries a `confidence`,
  `reasoning[]`, explicit `limitations[]`, and `evidence[]`, all tied to real
  input data. Outputs are **aids for a human reviewer**, never commands.

## Public API

| Module | Export | Signature |
| --- | --- | --- |
| `sensitivity` | `runSensitivityAnalysis` | `(input: DecisionInput, now: string) => SensitivityResult` |
| | `eventTypeLabel` | `(t: string) => string` |
| `ranking` | `rankInterventions` | `(input: DecisionInput, now: string) => InterventionRanking[]` |
| | `effectFromDeltas` | `(d) => number` |
| | `ALL_INTERVENTIONS` | `InterventionType[]` (the 12 scenario types) |
| `decision` | `simulateInterventionSet` | `(input, interventions: InterventionType[], now) => InterventionSetResult` |
| | `generateDecisionRun` | `(input: DecisionInput, now: string) => DecisionRun` |
| `recommendations` | `generateRecommendations` | `(input: DecisionInput, now: string) => Recommendation` |
| `comparison` | `compareScenarios` | `(input, scenarioA, scenarioB, now) => ScenarioBattleResult` |
| `crossNarrative` | `computeCrossNarrativeImpact` | `(source, targets, now) => CrossNarrativeImpact[]` |
| `audit` | `buildDecisionAudit` | `(run: DecisionRun, now: string) => DecisionAudit` |
| `fixtures` | `decisionDemo` | `(now?: string) => DecisionDemoResult` |
| | `DEMO_DECISION_INPUTS`, `FIXTURE_NOW` | demo inputs / fixed clock |

## Scoring heuristics & thresholds

### Sensitivity (`runSensitivityAnalysis`)
Reuses the causal engine's `attributeChange` (share = `strength × confidence`,
normalized, capped at `MAX_EXPLAINED = 92`). Per-type shares are split across
member events by relative impact weight. An `unexplainedPct` residual is **always**
reported (never forced to 0/100). `dominant` is the highest-share event type.

### Ranking (`rankInterventions`)
For each of the 12 `InterventionType`s, run `generateCounterfactual` and read its
deltas:

- `expectedEffect ∈ [−100, 100]` = `0.5·growthDeltaPct + 0.3·signalDeltaPct + 0.2·amplificationDelta`
  (each clamped, sign preserved). Negative = dampens, positive = amplifies.
- `riskScore ∈ [0, 100]` = `BASE_RISK[type] + (1−confidence)·25 + (|effect|/100)·15`.
  `BASE_RISK` is higher for aggressive/upstream scenarios (`remove_source` 65,
  `remove_event` 60, `remove_community` 60) and lower for soft reads
  (`increase_reliability` 30, `reduce_amplification` 35).
- `confidence` = the counterfactual's own confidence (always < 1).
- **Sort score** = `(|expectedEffect| × confidence) ÷ (1 + riskScore/100)` —
  high-magnitude, high-confidence, low-risk interventions rank first.

### Recommendation (`generateRecommendations`) — thresholds
- `MIN_CONFIDENCE = 0.4`, `MIN_ABS_EFFECT = 5`, `HIGH_RISK = 70`.
- Best intervention clears both floors at risk `< HIGH_RISK` → **`intervention`**.
- Clears floors but `risk ≥ HIGH_RISK` on a rising narrative → **`escalate`**.
- Credible dampener on a **rising + adversarial** (amp ≥ 60, reliability < 55)
  narrative → **`counter_narrative`**.
- Nothing clears the floors but the narrative is moving → **`monitor`**.
- Otherwise → **`no_action`**.
- Confidence is **calibrated** via `input.calibration?.calibrate` when supplied
  (overconfident bands pulled down → calibrated ≤ raw).

### Intervention set (`simulateInterventionSet`)
Composes the union of each scenario's event changes into one re-propagated
timeline. Confidence = mean per-scenario confidence − `(setSize−1) × 0.08`
(`SET_COMPOUNDING_PENALTY`) — **more interventions ⇒ lower confidence**.

### War-gaming (`compareScenarios`)
`scenarioScore = |signalDeltaPct| × confidence × (forecastChanged ? 1.15 : 1) − (setSize−1)·2`.
Winner is the higher score; **`tie`** when `|scoreA − scoreB| ≤ TIE_MARGIN = 3`.

### Cross-narrative (`computeCrossNarrativeImpact`)
`impactStrength = influence(0..40) + overlap(0..30) + ampCoupling(0..20) + coMovement(0..10)`.
Classified `triggers` (influence ≥ 70), `amplifies` (coupling + same-sign movement),
`reinforces` (high overlap + aligned amplification), `competes` (overlap + opposite
movement), `dampens`, or `neutral`.

## Limitations (always surfaced)

Every recommendation is a **decision aid built from heuristic counterfactual
estimates**, not a guarantee. The unexplained residual is reported; combining
interventions stacks assumptions and lowers confidence; war-gaming compares
estimates, not real outcomes. Treat all outputs as inputs to **human** judgment.

## Demo

```ts
import { decisionDemo } from '@hsi/decision-intelligence';
const out = decisionDemo();
console.log(out.recommendation.decisionType, out.recommendation.recommendedAction);
out.rankings.forEach((r) => console.log(r.rankPosition, r.interventionType, r.expectedEffect));
```
