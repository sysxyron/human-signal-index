# @hsi/research-agents

WorldForge **Phase 3** — a pure-TypeScript, deterministic, zero-runtime-dependency
**multi-agent scientific research engine**. It turns a user's free-text world
**concept** into a structured, traceable, debate-ready **simulation blueprint**
_before_ a world is generated.

```
concept (text)
  → parseConcept              → ResearchConcept { extracted: ConceptSignals }
  → 9 domain agents (in order)→ AgentOutput[]   (each = traceable Claim[])
  → skeptic (falsification)   → Dispute[]
  → consensus (synthesis)     → ConsensusReport
  → consensusToBlueprint      → SimulationBlueprint
  → blueprintToWorldState     → WorldState  (real, simulatable via @hsi/simulation-engine)
```

No network, no API keys, no `Math.random()` / `Date.now()`. Same input → same
output. Builds on `@hsi/world-models` (WorldState + the scientific-confidence
ladder) and `@hsi/simulation-engine` (formulas + temporal-niche engine).

## Quick start

```ts
import { runResearch, blueprintToWorldState } from '@hsi/research-agents';

const run = runResearch('A frozen super-earth being with crystal genetics.');
run.consensus.overallConfidence;        // 0..100
run.consensus.classificationBreakdown;  // claims per scientific tier
const world = blueprintToWorldState(run.blueprint); // a real WorldState
```

```ts
import { chronidResearchDemo } from '@hsi/research-agents';
const run = chronidResearchDemo(); // "subjective day = 1,000 Earth years"
```

## The traceability model

Every reasoning step is reduced to an atomic **`Claim`**, and **every claim
carries two orthogonal tags**:

1. **`ProvenanceSource`** — _where it came from_ (the 6 categories):
   `user-input`, `prior-agent`, `known-science`, `model-inference`,
   `speculative-assumption`, `unsupported-generation`.
2. **`ScientificConfidenceTier`** — _how grounded it is_ (reused from
   `@hsi/world-models`): `known-science`, `plausible-science`, `speculative`,
   `fictional`, `violates-known-physics`.

A claim also records `dependsOn` (ids of prior claims / agent domains /
`'user-input'`), so the full chain from a generated number back to the user's
words is always walkable. Agent `uncertaintyScore` / `confidenceScore` (0..100)
are derived consistently from the claim set: more speculative/fictional claims →
higher uncertainty, lower confidence.

The **skeptic** agent is the falsification pass: it reads every prior claim,
finds the weakest ones (provenance `speculative-assumption` /
`unsupported-generation`, or tier `speculative` / `fictional` /
`violates-known-physics`) and raises `Dispute[]`. The **consensus** agent then
penalizes confidence by open disputes, counts claims by tier, scores agreement,
merges `recommendedParameters` into one coherent set, and writes the blueprint.

## The 11 agents

| # | domain | depends on | produces |
|---|--------|-----------|----------|
| 1 | `physics` | — | gravity/energy/time framing, escape velocity, universe preset |
| 2 | `planetology` | physics | planet class, star, orbit, temperature, habitable zone |
| 3 | `chemistry` | planetology | solvent viability, metabolism, replication substrate |
| 4 | `biology` | chemistry | cell architecture, genetics plausibility, metabolic pace |
| 5 | `evolution` | biology | evolutionary timescales, realized complexity |
| 6 | `intelligence` | evolution | cognitive substrate + **cognitiveRateHz** from subjective day |
| 7 | `civilization` | intelligence | society/tech gated by rate + lifespan, Kardashev framing |
| 8 | `mathematics` | intelligence | **Temporal Niche** C(t) ≈ E(t) + adaptation estimate |
| 9 | `risk` | civilization | extinction/stability risks + **risk comparison vs humans** |
| 10 | `skeptic` | all domain agents | `Dispute[]` (the falsification pass) |
| 11 | `consensus` | everything + disputes | `ConsensusReport` + blueprint notes |

## Public API (by module)

- **types** — `ResearchConcept`, `ConceptSignals`, `MetabolismRate`,
  `ProvenanceSource`, `Claim`, `Equation`, `Citation`, `AgentDomain`,
  `AgentOutput`, `Dispute`, `ConsensusReport`, `ResearchRunResult`,
  `SimulationBlueprint`, `AgentContext`, `Agent`, `ScientificConfidenceTier`.
- **concept** — `parseConcept(text, opts?)`, `ParseConceptOptions`.
- **agents** — `physicsAgent` … `consensusAgent` (all 11), `DOMAIN_AGENTS`,
  `ALL_AGENTS`, `AGENTS_BY_DOMAIN`, `buildDisputes`, `buildConsensusReport`,
  `RiskComparisonRow`.
- **orchestrator** — `runResearch(concept, opts?)`, `RunResearchOptions`.
- **blueprint** — `consensusToBlueprint(result)`,
  `blueprintToWorldState(blueprint)`, `paramsToStateOverrides(params)`.
- **demo** — `CHRONID_RESEARCH_CONCEPT`, `chronidResearchDemo()`.

## The Chronid showcase

`chronidResearchDemo()` runs "a being whose subjective day equals 1,000 Earth
years" on a frozen super-Earth around a red dwarf with crystal genetics, a
geological mineral neural network, ultra-slow metabolism and a billion-year
lifespan. The math agent computes a cognitive rate ≈ 3.17e-11 Hz (one cycle per
~1000 yr): **severely under-adapted to fast environments, well-matched to
climatic/geological ones**. The risk agent finds it safer than humans against
slow threats but more fragile against fast catastrophes. The blueprint builds a
real `WorldState` (M-dwarf, ammonia solvent, ~220 K, crystal genetics) ready for
`evaluateWorld`.
