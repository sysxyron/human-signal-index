# WorldForge Scientific Methodology

This document defines the scientific relations, scoring models, and confidence
framework WorldForge uses to derive a world from its inputs. It is the
methodology counterpart to
[`../architecture/WORLDFORGE.md`](../architecture/WORLDFORGE.md).

> **Important — scope of the numbers.** WorldForge scores and derived values are
> **illustrative / order-of-magnitude** estimates intended to make causal
> relationships legible. They are **not peer-reviewed** and must not be cited as
> authoritative astrophysical, planetary-science, or astrobiology results. The
> value of the system is the *traceable chain of reasoning*, not point-precise
> predictions.

Related: [`README.md`](README.md) (HSI methodology, ICM + traceability) ·
[`CHRONID-PRIME.md`](CHRONID-PRIME.md)

---

## 1. Stellar relations

| Quantity | Relation used | Notes |
| --- | --- | --- |
| Luminosity | `L ∝ M^3.5` (solar units) | Main-sequence mass–luminosity relation; tier **known-science**. |
| Main-sequence lifetime | `t ∝ M / L  ∝ M^{-2.5}` | Low-mass stars live far longer (M-dwarfs ≫ Sun). |
| Habitable-zone distance | `d_HZ ∝ √L` | Inner/outer edges scale with the square root of luminosity. |
| Radiation / flux at planet | `F ∝ L / d²` | Incident flux falls with the square of orbital distance. |

These set the stellar context (`Star → Radiation/Luminosity/OrbitZone`) that
downstream planet/biology nodes consume.

## 2. Planetary relations

| Quantity | Relation used | Notes |
| --- | --- | --- |
| Surface gravity | `g = M / R²` (Earth units) | Drives atmosphere retention and biology morphology. |
| Escape velocity | `v_esc = √(2 G M / R)` | Governs whether the atmosphere can be held. |
| Equilibrium temperature | `T_eq = [ L (1 − A) / (16 π σ d²) ]^{1/4}` | From incident flux and albedo `A`. |
| Greenhouse adjustment | `T_surf = T_eq + ΔT_greenhouse` | Additive offset from atmospheric composition/pressure. |
| Atmospheric escape / retention | **Jeans escape**: a species is retained when `v_esc` greatly exceeds the thermal speed `√(2 k T / m)` (roughly `v_esc / v_thermal ≳ 6`). | Lighter gases at higher temperature escape first. |

So `Planet → Gravity/Atmosphere/Temperature/Magnetosphere` are all derivable from
star + planet inputs, each with its own provenance.

## 3. Chemistry & biology gating

| Step | Model |
| --- | --- |
| Solvent viability | Each candidate solvent (water, ammonia, methane, cryo-mixes) has a **liquid temperature range** at the planet's pressure. A solvent is viable only if `T_surf` falls inside that range. |
| Metabolism | Selected from the viable solvent + available chemistry (e.g. carbon–oxygen with water; silicate-lattice in cold cryo regimes). |
| Replication | A replication substrate (DNA-like, crystal-lattice, etc.) is gated by chemistry stability at `T_surf`. |
| Cell structure / genetics / evolution | Follow from solvent + temperature + replication substrate. |
| Intelligence | Emerges from the evolution node when complexity thresholds are met; feeds the Temporal Niche Engine (§5) and civilization. |

`Chemistry → Solvent/Metabolism/Replication` and
`Biology → CellStructure/Genetics/Evolution/Intelligence` are the relevant graph
edges.

## 4. Civilization & technology gating

Civilization capability is gated by available energy and accumulated knowledge:

- **Kardashev scale** `K = (log10 P − 6) / 10` (with `P` in watts) classifies a
  civilization by power use (Type I ≈ planetary, II ≈ stellar, III ≈ galactic).
- **Technology gating** unlocks capabilities only when their prerequisites exist
  (e.g. orbital launch requires escape-velocity-feasible energetics; certain
  technologies require prior mathematics/society nodes). High surface gravity, for
  instance, can gate spaceflight by making orbit prohibitively expensive.

`Civilization → Society/Laws/Mathematics/Technology/RiskManagement`.

## 5. The Temporal Niche Engine v2

The Temporal Niche Engine models how well a form of intelligence is matched to
the **rate of change of its environment**. It compares two rates:

- `C(t)` — the **cognitive response rate**: how fast the intelligence can perceive,
  decide, and act.
- `E(t)` — the **environmental change rate**: how fast the world around it changes.

The core idea is a balance condition `C(t) ≈ E(t)`. From the ratio we derive a
**Temporal Adaptation Score (0–100)** and a label:

| Condition | Label | Meaning |
| --- | --- | --- |
| `C(t) ≪ E(t)` | **under-adapted** | The environment changes faster than the mind can respond (can't keep up). |
| `C(t) ≈ E(t)` | **balanced** | Response rate matches environmental change — well-fitted niche. |
| `C(t) ≫ E(t)` | **over-reactive** | The mind churns far faster than anything around it changes (wasted/over-reactive). |

Score is highest near balance and falls off toward either extreme.

**The Chronid case.** Chronid Prime's geological-network cognition operates on a
deep-time clock (a subjective "day" ≈ 1000 Earth years). Against *geological-scale*
environmental change `E(t)` it is **balanced** — its slow cognition matches a
slowly changing frozen world. But against *fast* (sub-century) environmental
change it is sharply **under-adapted**: a rapid perturbation would unfold far
faster than it could perceive or respond. WorldForge therefore reports Chronid
Prime as "under-adapted to fast environments, balanced to geological ones."

## 6. The Scientific Confidence ladder

Every computed node carries a Scientific Confidence **tier**, color-coded for the
dashboard, so a reader can see at a glance how grounded a claim is:

| Tier | Color (approx.) | Meaning |
| --- | --- | --- |
| **known-science** | green `#2e7d32` | Standard, well-established physics/relations (e.g. `L ∝ M^3.5`). |
| **plausible-science** | lime `#9e9d24` | Reasonable extrapolation within accepted science; not directly observed. |
| **speculative** | amber `#f9a825` | Internally consistent but well beyond current evidence (e.g. crystal genetics). |
| **fictional** | orange `#ef6c00` | Narrative device with no scientific basis; flagged as such. |
| **violates-known-physics** | red `#c62828` | Contradicts established physics; surfaced explicitly, never hidden. |

This ladder is the simulation analogue of HSI's traceability verdicts: it keeps
*what is solid* visibly separate from *what is imagined*.

## 7. The Universe Forge constant-multiplier model

To explore non-Earth physics, the **Universe Forge** applies a set of
**constant multipliers** to the physical constants before any formula runs,
selected by `UniverseType`:

| UniverseType | Effect (illustrative) |
| --- | --- |
| `standard-physics` | All multipliers = 1 (Earth/Sol baseline; used for calibration). |
| `alternative-constants` | User-tunable multipliers on `G`, `c`, fine-structure, etc. |
| `high-gravity` | Scales gravitational coupling / body-plan and launch costs. |
| `low-entropy` | Slows thermodynamic decay; extends viable lifetimes. |
| `exotic-matter` | Permits otherwise-disallowed chemistries/structures. |
| `user-defined` | Fully custom multiplier set. |

Because the multipliers are applied **before** the §1–§4 relations, the same
dependency graph and the same formulas run unchanged; only the constants differ.
Every Universe-Forge world records its multiplier set in provenance so the
departure from standard physics is explicit and reproducible — and any node that
ends up contradicting baseline physics is tagged `violates-known-physics`.
