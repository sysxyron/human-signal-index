import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evolutionSeries } from '../src/evolution';
import { forecastNarrativeTrajectory, MAX_PROBABILITY } from '../src/forecast';
import { captureNarrativeSnapshot } from '../src/snapshots';
import { temporalDemo, FIXTURE_NOW } from '../src/fixtures';
import type { ForecastState, NarrativeSnapshot, NarrativeStats } from '../src/types';

const NOW = '2026-02-01T00:00:00.000Z';
const STATES: ForecastState[] = ['emerging', 'rising', 'stable', 'declining', 'dead'];

function days(n: number): string {
  return new Date(Date.parse(NOW) - n * 86400000).toISOString();
}

function snap(ageDays: number, s: Partial<NarrativeStats>): NarrativeSnapshot {
  const base: NarrativeStats = {
    narrativeId: 'n',
    signalCount: 0,
    sourceCount: 0,
    communityCount: 0,
    amplificationScore: 0,
    reliabilityScore: 0,
    supportRatio: 0,
    contradictionRatio: 0,
  };
  return captureNarrativeSnapshot({ ...base, ...s }, days(ageDays));
}

function sumDist(dist: Record<ForecastState, number>): number {
  return STATES.reduce((a, s) => a + dist[s], 0);
}

test('distribution always sums to ~1 and probability never == 1', () => {
  const snaps = [
    snap(6, { signalCount: 1, amplificationScore: 20 }),
    snap(3, { signalCount: 6, amplificationScore: 40 }),
    snap(1, { signalCount: 14, amplificationScore: 65 }),
  ];
  const f = forecastNarrativeTrajectory({
    narrativeId: 'n',
    snapshots: snaps,
    evolution: evolutionSeries(snaps, NOW),
    now: NOW,
  });
  assert.ok(Math.abs(sumDist(f.distribution!) - 1) < 1e-6);
  for (const s of STATES) assert.ok(f.distribution![s] < 1.0);
  assert.ok(f.probability < 1.0);
  assert.ok(f.probability <= MAX_PROBABILITY + 1e-9);
});

test('rising/emerging argmax for accelerating young narrative', () => {
  const snaps = [
    snap(6, { signalCount: 1, sourceCount: 1, communityCount: 1, amplificationScore: 20 }),
    snap(3, { signalCount: 6, sourceCount: 2, communityCount: 1, amplificationScore: 40 }),
    snap(1, { signalCount: 16, sourceCount: 3, communityCount: 2, amplificationScore: 68 }),
  ];
  const f = forecastNarrativeTrajectory({
    narrativeId: 'n',
    snapshots: snaps,
    evolution: evolutionSeries(snaps, NOW),
    now: NOW,
  });
  assert.ok(
    f.forecastType === 'rising' || f.forecastType === 'emerging',
    `expected rising/emerging, got ${f.forecastType}`,
  );
});

test('emerging for very young + accelerating', () => {
  const snaps = [
    snap(5, { signalCount: 1, amplificationScore: 10 }),
    snap(3, { signalCount: 3, amplificationScore: 20 }),
    snap(1, { signalCount: 9, amplificationScore: 45 }),
  ];
  const f = forecastNarrativeTrajectory({
    narrativeId: 'n',
    snapshots: snaps,
    evolution: evolutionSeries(snaps, NOW),
    now: NOW,
  });
  // young + accelerating should have meaningful mass on emerging
  assert.ok(f.distribution!.emerging > 0.1);
  assert.ok(f.forecastType === 'emerging' || f.forecastType === 'rising');
});

test('dead for stale narrative (no recent activity)', () => {
  const snaps = [
    snap(60, { signalCount: 30, amplificationScore: 80 }),
    snap(50, { signalCount: 18, amplificationScore: 50 }),
    snap(40, { signalCount: 6, amplificationScore: 22 }),
  ];
  const f = forecastNarrativeTrajectory({
    narrativeId: 'n',
    snapshots: snaps,
    evolution: evolutionSeries(snaps, NOW),
    now: NOW,
  });
  assert.equal(f.forecastType, 'dead');
  assert.ok(f.reasoning.some((r) => r.toLowerCase().includes('no new snapshots')));
});

test('declining for sustained drop (not yet stale)', () => {
  const snaps = [
    snap(15, { signalCount: 30, amplificationScore: 70 }),
    snap(8, { signalCount: 20, amplificationScore: 50 }),
    snap(2, { signalCount: 12, amplificationScore: 35 }),
  ];
  const f = forecastNarrativeTrajectory({
    narrativeId: 'n',
    snapshots: snaps,
    evolution: evolutionSeries(snaps, NOW),
    now: NOW,
  });
  assert.ok(
    f.forecastType === 'declining' || f.forecastType === 'dead',
    `expected declining/dead, got ${f.forecastType}`,
  );
});

test('thin data widens distribution + notes uncertainty', () => {
  const snaps = [snap(2, { signalCount: 5, amplificationScore: 30 })];
  const f = forecastNarrativeTrajectory({
    narrativeId: 'n',
    snapshots: snaps,
    evolution: [],
    now: NOW,
  });
  assert.ok(f.reasoning.some((r) => r.toUpperCase().includes('THIN DATA')));
  // widened: the top probability should be modest (not peaked)
  assert.ok(f.probability < 0.6);
  assert.ok(Math.abs(sumDist(f.distribution!) - 1) < 1e-6);
});

test('empty snapshots → forecast still returns (thin, uncertain)', () => {
  const f = forecastNarrativeTrajectory({
    narrativeId: 'n',
    snapshots: [],
    evolution: [],
    now: NOW,
  });
  assert.ok(f.distribution);
  assert.ok(f.probability < 1.0);
  assert.ok(f.reasoning.some((r) => r.toUpperCase().includes('THIN DATA')));
});

test('deterministic: identical forecast across runs', () => {
  const snaps = [
    snap(6, { signalCount: 1, amplificationScore: 20 }),
    snap(3, { signalCount: 6, amplificationScore: 40 }),
    snap(1, { signalCount: 14, amplificationScore: 65 }),
  ];
  const args = {
    narrativeId: 'n',
    snapshots: snaps,
    evolution: evolutionSeries(snaps, NOW),
    now: NOW,
  };
  assert.deepEqual(
    forecastNarrativeTrajectory(args),
    forecastNarrativeTrajectory(args),
  );
});

test('temporalDemo: runs end-to-end and produces all outputs', async () => {
  const out = await temporalDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.ok(out.snapshots.length > 0);
  assert.ok(out.evolution.length > 0);
  assert.ok(out.genealogy.length > 0);
  assert.ok(out.influence.length > 0);
  assert.ok(out.forecasts.length > 0);
  // every forecast is a valid, non-certain distribution
  for (const f of out.forecasts) {
    assert.ok(f.probability < 1.0);
    assert.ok(Math.abs(sumDist(f.distribution!) - 1) < 1e-6);
  }
});

test('temporalDemo: deterministic across runs', async () => {
  const a = await temporalDemo();
  const b = await temporalDemo();
  assert.deepEqual(a.forecasts, b.forecasts);
  assert.deepEqual(a.evolution, b.evolution);
  assert.deepEqual(a.genealogy, b.genealogy);
  assert.deepEqual(a.influence, b.influence);
});

test('temporalDemo: crypto-crash forecasts dead, ai-jobs rising/emerging', async () => {
  const out = await temporalDemo();
  const crypto = out.forecasts.find((f) => f.narrativeId === 'crypto-crash');
  const aiJobs = out.forecasts.find((f) => f.narrativeId === 'ai-jobs');
  assert.ok(crypto && aiJobs);
  assert.equal(crypto!.forecastType, 'dead');
  assert.ok(aiJobs!.forecastType === 'rising' || aiJobs!.forecastType === 'emerging');
});
