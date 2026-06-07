# Chronid Prime — A WorldForge Demonstration

Chronid Prime is the flagship WorldForge demonstration world: a frozen
super-earth around a dim, long-lived star, inhabited by crystal-genetic life
whose cognition runs on geological-scale neural networks. It exists to exercise
every part of the engine — the dependency graph, dynamic recalculation,
timelines, counterfactuals, the Temporal Niche Engine, and the Scientific
Confidence ladder — end to end.

> **Tone & scope.** This is an *illustrative speculative-science* writeup. The
> numbers are order-of-magnitude and **not peer-reviewed**; their purpose is to
> show a fully traceable causal world. See
> [`WORLDFORGE-SCIENCE.md`](WORLDFORGE-SCIENCE.md) for the relations and the
> confidence ladder, and [`../architecture/WORLDFORGE.md`](../architecture/WORLDFORGE.md)
> for the engine.

---

## 1. Parameters

| Property | Value (illustrative) | Tier |
| --- | --- | --- |
| Universe type | `alternative-constants` | — |
| Host star | M-dwarf, ~0.3 M☉, L ≈ 0.013 L☉ | known-science |
| Stellar lifetime | ~10¹¹ years (≫ Sun's ~10¹⁰) | known-science |
| Planet | Super-earth, surface gravity ≈ 2.4 g | known-science |
| Surface temperature | ≈ 64 K (frozen; no liquid water) | known-science |
| Solvent / chemistry | Ammonia / cryogenic mixes; silicate-lattice metabolism | plausible→speculative |
| Genetics | Crystal-lattice replication (not DNA) | speculative |
| Neural substrate | Planet-scale **geological neural network** | speculative |
| Cognition | Deep-time: subjective "day" ≈ **1000 Earth years** | speculative |
| Civilization age | ~10⁹ years (billion-year civilization) | speculative |
| Kardashev | ≈ 1.2 | speculative |

## 2. Dependency-graph highlights

The graph makes the world's internal logic explicit. Key load-bearing chains:

```
Star(M-dwarf, low L) ──► Luminosity(0.013 L☉) ──► OrbitZone / Flux ──► Planet.Temperature(64 K)
Planet.Temperature(64 K) + Chemistry.Solvent ──► viable cryo solvent ──► Metabolism(silicate)
Metabolism(silicate) ──► Replication(crystal-lattice) ──► Genetics ──► CellStructure
CellStructure ──► (geological-scale) ──► Biology.NeuralSubstrate ──► Intelligence(deep-time)
Intelligence(deep-time) ──► Civilization.{Society, Mathematics, Technology, RiskManagement}
Star.Lifetime(10¹¹ yr) ──► Civilization.AgeHorizon (room for a billion-year arc)
```

Two things stand out:

1. **The cold, dim star is what makes everything else possible.** Its low
   luminosity yields the 64 K surface (so the cryogenic chemistry is viable) *and*
   its ~10¹¹-year lifetime gives a billion-year civilization room to exist. Both
   are `known-science` nodes; the speculative tier only enters at the biology.
2. **Genetics → neural substrate → cognition is the speculative spine.** Each is
   tagged `speculative` in `simulation_provenance`, so a reviewer sees exactly
   where the world leaves established science.

## 3. The billion-year timeline (`kind = civilization`)

| Time (yr) | Event |
| --- | --- |
| 0 | Crystal-lattice replication stabilizes in the cryogenic crust. |
| ~10⁷ | Geological neural networks reach planetary scale. |
| ~10⁸ | Deep-time civilization emerges; the first subjective "day" passes. |
| ~10⁹ | Billion-year civilization; Kardashev ≈ 1.2. |
| ~10¹¹ | Stellar end-of-life horizon (the dominant long-term risk). |

Because cognition runs on a ~1000-Earth-year subjective day, the *entire* recorded
human-history span would pass within a handful of Chronid "moments" — the timeline
is best read on a logarithmic clock.

## 4. Counterfactuals

### 4.1 "What if the host star were Sun-like (G2V)?"

```
star.class: M-dwarf → G2V
  ├─ star.lifetime:    ~10¹¹ yr → ~10¹⁰ yr   (10× shorter)
  ├─ planet.temp:      64 K → thaws          (cryo-chemistry fails)
  ├─ biology.substrate: geological network destabilizes
  └─ civilization.ageHorizon: billion-year arc no longer fits stellar lifetime
```
A Sun-like star is brighter and far shorter-lived: it thaws the planet (breaking
the cryogenic silicate chemistry the biology depends on) and would not last long
enough to host a billion-year deep-time civilization. *Affected nodes: 4;
confidence ≈ 0.40.*

### 4.2 "What if surface gravity were Earth-like (1 g)?"

```
planet.gravity: 2.4 g → 1.0 g
  ├─ atmosphere:       lower retention of light gases
  ├─ biology.morphology: taller, less compressed structures viable
  └─ civilization.technology: orbital launch dramatically cheaper
```
Lower gravity relaxes the launch-energy gate, so a 1 g Chronid civilization would
reach orbit far more easily — its deep-time pace, not its gravity, would become
the limiting factor for spaceflight. *Affected nodes: ~3; confidence ≈ 0.5.*

### 4.3 "What if the world were warm (≈ 290 K) instead of frozen?"

```
planet.temp: 64 K → 290 K
  ├─ chemistry.solvent: cryo mixes → water becomes viable
  ├─ replication:       crystal-lattice → DNA-like favored
  └─ intelligence:      deep-time cognition → fast (Earth-like) cognition
```
Warming the world collapses the entire premise: water-based chemistry and
DNA-like replication dominate, and cognition shifts to a fast clock — i.e. it
stops being Chronid Prime and becomes an Earth-like world. *Affected nodes: many;
confidence ≈ 0.45.*

## 5. Risk analysis

| Risk | Horizon | Severity |
| --- | --- | --- |
| Stellar end-of-life | ~10¹¹ yr | Eventual but certain; dominant deep-time risk. |
| Fast environmental shock (impact, rapid climate perturbation) | any time | **High relative to cognition** — see §6: the civilization cannot respond on sub-century timescales. |
| Crystal-lattice mutation / decoherence | deep time | Moderate; slow-acting, matched to slow cognition. |

The defining risk is **temporal mismatch**: anything that changes faster than a
~1000-year subjective day is effectively un-respondable for Chronid life.

## 6. Temporal-adaptation result

Running the Temporal Niche Engine (`C(t) ≈ E(t)`):

- Against **geological-scale** environmental change, `C(t) ≈ E(t)` →
  **balanced**. The slow cognition is well-matched to a slowly changing frozen
  world. (This is the regime the world normally lives in.)
- Against **fast** (sub-century) environmental change, `C(t) ≪ E(t)` →
  **under-adapted**. A rapid perturbation unfolds far faster than the civilization
  can perceive or act.

**Reported result:** *under-adapted to fast environments, balanced to geological
ones.* The headline Temporal Adaptation Score for the genesis snapshot is ≈ 38
(weighted toward the fast-change failure mode), with the explicit note that the
same world scores near-balanced when evaluated purely on geological-rate change.

This is the demonstration's punchline: Chronid Prime is not "badly adapted" — it
is *exquisitely* adapted to its own deep-time niche and dangerously mismatched to
any faster one, and WorldForge shows exactly why, node by node, with provenance.
