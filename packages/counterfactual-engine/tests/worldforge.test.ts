import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateCounterfactual } from '../src/counterfactual';
import { generateCounterfactualWorld } from '../src/worldforge';
import {
  counterfactualDemo,
  DEMO_CF_INPUTS,
  DEMO_BACKTEST_HISTORY,
  FIXTURE_NOW,
} from '../src/fixtures';

const NOW = FIXTURE_NOW;
const AI_JOBS = DEMO_CF_INPUTS.find((i) => i.narrativeId === 'ai-jobs')!;
const CRYPTO = DEMO_CF_INPUTS.find((i) => i.narrativeId === 'crypto-crash')!;

test('generateCounterfactualWorld populates title/summary/worldState/epochs/turningPoints', () => {
  const r = generateCounterfactual(AI_JOBS, { type: 'remove_source' }, NOW);
  const w = generateCounterfactualWorld(AI_JOBS, r, NOW);
  assert.ok(w.scenarioTitle.length > 0);
  assert.ok(/what if/i.test(w.scenarioTitle));
  assert.ok(w.scenarioSummary.length > 0);
  assert.ok(Object.keys(w.worldState).length >= 5, 'worldState has metrics');
  assert.ok(w.epochs.length >= 1);
  assert.ok(Array.isArray(w.turningPoints));
});

test('world title matches the scenario type (source removal question)', () => {
  const r = generateCounterfactual(AI_JOBS, { type: 'remove_source' }, NOW);
  const w = generateCounterfactualWorld(AI_JOBS, r, NOW);
  assert.match(w.scenarioTitle, /sources/i);
});

test('world title matches amplification scenario', () => {
  const r = generateCounterfactual(AI_JOBS, { type: 'reduce_amplification' }, NOW);
  const w = generateCounterfactualWorld(AI_JOBS, r, NOW);
  assert.match(w.scenarioTitle, /amplification/i);
});

test('confidence is carried from the result onto the world', () => {
  const r = generateCounterfactual(AI_JOBS, { type: 'remove_source' }, NOW);
  const w = generateCounterfactualWorld(AI_JOBS, r, NOW);
  assert.equal(w.confidence, r.confidence);
});

test('worldState reflects the altered (counterfactual) final metrics', () => {
  const r = generateCounterfactual(AI_JOBS, { type: 'remove_source' }, NOW);
  const w = generateCounterfactualWorld(AI_JOBS, r, NOW);
  const cfLast = r.counterfactual.frames.at(-1)!;
  assert.equal(w.worldState.finalSignals, cfLast.signals);
  assert.equal(w.worldState.finalAmplification, cfLast.amplification);
  assert.equal(w.worldState.finalForecastState, r.counterfactual.finalForecastState);
  assert.equal(w.worldState.baselineFinalForecastState, r.original.finalForecastState);
});

test('epochs include Origin and Outcome for a multi-frame timeline', () => {
  const r = generateCounterfactual(AI_JOBS, { type: 'remove_source' }, NOW);
  const w = generateCounterfactualWorld(AI_JOBS, r, NOW);
  const labels = w.epochs.map((e) => e.label);
  assert.ok(labels.includes('Origin'));
  assert.ok(labels.includes('Outcome'));
});

test('forecast-flipping scenario yields a turning point + flip noted in outcome', () => {
  const r = generateCounterfactual(AI_JOBS, { type: 'remove_source', magnitude: 2 }, NOW);
  assert.equal(r.deltas.forecastChanged, true);
  const w = generateCounterfactualWorld(AI_JOBS, r, NOW);
  assert.ok(w.turningPoints.length >= 1, 'a turning point is recorded');
  const outcome = w.epochs.find((e) => e.label === 'Outcome')!;
  assert.match(outcome.summary, /vs .* in reality/);
});

test('worldforge is pure (no mutation of inputs) + deterministic', () => {
  const r = generateCounterfactual(CRYPTO, { type: 'increase_contradiction' }, NOW);
  const snapshot = JSON.stringify(r);
  const w1 = generateCounterfactualWorld(CRYPTO, r, NOW);
  const w2 = generateCounterfactualWorld(CRYPTO, r, NOW);
  assert.deepEqual(w1, w2);
  assert.equal(JSON.stringify(r), snapshot, 'result not mutated');
});

// ---- end-to-end demo --------------------------------------------------------

test('counterfactualDemo() runs the full chain end-to-end', () => {
  const out = counterfactualDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.ok(out.counterfactuals.length >= 2);
  assert.ok(out.interventions.length >= 2);
  assert.equal(out.worlds.length, out.counterfactuals.length);
  assert.equal(out.backtest.length, DEMO_BACKTEST_HISTORY.length);
  assert.ok(out.accuracy.predictionCount === out.backtest.length);
  assert.equal(out.calibration.bands.length, 3);
});

test('demo: every counterfactual carries confidence + limitations + evidence', () => {
  const out = counterfactualDemo();
  for (const c of [...out.counterfactuals, ...out.interventions]) {
    assert.ok(c.confidence > 0 && c.confidence <= 0.9);
    assert.ok(c.limitations.length >= 1);
    assert.ok(c.evidence.length >= 1);
    assert.ok(c.reasoning.length >= 1);
  }
});

test('demo: backtest contains the overconfident high-band case and calibration pulls it down', () => {
  const out = counterfactualDemo();
  const high = out.calibration.bands.find((b) => b.band === 'high')!;
  assert.ok(high.statedConfidence > 0.8, `stated ${high.statedConfidence}`);
  assert.ok(high.empiricalAccuracy < high.statedConfidence, 'overconfident high band');
  assert.ok(high.adjustment < 1);
  assert.ok(out.calibration.overconfidenceIndex > 0);
  assert.ok(out.calibratedSample.calibrated < out.calibratedSample.raw, 'pulled down');
});

test('demo: at least one counterfactual flips the forecast (downgrade case)', () => {
  const out = counterfactualDemo();
  assert.ok(
    out.counterfactuals.some((c) => c.deltas.forecastChanged),
    'a demo counterfactual demonstrates a forecast flip',
  );
});

test('demo: every world has a non-empty title, summary, worldState, epochs', () => {
  const out = counterfactualDemo();
  for (const w of out.worlds) {
    assert.ok(w.scenarioTitle.length > 0);
    assert.ok(w.scenarioSummary.length > 0);
    assert.ok(Object.keys(w.worldState).length >= 5);
    assert.ok(w.epochs.length >= 1);
    assert.ok(w.confidence > 0 && w.confidence <= 0.9);
  }
});

test('demo is fully deterministic', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(stripFns(counterfactualDemo()))),
    JSON.parse(JSON.stringify(stripFns(counterfactualDemo()))),
  );
});

// calibrate() is a function; strip it before deep-equal serialization.
function stripFns(o: ReturnType<typeof counterfactualDemo>) {
  return {
    ...o,
    calibration: { bands: o.calibration.bands, overconfidenceIndex: o.calibration.overconfidenceIndex },
  };
}
