# @hsi/calibration-engine

Confidence **calibration**, **reliability analysis**, **Brier scoring**, **drift
detection**, and **trust scoring** for HSI Phase 16. Answers two questions:

> **"What does 82% confidence actually mean?"** — by comparing stated confidence
> against the historical success rate of similar predictions.
>
> **"How trustworthy is this?"** — by blending accuracy, calibration, evidence,
> and review/governance outcomes into an explainable 0–100 trust score.

## Principles (binding)

- **Pure & deterministic** — callers inject `now`; NO `Date.now()` / `Math.random()`.
- **Fully offline** — fixtures + local heuristics; no network, no clocks, no keys.
- **Zero runtime deps** beyond the `@hsi` workspace.
- **Explainable, auditable, reproducible** — every score carries the numbers that
  produced it plus explicit `limitations`. Never opaque, never forces a score,
  never claims certainty, **never auto-acts** (drift only *recommends* recalibration).

## Modules & public API

### `calibration.ts`
- `BIN_EDGES`, `DEFAULT_BINS`
- `binIndex(confidence, bins?=10): number`
- `calibrate(predictions, opts?: { bins?; now? }): ReliabilityCurve`
- `confidenceMeaning(curve, confidence): { statedConfidence; historicalSuccess; sampleCount; sentence }`

### `reliability.ts`
- `computeReliabilityCurve(predictions, opts?: { bins?; now?; kind?; entityId? }): ReliabilityCurve`
- `reliabilityByKind(predictions, opts?): Record<kind, ReliabilityCurve>`
- `isWellCalibrated(curve, tolerance=0.1): boolean`

### `brier.ts`
- `computeBrierScore(predictions: { confidence; success }[], opts?: { bins? }): BrierResult`
- `brierByKind(predictions, opts?): Record<kind, BrierResult>`
- `BRIER_EXCELLENT`, `BRIER_GOOD`, `BRIER_FAIR`

### `drift.ts`
- `detectConfidenceDrift(current, prior?, opts?: { threshold?; now? }): ConfidenceDriftResult`
- `driftSeverity(result): 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'`
- `DEFAULT_DRIFT_THRESHOLD`

### `trust.ts`
- `computeTrustScore(inputs, opts?: { now? }): TrustScore`
- `sourceTrust / narrativeTrust / forecastTrust / decisionTrust(inputs, opts?)`
- `applyTrustOverride(base, { newScore; reason; by?; now }): TrustScore & { overridden; overrideReason }`
- `W_ACCURACY`, `W_CALIBRATION`, `W_EVIDENCE`, `W_GOVERNANCE`, `FULL_TRUST_SAMPLES`

### `fixtures.ts`
- `FIXTURE_NOW`, `DEMO_PREDICTIONS`, `DEMO_TRUST_INPUTS`
- `WELL_CALIBRATED`, `OVERCONFIDENT`, `UNDERCONFIDENT`, `driftFixtures()`
- `calibrationDemo()` — runs the full chain end-to-end.

## Formulas & thresholds

**Calibration**
- `calibrationError(bin) = |meanConfidence − observedSuccess|`
- `ECE = Σ (countᵢ / N) · errorᵢ` (count-weighted), `MCE = max errorᵢ`
- `overconfidenceIndex = mean(confidence − success)` (signed; + = overconfident)

**Brier** — `score = mean((confidence − success)²)` ∈ [0,1], lower better.
Quality: `excellent <0.10 ≤ good <0.18 ≤ fair <0.25 ≤ poor`; `<5` samples →
`insufficient_data`. Optional Murphy decomposition
`score = reliability − resolution + uncertainty`.

**Drift** (threshold default 0.1, priority order): `overconfidence`
(`overconfidenceIndex > +t`), `underconfidence` (`< −t`), `degradation`
(`ECE_now − ECE_prior > t`), `improvement` (`ECE_prior − ECE_now > t`), else
`stable`. Recommends recalibration only.

**Trust** — `0.40·accuracy + 0.25·calibration + 0.20·evidence + 0.15·governance-net`
in [0,1], each missing signal defaulting to neutral 0.5, then discounted toward
50 by `min(1, sampleCount/20)`. Bands: `high ≥70`, `medium ≥40`, else `low`.

## Limitations

- Bins need enough samples to be meaningful; thin bins are reported honestly, never fabricated.
- Brier quality is withheld (`insufficient_data`) below 5 samples.
- Trust scores are advisory and grounded only in supplied signals; absent signals are neutral assumptions, and small samples are pulled toward neutral with reduced confidence.
- Drift detection is advisory: it recommends recalibration and never auto-corrects.
