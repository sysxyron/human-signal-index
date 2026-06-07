# WorldForge Architecture (Phase 2 — Causal Simulation Engine)

WorldForge is a **causal world-simulation subsystem** added to the Human Signal
Index (HSI) platform in Phase 2. Where the core HSI pipeline traces *real-world
narratives* back to their evidence, WorldForge applies the same
**provenance/traceability discipline** to *simulated worlds*: every computed
property of a world records what produced it, why, what it depends on, and how
scientifically confident the result is.

It re-uses the existing platform infrastructure — Supabase (Postgres + RLS), the
`admin/reviewer/viewer` role model, the provenance/traceability principle, and
the `docs/` + migrations layout. It does **not** rebuild any of that.

Related: [`README.md`](README.md) (core HSI architecture) ·
[`../methodology/WORLDFORGE-SCIENCE.md`](../methodology/WORLDFORGE-SCIENCE.md) ·
[`../methodology/CHRONID-PRIME.md`](../methodology/CHRONID-PRIME.md)

---

## 1. Core principle

WorldForge treats a world as a **directed causal graph**, not a flat record. A
user supplies inputs; the engine derives a canonical state; every derived value
is a node whose value is a pure function of its dependencies. Change one input
and the change **propagates** through the graph, recomputing only what is
downstream.

```
INPUT  →  WORLD STATE  →  SIMULATION GRAPH  →  DYNAMIC RECALCULATION  →  REPORT
(user      (canonical      (nodes + edges,      (propagate changes        (state +
 params)    WorldState)     dependency DAG)      down the DAG)             provenance +
                                                                          evaluation)
```

This mirrors HSI's own "no black-box conclusions" rule: nothing in the final
report appears without a traceable derivation back to an input and a scientific
basis.

## 2. Engine packages and dependency layering

WorldForge is four packages, layered bottom-up. Each higher layer depends only
on the layers below it.

| Package | Responsibility |
| --- | --- |
| `@hsi/world-models` | The canonical `WorldState` data model, the `UniverseType` model, and the static dependency graph definition (nodes + edges). Foundation layer — no dependencies on the others. |
| `@hsi/simulation-engine` | Builds the `SimulationGraph` from a `WorldState`, runs the scientific formulas, performs **dynamic recalculation** (propagation), and emits `WorldVersion` snapshots, `WorldDiff`s, `WorldEvaluation`s, and `Provenance` per node. Depends on `@hsi/world-models`. |
| `@hsi/timeline-engine` | Generates `TimelineEvent[]` sequences (evolution / civilization / planetary / stellar) by stepping the simulation through time. Depends on `@hsi/simulation-engine`. |
| `@hsi/counterfactuals` | Runs "what if X were different" experiments: applies a modification, re-propagates, and reports the `impact chain`, affected node count, and confidence. Depends on `@hsi/simulation-engine` (and reads timelines). |

```
            @hsi/counterfactuals     @hsi/timeline-engine
                       \                   /
                        \                 /
                     @hsi/simulation-engine
                              |
                       @hsi/world-models
```

## 3. The canonical WorldState model

`WorldState` is the single source of truth for a world. Canonical shape:

```jsonc
{
  "id": "...",
  "name": "...",
  "universeType": "standard-physics",   // see §6
  "star":        { /* class, mass, luminosity, ... */ },
  "planets":     [ /* gravity, atmosphere, temperature, magnetosphere, ... */ ],
  "chemistry":   { /* solvent, metabolism, replication, ... */ },
  "biology":     { /* cell structure, genetics, evolution, intelligence, ... */ },
  "intelligence":{ /* cognition tier, response rate, ... */ },
  "civilization":{ /* society, laws, mathematics, technology, risk mgmt, ... */ },
  "risks":       [ /* stellar end-of-life, impacts, climate, ... */ ],
  "meta":        { /* tier, notes, scientific confidence summary, ... */ }
}
```

Every **computed** output carries a `Provenance`:

```jsonc
{
  "source": "stellar-model",
  "reason": "Luminosity from mass via L ∝ M^3.5",
  "dependsOn": ["star.massSolar"],
  "confidence": 0.95,                       // 0..1
  "scientificConfidence": {
    "tier": "known-science",                // see the ladder in WORLDFORGE-SCIENCE.md
    "confidence": 0.95,
    "color": "#2e7d32",
    "reason": "Standard main-sequence relation"
  }
}
```

## 4. The directed dependency graph

Nodes are world properties; edges are "is computed from" relations. Recalculation
flows along the edges.

```
Star ─────────► Radiation
     ─────────► Luminosity
     ─────────► OrbitZone (habitable zone)

Planet ───────► Gravity
       ───────► Atmosphere
       ───────► Temperature
       ───────► Magnetosphere

Chemistry ────► Solvent
          ────► Metabolism
          ────► Replication

Biology ──────► CellStructure
        ──────► Genetics
        ──────► Evolution
        ──────► Intelligence

Civilization ─► Society
             ─► Laws
             ─► Mathematics
             ─► Technology
             ─► RiskManagement
```

Cross-layer edges connect these clusters (e.g. `Star.Luminosity` +
`Planet.OrbitZone` → `Planet.Temperature`; `Planet.Gravity` →
`Planet.Atmosphere`; `Chemistry.Solvent` + `Planet.Temperature` →
`Biology.CellStructure`; `Biology.Intelligence` → `Civilization.*`). The full
graph is a DAG, which guarantees a deterministic topological recompute order.

## 5. Propagation / recompute model

1. A user (or counterfactual) changes one or more **input** nodes.
2. The engine marks all **downstream** nodes dirty (transitive closure over
   outgoing edges).
3. Dirty nodes are recomputed in **topological order**, each via its scientific
   formula (see [`WORLDFORGE-SCIENCE.md`](../methodology/WORLDFORGE-SCIENCE.md)).
4. Each recomputed node emits fresh `Provenance` (source, reason, `dependsOn`,
   confidence, scientific tier).
5. The engine produces a `WorldDiff {added, removed, changed}` versus the prior
   state and, on commit, an immutable `WorldVersion` snapshot + `WorldEvaluation`.

Only dirty nodes recompute, so a localized change (e.g. one planet's albedo) does
not re-run the entire world.

## 6. Universe types

`UniverseType ∈ standard-physics | alternative-constants | high-gravity |
low-entropy | exotic-matter | user-defined`. The universe type selects the
**constant-multiplier model** (the Universe Forge; see the science doc) that
scales physical constants before the formulas run, letting WorldForge explore
worlds under non-Earth physics while keeping the same graph.

## 7. Persistence schema

WorldForge adds **7 tables** in migration `0005_worldforge.sql`, all with RLS via
the existing helpers (`is_admin()`, `is_reviewer_or_admin()`) plus a new
`simulation_is_public(uuid)` SECURITY DEFINER helper that lets viewers/anon read
only rows whose parent world is public.

| Table | Holds |
| --- | --- |
| `worlds` | Reusable world definitions; `base_state` jsonb = canonical WorldState; `is_public`, `tags`. |
| `simulations` | Live instances of a world; `current_state` jsonb, `latest_version`, `status`. |
| `simulation_versions` | Immutable `WorldVersion` snapshots; `unique(simulation_id, version)`. |
| `scenarios` | Named tunable parameter-change sets + `result_summary`. |
| `counterfactuals` | "What if" experiments: `modification`, `impact_chain`, `explanation`, `confidence`, `affected_nodes`, `base_version`. |
| `world_timelines` | Generated `TimelineEvent[]` of a `kind` (evolution/civilization/planetary/stellar) over `span_years`. |
| `simulation_provenance` | Per-node `Provenance` (source, reason, `depends_on[]`, `confidence`, `scientific_tier`) — the traceability tie-in. |

Access model (RLS): the **owner** (`created_by = auth.uid()`) has full CRUD;
**admin/reviewer** (`is_reviewer_or_admin()`) read all + write; **viewer/anon**
read only public rows (`worlds.is_public`, and for child tables
`simulation_is_public(simulation_id)`). Indexes cover all FKs plus
`worlds.universe_type`, `simulations.world_id`, `simulation_versions.simulation_id`,
and `simulation_provenance.scientific_tier`.

The TypeScript mirrors live in `packages/shared-types/src/index.ts`
(`WorldRecord`, `SimulationRecord`, `SimulationVersionRecord`, `ScenarioRecord`,
`CounterfactualRecord`, `WorldTimelineRecord`, `SimulationProvenanceRecord`).

## 8. Dashboard pages

WorldForge is surfaced under `/dashboard/worldforge`:

| Page | Purpose |
| --- | --- |
| `/dashboard/worldforge` | World gallery — public + owned worlds; create new. |
| `/dashboard/worldforge/[worldId]` | World overview: canonical state, universe type, tags. |
| `/dashboard/worldforge/[worldId]/graph` | The interactive dependency graph + per-node provenance. |
| `/dashboard/worldforge/[worldId]/simulate` | Run/tune a simulation; scenarios + dynamic recalculation. |
| `/dashboard/worldforge/[worldId]/timeline` | Generated evolution/civilization/planetary/stellar timelines. |
| `/dashboard/worldforge/[worldId]/counterfactuals` | "What if" experiments + impact chains. |
| `/dashboard/worldforge/[worldId]/versions` | Immutable version history + diffs. |

## 9. ASCII data-flow diagram

```
        ┌──────────────────────────────────────────────────────────────────┐
        │ /dashboard/worldforge (apps/web)                                   │
        │  gallery · overview · graph · simulate · timeline · counterfactuals│
        └───────────────┬───────────────────────────────────┬──────────────┘
                        │ inputs / tune / "what if"          │ read state + provenance
                        ▼                                     ▲
        ┌──────────────────────────────┐        ┌────────────┴──────────────┐
        │ @hsi/world-models            │        │ Reports / evaluations      │
        │  WorldState + dependency DAG │        │ WorldEvaluation · diffs    │
        └───────────────┬──────────────┘        └────────────▲──────────────┘
                        ▼                                     │
        ┌──────────────────────────────┐                     │
        │ @hsi/simulation-engine       │  propagate (topo)   │
        │  build graph → run formulas  │─────────────────────┘
        │  → WorldDiff / WorldVersion  │
        │  → Provenance per node       │
        └───────┬───────────────┬──────┘
                │               │
                ▼               ▼
   ┌────────────────────┐  ┌──────────────────────┐
   │ @hsi/timeline-     │  │ @hsi/counterfactuals │
   │ engine (events)    │  │ (impact chains)      │
   └─────────┬──────────┘  └──────────┬───────────┘
             │                        │
             └──────────┬─────────────┘
                        ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ Supabase (Postgres + RLS) — migration 0005                     │
        │  worlds · simulations · simulation_versions · scenarios ·      │
        │  counterfactuals · world_timelines · simulation_provenance     │
        │  RLS: owner / reviewer+admin / public (simulation_is_public)   │
        └──────────────────────────────────────────────────────────────┘
```

## 10. Observability, provenance & traceability

WorldForge inherits HSI's observability posture. Per-node `Provenance` is the
simulation analogue of HSI's claim-to-source traceability: it lets a reviewer
step through any derived value back to its inputs and scientific basis, the way a
**`sem_debug`-style** semantic debugger resolves a value back to the line that
produced it. The propagation model and explicit dependency graph are influenced
by **Interpretable Causal Models (ICM)** work
([arXiv:2603.16021](https://arxiv.org/abs/2603.16021)), which motivates treating
each computed property as an interpretable causal node rather than an opaque
output. Every world the platform publishes carries its full provenance trail and
Scientific Confidence tiers, so simulated claims are as inspectable as the
real-world signals HSI already tracks.
