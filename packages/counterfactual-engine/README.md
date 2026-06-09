# @hsi/counterfactual-engine

Grounded **counterfactual reasoning** + **forecast validation / calibration** for
WorldForge / HSI **Phase 12**.

It answers _"what would have happened if X never happened?"_ — **from a
narrative's ACTUAL signal history**, not by inventing a fantasy world. Every
output is tied to real input data and carries a **confidence**, a **reasoning
trail**, and explicit **LIMITATIONS**. It NEVER claims certainty and NEVER
hallucinates.

> A DIFFERENT package, `@hsi/counterfactuals` (Phase-2 world-sim), is unrelated.
> This package is `@hsi/counterfactual-engine` (narrative counterfactuals).

## Principles (binding)

- **Pure & deterministic** — callers inject `now`; no `Date.now()` / `Math.random()`.
- **Offline** — fixtures + local heuristics; no network, no clocks, no keys.
- **Zero runtime deps** beyond the `@hsi` workspace.
- **Honest** — counterfactuals are ESTIMATES; confidence is lower when the
  intervention is far upstream, data is thin, or many effects compound.

## What it does

1. **Counterfactuals** (`generateCounterfactual`) — locate the target causal
   event(s), apply an intervention (remove / reduce / amplify / delay /
   accelerate), **re-propagate** downstream metrics through the snapshot chain,
   re-run the real forecaster, and produce both timelines + deltas + honesty.
2. **Interventions** (`simulateIntervention`, `INTERVENTION_PRESETS`) — ergonomic
   high-level wrappers ("Remove Amplification Spike", "Delay Community Growth").
3. **Validation** (`backtestForecasts`, `computeForecastAccuracy`) — score past
   forecasts against what actually happened (Brier-style error).
4. **Calibration** (`calibrateConfidence`) — bucket predictions into low/medium/
   high bands, measure empirical accuracy, and pull **overconfident** bands DOWN.
5. **WorldForge** (`generateCounterfactualWorld`) — render a result as an
   alternative timeline (title, summary, worldState, epochs, turning points).

## Quick start

```ts
import { counterfactualDemo } from '@hsi/counterfactual-engine';

const out = counterfactualDemo();
out.counterfactuals.forEach((c) => console.log(c.scenarioName, c.summary));
console.log(out.calibration.calibrate(0.9)); // overconfident high band pulled down
```

## Heuristics & thresholds

- **Re-propagation** scales the per-step *increment* of each metric by a
  multiplier derived from `(eventType, action, impactScore)`; effects persist and
  compound forward from the intervention boundary (`simulation.ts`).
- `VIRAL_COMMUNITY_THRESHOLD = 3` — below this final community count, growth is
  treated as having fallen below the viral threshold.
- Confidence bands: `HIGH_BAND = 0.66`, `MEDIUM_BAND = 0.40`; ceiling
  `MAX_CONFIDENCE = 0.90` (never certainty).
- Backtest `errorScore = (statedProbability − correct)^2` (Brier).
- Calibration `adjustment = min(1, empiricalAccuracy / statedConfidence)` — never
  inflates confidence, only pulls overconfident bands down.

All tests: `node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test packages/counterfactual-engine/tests/<file>`
