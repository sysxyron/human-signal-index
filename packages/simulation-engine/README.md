# @hsi/simulation-engine — WorldForge Phase 2

A pure-TypeScript, **zero-runtime-dependency** causal simulation engine. It turns
the classic "Input → Report" pipeline into:

```
Input → World State → Simulation Graph → Dynamic Recalculation → Report
```

**State is the single source of truth.** Reports are derived outputs. Every
computed value is observable, explainable, and carries provenance + a scientific
confidence tag (known-science → violates-known-physics).

Importable by both a Next.js app and a Node worker (no DOM/Node APIs, no
`Date.now()` / `Math.random()` inside compute functions — pass seeds/timestamps).

## Core ideas

- **WorldState** (`createEarthState()`) — canonical star / planet / chemistry /
  biology / intelligence / civilization / risks.
- **Simulation graph** (`buildDependencyGraph`) — 60+ nodes, each with a real
  formula (gravity = M/R², escape velocity, equilibrium temperature, stellar
  lifetime ∝ M/L, habitable zone ∝ √L, Jeans-escape atmospheric retention…),
  wired with cross-category causal edges and provenance.
- **Propagation** (`propagate`) — change one knob, recompute only the downstream
  closure in topological order, get an `ImpactChain` cascade.
- **Counterfactuals / Scenarios** — "what if gravity tripled / the star becomes a
  red giant / one thought per century" with human-readable cascades.
- **Temporal Niche v2** — `C(t) ≈ E(t)`: an organism is adapted when its cognitive
  rate matches its environment's change rate (the Chronid twist).
- **Evaluator** — `evaluateWorld(state)` derives a fully-provenanced report.
- **Versioning + diff** — "Earth vs Earth (3x Gravity)".

## Usage

```ts
import {
  createEarthState,
  SimulationEngine,
  applyCounterfactual,
  EXAMPLE_COUNTERFACTUALS,
  evaluateWorld,
  diffWorlds,
  chronidDemo,
} from '@hsi/simulation-engine';

// 1. Build a world and its graph
const engine = new SimulationEngine(createEarthState());

// 2. Turn a knob; watch the cascade
const impact = engine.set('planet.massEarth', 3); // ~3x gravity
console.log(impact.steps.map((s) => `${s.label}: ${s.before} → ${s.after}`));

// 3. Report is an output of state
const report = evaluateWorld(engine.getState());
console.log(report.summary, report.overallScore);

// 4. Counterfactual with explanation
const cf = applyCounterfactual(createEarthState(), EXAMPLE_COUNTERFACTUALS[0]);
console.log(cf.explanation); // "Gravity tripled (3x mass) ↓ Gravity increased ↓ ..."

// 5. Diff two worlds
const diff = diffWorlds(createEarthState(), cf.newState);

// 6. The flagship Chronid showcase (billion-year civilization, glacial cognition)
const demo = chronidDemo();
demo.temporalAcrossEnvironments.fast.label;       // 'under-adapted'
demo.temporalAcrossEnvironments.geological.label; // 'balanced'
```

See `src/index.ts` for the full exported API surface.
