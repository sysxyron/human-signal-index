# @hsi/causal-intelligence

**"Why did it change?"** The causal-analysis + narrative-replay engine for
WorldForge / HSI (Phase 11). Where [`@hsi/temporal-intelligence`](../temporal-intelligence)
is "git history for ideas," this layer **explains** that history: it detects
causal **events** in a narrative's snapshot/evolution timeline, orders them into
explainable **chains**, **attributes** a % share of the observed change to each,
renders a **data-grounded** human explanation, builds a **replay** timeline (a
scrubber), and detects life-cycle **milestones** (birth → growth → viral → peak
→ decline → death → resurgence).

> grew **+400%** because: Source A published 14 articles, Community B amplified
> it, contradictions fell.

## Principles (binding)

- **Pure & deterministic.** Callers inject `now`. There is **no** `Date.now()` /
  `Math.random()` in any logic path — same inputs → identical outputs.
- **Offline.** Fixtures + local heuristics only — no network, no clocks, no keys.
- **Zero runtime deps** beyond the `@hsi` workspace (reuses `@hsi/temporal-intelligence`).
- **Never fabricate.** Every clause an event/explanation/milestone makes is tied
  to a concrete number from the input snapshots/evolution. Thin data **lowers
  confidence and says so** — it never invents a cause. Attribution leaves an
  explicit **"unexplained"** residual; it never forces 100%.

## Public API (by module)

### `events.ts`
- `detectCausalEvents(input: CausalInput): CausalEvent[]` — detect all threshold-gated causal events across the time-ordered history.
- Thresholds: `SIGNAL_SURGE_PCT` (50), `SIGNAL_SURGE_ABS` (3), `SOURCE_EXPANSION_DELTA` (2), `COMMUNITY_GROWTH_DELTA` (1), `AMP_SPIKE_DELTA` (12), `CONTRADICTION_DELTA` (0.08), `INFLUENCE_MIN` (50).

### `chains.ts`
- `buildCausalChains(events: CausalEvent[], input: CausalInput): CausalChain[]` — canonical **Growth cause** and **Decline cause** chains, ordered by causal precedence, with a summary listing the *actual* member events.

### `attribution.ts`
- `attributeChange(input: CausalInput, events: CausalEvent[]): ChangeAttribution` — rank by `strength × confidence`, assign % shares (sum ≤ `MAX_EXPLAINED` = 92), report an explicit `unexplained` residual. `primaryCauses` have share ≥ `PRIMARY_SHARE_MIN` (20).

### `explanation.ts`
- `explainNarrativeChange(input, events, chains): NarrativeChangeExplanation` — direction-aware, data-grounded paragraph + `factors[]`. Thin data → caveat + lowered confidence; no events → "inconclusive".

### `replay.ts`
- `buildReplayFrames(input: CausalInput, cadence: 'daily'|'weekly'|'monthly'): ReplayFrame[]` — one frame per (resampled) snapshot with state + active event types + forecast + change type.
- `frameForTimestamp(frames, ts)` — the active frame at a scrubber position.
- `milestoneFrames(frames, milestones)` — map milestones to their frames.

### `milestones.ts`
- `detectNarrativeMilestones(input: CausalInput, events: CausalEvent[]): NarrativeMilestone[]` — birth / growth / viral / peak / decline / death / resurgence.
- Thresholds: `GROWTH_STEPS` (2), `GROWTH_NET_PCT` (40), `VIRAL_SIGNAL_PCT` (100), `VIRAL_AMP_DELTA` (20), `DECLINE_STEPS` (2), `DEAD_STALE_DAYS` (21), `RESURGENCE_PCT` (50).

### `fixtures.ts`
- `DEMO_CAUSAL_INPUTS`, `FIXTURE_NOW`, `causalDemo(now?)` — runs the full chain (events → chains → attribution → explanation → replay → milestones) for every demo narrative. Fully offline.

## Heuristics

| Detector | Fires when | Strength scales with |
| --- | --- | --- |
| `signal_surge` | signals +≥50% and +≥3 abs | ratio (saturates at +500%) |
| `source_expansion` | sources +≥2 | source delta |
| `community_growth` | communities +≥1 | community delta |
| `amplification_spike` | amplification +≥12 | amplification delta |
| `contradiction_drop` / `contradiction_rise` | contradiction ratio swings ≥0.08 | swing magnitude |
| `forecast_shift` | per-step `ForecastState` changes | ordinal state distance |
| `influence_transfer` | strong inbound edge (≥50) coincides with growth | influence score |

Milestones recompute from snapshot runs: **growth/decline** require a monotone
run of `≥ GROWTH/DECLINE_STEPS` with net `≥ GROWTH_NET_PCT`; **viral** is one
step with `≥ VIRAL_SIGNAL_PCT` signals *and* `≥ VIRAL_AMP_DELTA` amplification;
**peak** is the global signal max followed by a fall; **death** is staleness
`≥ DEAD_STALE_DAYS` up to `now`; **resurgence** is a `≥ RESURGENCE_PCT` rise out
of a trough that followed a fall.

## Example

```ts
import { causalDemo } from '@hsi/causal-intelligence';

const out = causalDemo();
out.narratives.forEach((n) => {
  console.log(n.narrativeId, '—', n.explanation.headline);
  console.log(n.explanation.text);
});
```

## Limitations

- **Heuristic, not learned.** Thresholds are hand-tuned constants; they are tuned
  for triage, not statistical inference. Tune them to your domain.
- **Attribution is impact-proportional**, not a true causal decomposition — it
  reflects relative event magnitude/confidence, with an honest unexplained
  residual. It is a decision aid for a **human** reviewer, never a verdict.
- **Forecast-derived events** (`forecast_shift`) inherit the probabilistic nature
  of the temporal forecaster and carry deliberately moderate confidence.
- **No truth is asserted.** The engine explains observed *signal/source/community*
  dynamics; it does not judge whether a narrative is correct.

## Tests

`tests/` — 70 deterministic tests (`node:test` + `node:assert`, fixed `now`):
events (20), chains (10), attribution (10), replay (10), milestones + explanation
+ end-to-end demo (20).

```sh
node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test packages/causal-intelligence/tests/<file>
```
