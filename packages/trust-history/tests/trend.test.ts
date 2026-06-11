import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_TREND_SAMPLES,
  SLOPE_THRESHOLD,
  VOLATILITY_THRESHOLD,
  computeTrustTrend,
  trendSeverity,
} from '../src/trend';
import {
  DEGRADING,
  IMPROVING,
  STABLE,
  VOLATILE,
  seriesFromScores,
} from '../src/fixtures';

test('improving series classified improving', () => {
  assert.equal(computeTrustTrend(IMPROVING).trend, 'improving');
});

test('stable series classified stable', () => {
  assert.equal(computeTrustTrend(STABLE).trend, 'stable');
});

test('degrading series classified degrading', () => {
  assert.equal(computeTrustTrend(DEGRADING).trend, 'degrading');
});

test('volatile series classified volatile', () => {
  assert.equal(computeTrustTrend(VOLATILE).trend, 'volatile');
});

test('improving has positive delta and slope', () => {
  const t = computeTrustTrend(IMPROVING);
  assert.ok(t.delta > 0);
  assert.ok(t.slope > 0);
});

test('degrading has negative delta and slope', () => {
  const t = computeTrustTrend(DEGRADING);
  assert.ok(t.delta < 0);
  assert.ok(t.slope < 0);
});

test('delta equals last minus first', () => {
  const t = computeTrustTrend(IMPROVING);
  assert.equal(t.delta, t.last - t.first);
});

test('mean is within the score range', () => {
  const t = computeTrustTrend(IMPROVING);
  assert.ok(t.mean >= t.first && t.mean <= t.last);
});

test('volatile has high volatility', () => {
  const t = computeTrustTrend(VOLATILE);
  assert.ok(t.volatility > VOLATILITY_THRESHOLD);
});

test('stable has low volatility', () => {
  const t = computeTrustTrend(STABLE);
  assert.ok(t.volatility <= VOLATILITY_THRESHOLD);
});

test('sampleCount equals series length', () => {
  assert.equal(computeTrustTrend(IMPROVING).sampleCount, IMPROVING.length);
});

test('short series reported stable with a limitation', () => {
  const t = computeTrustTrend(seriesFromScores('source', 's', [50, 80]));
  assert.equal(t.trend, 'stable');
  assert.ok(t.limitations.some((l) => /below the .* floor/.test(l)));
});

test('empty series is stable', () => {
  const t = computeTrustTrend([]);
  assert.equal(t.trend, 'stable');
  assert.equal(t.sampleCount, 0);
});

test('single point is stable', () => {
  const t = computeTrustTrend(seriesFromScores('source', 's', [60]));
  assert.equal(t.trend, 'stable');
  assert.equal(t.delta, 0);
});

test('explanation always present', () => {
  assert.ok(computeTrustTrend(IMPROVING).explanation.length > 0);
});

test('limitations always populated', () => {
  assert.ok(computeTrustTrend(IMPROVING).limitations.length > 0);
});

test('custom slope threshold flips classification', () => {
  // A climb (slope 3) that is improving by default but stable at a high threshold.
  const gentle = seriesFromScores('source', 's', [50, 53, 56, 59]);
  assert.equal(computeTrustTrend(gentle).trend, 'improving');
  assert.equal(computeTrustTrend(gentle, { slopeThreshold: 5 }).trend, 'stable');
});

test('custom volatility threshold flips to volatile', () => {
  const wobbly = seriesFromScores('source', 's', [50, 55, 50, 55, 50]);
  assert.equal(
    computeTrustTrend(wobbly, { volatilityThreshold: 1 }).trend,
    'volatile',
  );
});

test('custom minSamples relaxes the floor', () => {
  const two = seriesFromScores('source', 's', [50, 80]);
  assert.equal(computeTrustTrend(two, { minSamples: 2 }).trend, 'improving');
});

test('volatility takes priority over slope', () => {
  // Climbs overall but swings hard -> volatile, not improving.
  const t = computeTrustTrend(seriesFromScores('source', 's', [40, 75, 45, 80, 55, 90]));
  assert.equal(t.trend, 'volatile');
});

test('deterministic across runs', () => {
  assert.deepEqual(computeTrustTrend(IMPROVING), computeTrustTrend(IMPROVING));
});

test('trendSeverity low for improving', () => {
  assert.equal(trendSeverity(computeTrustTrend(IMPROVING)), 'LOW');
});

test('trendSeverity low for stable', () => {
  assert.equal(trendSeverity(computeTrustTrend(STABLE)), 'LOW');
});

test('trendSeverity escalates for a steep degrade', () => {
  const steep = computeTrustTrend(seriesFromScores('source', 's', [90, 80, 70, 60]));
  assert.ok(['HIGH', 'CRITICAL'].includes(trendSeverity(steep)));
});

test('trendSeverity escalates for high volatility', () => {
  const sev = trendSeverity(computeTrustTrend(VOLATILE));
  assert.ok(['MEDIUM', 'HIGH', 'CRITICAL'].includes(sev));
});

test('constants are sane', () => {
  assert.ok(MIN_TREND_SAMPLES >= 2);
  assert.ok(SLOPE_THRESHOLD > 0);
  assert.ok(VOLATILITY_THRESHOLD > 0);
});

test('first and last reflect endpoints', () => {
  const t = computeTrustTrend(IMPROVING);
  assert.equal(t.first, IMPROVING[0].trustScore);
  assert.equal(t.last, IMPROVING[IMPROVING.length - 1].trustScore);
});
