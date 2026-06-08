# @hsi/temporal-intelligence

**"Git history for ideas."** The narrative memory / evolution engine for
WorldForge / HSI (Phase 10). It snapshots PUBLIC narratives over time, diffs them
into an explainable evolution log, builds a genealogy ("family tree of ideas") and
a directed influence network, and produces **probabilistic, explainable**
trajectory forecasts.

## Principles (binding)

- **Pure & deterministic.** Callers inject `now` (and an optional `seed`). There
  is **no** `Date.now()` / `Math.random()` in any logic path. Same inputs →
  identical outputs.
- **Offline.** Fixtures + local heuristics only — no OpenAI, no Supabase.
  Embeddings are injected; the deterministic `localLexicalEmbed` fallback is used
  otherwise.
- **Zero runtime deps** beyond the `@hsi` workspace.
- **Honest.** Forecasts are probability distributions, never certainties. Thin
  data widens the distribution and says so in the reasoning. No truth is
  asserted — every output is a triage/decision aid for a **human** reviewer.

## Public API (by module)

### `snapshots.ts`

- `captureNarrativeSnapshot(stats, now, opts?) → NarrativeSnapshot`
- `statsFromNarrative(narrative, signals, extras?) → NarrativeStats`
- `captureSnapshots(narratives, signals, now, cadence) → NarrativeSnapshot[]`
- `dueForCadence(lastCapturedAt, now, cadence) → boolean`
- `CADENCE_DAYS: Record<SnapshotCadence, number>` — `daily:1, weekly:7, monthly:30`

### `evolution.ts`

- `computeNarrativeEvolution(prev, curr, now) → EvolutionRecord`
- `evolutionSeries(snapshots, now) → EvolutionRecord[]` (pairwise, time-ordered)
- `signalVelocity(snapshots) → number` (signals/day over the window)
- `amplificationAcceleration(snapshots) → number` (2nd derivative of amplification)

### `genealogy.ts`

- `buildNarrativeGenealogy(narratives, signals, deps) → Promise<GenealogyEdge[]>`

### `influence.ts`

- `buildInfluenceNetwork(narratives, snapshots, signals, deps) → InfluenceEdge[]`
- `topInfluencers(edges, k?) → { narrativeId, outScore }[]`

### `forecast.ts`

- `forecastNarrativeTrajectory({ narrativeId, snapshots, evolution, now }) → NarrativeForecast`

### `fixtures.ts`

- `DEMO_NARRATIVES`, `DEMO_SIGNALS`, `DEMO_SNAPSHOTS`, `FIXTURE_NOW`
- `temporalDemo(deps?) → Promise<TemporalDemoResult>` — runs the full chain offline.

## Heuristics & thresholds

### Evolution classification (first match wins)

| Type       | Rule |
|------------|------|
| `split`    | communityΔ ≥ 0 (breadth not shrinking) **and** (communityΔ ≥ `SPLIT_COMMUNITY_DELTA` (2) **or** sourceΔ ≥ `SPLIT_SOURCE_DELTA` (3)), **and** \|amplificationΔ\| ≥ `SPLIT_AMP_DELTA` (8) |
| `merge`    | communityΔ ≤ −1, growthPct > 0, sourceΔ > 0 (carriers converge, counts rise) |
| `mutation` | category changed, **or** \|contradictionΔ\| ≥ `MUTATION_CONTRADICTION_DELTA` (0.2) with \|growthPct\| < `GROWTH_PCT` |
| `growth`   | growthPct ≥ `GROWTH_PCT` (20) **or** amplificationΔ ≥ `GROWTH_AMP_DELTA` (10) |
| `decline`  | growthPct ≤ −20 **or** amplificationΔ ≤ −10 |
| (else)     | near-flat → dominant-delta sign, low confidence |

`growthPct = (curr.signalCount − prev.signalCount) / max(1, prev.signalCount) × 100`.
Confidence blends move **magnitude** (signals/amplification/breadth, saturated)
with **consistency** (do signal & amplification deltas agree in sign?).

### Genealogy rules (directed parent→child; parent strictly earlier by `firstSeenAt`)

| Relationship  | Rule (similarity = cosine over injected/lexical embeddings) |
|---------------|------------------------------------------------------------|
| `contradicts` | similarity ≥ `CONTRADICT_SIM` (0.5) + a contradiction marker in child + shared evidence |
| `merged_from` | child draws from ≥2 earlier parents (sim ≥ `MERGE_SIM` 0.55 + shared entities/sources with each) |
| `amplifies`   | sim ≥ `AMP_SIM` (0.5), ≥1 shared source, intensification marker in child (checked before split) |
| `split_from`  | sim ≥ `SPLIT_SIM` (0.6), shared evidence, child entities ≥ `SPLIT_SUBSET` (60%) subset of parent, child **strictly** smaller than parent (equal-size → derived_from) |
| `derived_from`| general case: sim ≥ `DERIVE_SIM` (0.55) + shared entities **or** sources |

Confidence = `0.55·similarity + 0.30·sharedFactor + 0.15·recency`. Threshold-gated
so unrelated narratives produce **no** edge.

### Influence score (directed A→B, A strictly earlier; 0..100)

`shared sources (≤30) + shared entities (≤25) + shared communities (≤15) +
time precedence (≤15, capped at a 30-day lead) + amplification transfer (15, if
A's amplification rose before B's growth onset)`. Edges below
`INFLUENCE_MIN_SCORE` (12) or with zero overlap are dropped. Never flows backward
in time.

### Forecast (distribution over 5 states; softmax, never certainty)

Drivers: signal velocity, last amplification delta + acceleration, community
growth, age, and staleness. `dead` dominates beyond `DEAD_STALE_DAYS` (21);
`emerging` needs age ≤ `YOUNG_DAYS` (14) + acceleration. Fewer than
`THIN_DATA_SNAPSHOTS` (3) snapshots **widens** the distribution (softmax temp 2.0)
and adds a low-confidence caveat. The argmax probability is capped at
`MAX_PROBABILITY` (0.92) with the excess redistributed — probabilities are always
< 1.0 and the distribution sums to ~1.

## Limitations

- Local lexical embeddings approximate semantics via hashed token/bigram bags;
  inject a real embedder via `deps.embed` for stronger similarity.
- Genealogy contradiction/amplification detection is lexical-marker based (English
  cues) — it flags candidates for review, not verdicts.
- Forecasts are short-horizon trend extrapolations, not causal predictions; treat
  every distribution as a hypothesis for a human to weigh.
- Time ordering relies on `firstSeenAt`; narratives without it are skipped for
  genealogy/influence pairing.
