import { test } from 'node:test';
import assert from 'node:assert/strict';

import { captureNarrativeSnapshot } from '@hsi/temporal-intelligence';
import type {
  NarrativeForecast,
  NarrativeSnapshot,
  NarrativeStats,
} from '@hsi/temporal-intelligence';

import {
  backtestForecasts,
  calibrateConfidence,
  computeForecastAccuracy,
  deriveActualState,
} from '../src/validation';
import type { BacktestRecord } from '../src/types';

const NOW = '2026-03-01T00:00:00.000Z';

function snap(s: Partial<NarrativeStats>): NarrativeSnapshot {
  const base: NarrativeStats = {
    narrativeId: 'n',
    signalCount: 20,
    sourceCount: 3,
    communityCount: 2,
    amplificationScore: 50,
    reliabilityScore: 50,
    supportRatio: 0.5,
    contradictionRatio: 0.2,
  };
  return captureNarrativeSnapshot({ ...base, ...s }, NOW);
}

function fc(
  type: NarrativeForecast['forecastType'],
  prob: number,
  id = 'f',
): NarrativeForecast {
  return { id, narrativeId: 'n', forecastType: type, probability: prob, reasoning: [], generatedAt: NOW };
}

// ---- deriveActualState ------------------------------------------------------

test('deriveActualState: strong growth => rising', () => {
  const r = deriveActualState(snap({ signalCount: 20 }), snap({ signalCount: 40 }));
  assert.equal(r.state, 'rising');
  assert.ok(r.growthPct >= 20);
});

test('deriveActualState: strong decline => declining', () => {
  const r = deriveActualState(snap({ signalCount: 30 }), snap({ signalCount: 12 }));
  assert.equal(r.state, 'declining');
});

test('deriveActualState: flat => stable', () => {
  const r = deriveActualState(snap({ signalCount: 20 }), snap({ signalCount: 21 }));
  assert.equal(r.state, 'stable');
});

test('deriveActualState: collapse to zero => dead', () => {
  const r = deriveActualState(snap({ signalCount: 20 }), snap({ signalCount: 0 }));
  assert.equal(r.state, 'dead');
});

// ---- backtestForecasts ------------------------------------------------------

test('backtest: confident + correct => low errorScore', () => {
  const recs = backtestForecasts(
    [
      {
        forecast: fc('rising', 0.9, 'a'),
        priorSnapshot: snap({ signalCount: 20 }),
        actualSnapshotAfter: snap({ signalCount: 40 }),
      },
    ],
    NOW,
  );
  assert.equal(recs[0].predictedState, 'rising');
  assert.equal(recs[0].actualState, 'rising');
  assert.equal(recs[0].actualProbability, 1);
  // (0.9 - 1)^2 = 0.01
  assert.ok(Math.abs(recs[0].errorScore - 0.01) < 1e-9, `err ${recs[0].errorScore}`);
});

test('backtest: confident + WRONG => high errorScore (≈0.81)', () => {
  const recs = backtestForecasts(
    [
      {
        forecast: fc('rising', 0.9, 'b'),
        priorSnapshot: snap({ signalCount: 20 }),
        actualSnapshotAfter: snap({ signalCount: 21 }), // actually stable
      },
    ],
    NOW,
  );
  assert.equal(recs[0].predictedState, 'rising');
  assert.equal(recs[0].actualState, 'stable');
  assert.equal(recs[0].actualProbability, 0);
  assert.ok(Math.abs(recs[0].errorScore - 0.81) < 1e-9, `err ${recs[0].errorScore}`);
});

test('backtest: errorScore is in [0,1] and forecastId preserved', () => {
  const recs = backtestForecasts(
    [
      {
        forecast: fc('declining', 0.5, 'zz'),
        priorSnapshot: snap({ signalCount: 30 }),
        actualSnapshotAfter: snap({ signalCount: 10 }),
      },
    ],
    NOW,
  );
  assert.equal(recs[0].forecastId, 'zz');
  assert.ok(recs[0].errorScore >= 0 && recs[0].errorScore <= 1);
});

test('backtest: empty history => empty records', () => {
  assert.deepEqual(backtestForecasts([], NOW), []);
});

test('backtest is deterministic', () => {
  const h = [
    {
      forecast: fc('rising', 0.7),
      priorSnapshot: snap({ signalCount: 20 }),
      actualSnapshotAfter: snap({ signalCount: 40 }),
    },
  ];
  assert.deepEqual(backtestForecasts(h, NOW), backtestForecasts(h, NOW));
});

// ---- computeForecastAccuracy ------------------------------------------------

function rec(
  predicted: string,
  actual: string,
  prob: number,
): BacktestRecord {
  return {
    narrativeId: 'n',
    predictedState: predicted,
    predictedProbability: prob,
    actualState: actual,
    actualProbability: predicted === actual ? 1 : 0,
    errorScore: Math.pow(prob - (predicted === actual ? 1 : 0), 2),
  };
}

test('accuracy: fraction correct computed exactly', () => {
  const recs = [
    rec('rising', 'rising', 0.8),
    rec('rising', 'stable', 0.8),
    rec('stable', 'stable', 0.6),
    rec('declining', 'declining', 0.7),
  ];
  const a = computeForecastAccuracy(recs, 'n', '7d');
  assert.equal(a.predictionCount, 4);
  assert.equal(a.accuracyScore, 0.75); // 3/4
});

test('accuracy: calibrationScore = 1 - |meanConf - accuracy|', () => {
  const recs = [
    rec('rising', 'rising', 0.5),
    rec('stable', 'rising', 0.5),
  ]; // accuracy 0.5, meanConf 0.5 => perfectly calibrated
  const a = computeForecastAccuracy(recs, 'n', '7d');
  assert.equal(a.accuracyScore, 0.5);
  assert.equal(a.calibrationScore, 1);
});

test('accuracy: overconfident set has lower calibrationScore', () => {
  const recs = [
    rec('rising', 'stable', 0.9),
    rec('rising', 'stable', 0.9),
  ]; // accuracy 0, meanConf 0.9 => calibration 1-0.9 = 0.1
  const a = computeForecastAccuracy(recs, 'n', '7d');
  assert.equal(a.accuracyScore, 0);
  assert.ok(Math.abs(a.calibrationScore - 0.1) < 1e-9);
});

test('accuracy: empty records => zeros', () => {
  const a = computeForecastAccuracy([], 'n', '7d');
  assert.equal(a.predictionCount, 0);
  assert.equal(a.accuracyScore, 0);
  assert.equal(a.calibrationScore, 0);
});

// ---- calibrateConfidence ----------------------------------------------------

function overconfidentSet(): BacktestRecord[] {
  return [
    // HIGH band, stated ~0.9, only ~50% correct.
    rec('rising', 'rising', 0.9),
    rec('rising', 'stable', 0.9),
    rec('rising', 'declining', 0.9),
    rec('declining', 'declining', 0.9),
    // MEDIUM band, roughly calibrated.
    rec('stable', 'stable', 0.5),
    rec('rising', 'rising', 0.5),
    rec('stable', 'rising', 0.5),
    // LOW band.
    rec('declining', 'stable', 0.3),
    rec('stable', 'stable', 0.3),
  ];
}

test('calibration: high band stated ~0.9 / ~50% correct gets adjustment < 1', () => {
  const cal = calibrateConfidence(overconfidentSet());
  const high = cal.bands.find((b) => b.band === 'high')!;
  assert.ok(high.statedConfidence > 0.85, `stated ${high.statedConfidence}`);
  assert.ok(high.empiricalAccuracy <= 0.6, `empirical ${high.empiricalAccuracy}`);
  assert.ok(high.adjustment < 1, `adjustment ${high.adjustment}`);
});

test('calibration: bands are ordered low < medium < high (stated)', () => {
  const cal = calibrateConfidence(overconfidentSet());
  const low = cal.bands.find((b) => b.band === 'low')!;
  const med = cal.bands.find((b) => b.band === 'medium')!;
  const high = cal.bands.find((b) => b.band === 'high')!;
  assert.ok(low.statedConfidence < med.statedConfidence);
  assert.ok(med.statedConfidence < high.statedConfidence);
});

test('calibration: overconfidenceIndex > 0 for an overconfident set', () => {
  const cal = calibrateConfidence(overconfidentSet());
  assert.ok(cal.overconfidenceIndex > 0, `oci ${cal.overconfidenceIndex}`);
});

test('calibrate(raw): pulls a high raw confidence DOWN (never above raw) for overconfident band', () => {
  const cal = calibrateConfidence(overconfidentSet());
  const out = cal.calibrate(0.9);
  assert.equal(out.band, 'high');
  assert.ok(out.calibrated < 0.9, `calibrated ${out.calibrated}`);
  assert.ok(out.calibrated >= 0, 'non-negative');
});

test('calibrate never exceeds raw for any band (adjustment ≤ 1)', () => {
  const cal = calibrateConfidence(overconfidentSet());
  for (const raw of [0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
    const out = cal.calibrate(raw);
    assert.ok(out.calibrated <= raw + 1e-9, `raw ${raw} -> ${out.calibrated}`);
  }
});

test('calibrate is monotonic in raw confidence within a band', () => {
  const cal = calibrateConfidence(overconfidentSet());
  // Within the high band, more raw => more calibrated (adjustment is constant).
  const a = cal.calibrate(0.7).calibrated;
  const b = cal.calibrate(0.8).calibrated;
  const c = cal.calibrate(0.9).calibrated;
  assert.ok(a <= b && b <= c, `${a} ${b} ${c}`);
});

test('calibrate is monotonic non-decreasing WITHIN each band', () => {
  const cal = calibrateConfidence(overconfidentSet());
  // Cross-band non-monotonicity is intended (an aggressively-discounted high band
  // can dip below an un-discounted medium band) — that is the whole point of
  // pulling overconfidence down. So we assert monotonicity within each band only.
  const bands: [number, number][] = [
    [0.0, 0.39], // low
    [0.4, 0.65], // medium
    [0.66, 1.0], // high
  ];
  for (const [lo, hi] of bands) {
    let prev = -1;
    for (let raw = lo; raw <= hi + 1e-9; raw += 0.02) {
      const out = cal.calibrate(raw).calibrated;
      assert.ok(out >= prev - 1e-9, `band[${lo},${hi}] non-decreasing at ${raw}: ${out} < ${prev}`);
      prev = out;
    }
  }
});

test('calibration: well-calibrated set leaves confidence ~unchanged', () => {
  const recs = [
    rec('rising', 'rising', 0.9),
    rec('rising', 'rising', 0.9),
    rec('declining', 'declining', 0.88),
    rec('stable', 'stable', 0.9),
  ]; // high band all correct => adjustment 1
  const cal = calibrateConfidence(recs);
  const high = cal.bands.find((b) => b.band === 'high')!;
  assert.equal(high.adjustment, 1);
  assert.equal(cal.calibrate(0.9).calibrated, 0.9);
});

test('calibration: empty records => neutral (adjustment 1, oci 0)', () => {
  const cal = calibrateConfidence([]);
  assert.equal(cal.overconfidenceIndex, 0);
  cal.bands.forEach((b) => assert.equal(b.adjustment, 1));
  assert.equal(cal.calibrate(0.9).calibrated, 0.9);
});

test('calibration is deterministic', () => {
  const recs = overconfidentSet();
  const a = calibrateConfidence(recs);
  const b = calibrateConfidence(recs);
  assert.deepEqual(a.bands, b.bands);
  assert.equal(a.overconfidenceIndex, b.overconfidenceIndex);
});

test('calibrate band thresholds: high≥0.66, medium≥0.4, else low', () => {
  const cal = calibrateConfidence(overconfidentSet());
  assert.equal(cal.calibrate(0.66).band, 'high');
  assert.equal(cal.calibrate(0.5).band, 'medium');
  assert.equal(cal.calibrate(0.39).band, 'low');
});
