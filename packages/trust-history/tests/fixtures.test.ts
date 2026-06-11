import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMO_SERIES,
  FIXTURE_NOW,
  isoDay,
  seriesFromScores,
  trustHistoryDemo,
} from '../src/fixtures';

test('isoDay is deterministic and ordered', () => {
  assert.equal(isoDay(0), '2026-03-01T12:00:00.000Z');
  assert.ok(Date.parse(isoDay(5)) > Date.parse(isoDay(0)));
});

test('seriesFromScores builds the right length', () => {
  const s = seriesFromScores('source', 'x', [1, 2, 3, 4]);
  assert.equal(s.length, 4);
  assert.deepEqual(s.map((p) => p.trustScore), [1, 2, 3, 4]);
});

test('seriesFromScores stamps ascending timestamps', () => {
  const s = seriesFromScores('source', 'x', [10, 20, 30]);
  assert.ok(Date.parse(s[2].at) > Date.parse(s[0].at));
});

test('DEMO_SERIES covers all seven scenarios', () => {
  assert.deepEqual(Object.keys(DEMO_SERIES).sort(), [
    'collapsing',
    'degrading',
    'improving',
    'overconfident',
    'stable',
    'underconfident',
    'volatile',
  ]);
});

test('trustHistoryDemo runs the full chain', () => {
  const out = trustHistoryDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.ok(out.trend.improving);
  assert.ok(out.drift.collapsing);
  assert.ok(out.provenance.factors.length === 4);
});

test('demo trend classifications match scenario names', () => {
  const out = trustHistoryDemo();
  assert.equal(out.trend.improving.trend, 'improving');
  assert.equal(out.trend.stable.trend, 'stable');
  assert.equal(out.trend.degrading.trend, 'degrading');
  assert.equal(out.trend.volatile.trend, 'volatile');
});

test('demo drift classifications match scenario names', () => {
  const out = trustHistoryDemo();
  assert.equal(out.drift.collapsing.kind, 'collapse');
  assert.equal(out.drift.degrading.kind, 'degradation');
  assert.equal(out.drift.volatile.kind, 'instability');
  assert.equal(out.drift.overconfident.kind, 'overconfidence');
  assert.equal(out.drift.underconfident.kind, 'underconfidence');
  assert.equal(out.drift.stable.kind, 'stable');
});

test('demo provenance is for the improving source', () => {
  const out = trustHistoryDemo();
  assert.equal(out.provenance.entityId, 'src-improving');
  assert.equal(out.provenance.trend?.trend, 'improving');
});

test('trustHistoryDemo is deterministic', () => {
  assert.deepEqual(trustHistoryDemo(), trustHistoryDemo());
});
