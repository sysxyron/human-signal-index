import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVENANCE_WEIGHTS,
  buildTrustProvenance,
} from '../src/provenance';
import { FIXTURE_NOW, IMPROVING } from '../src/fixtures';
import type { TrustProvenanceInputs } from '../src/types';

const NOW = FIXTURE_NOW;

function base(overrides: Partial<TrustProvenanceInputs> = {}): TrustProvenanceInputs {
  return {
    entityType: 'source',
    entityId: 'e1',
    score: 73,
    historicalAccuracy: 0.8,
    calibrationScore: 0.7,
    evidenceQuality: 0.65,
    governanceSignal: 0.82,
    evidenceCount: 26,
    ...overrides,
  };
}

test('weights sum to 1', () => {
  const sum = Object.values(PROVENANCE_WEIGHTS).reduce((a, n) => a + n, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('provenance enumerates all four factors', () => {
  const p = buildTrustProvenance(base(), { now: NOW });
  const names = p.factors.map((f) => f.name).sort();
  assert.deepEqual(names, [
    'calibration',
    'evidenceQuality',
    'governance',
    'historicalAccuracy',
  ]);
});

test('each factor carries value, weight, contribution', () => {
  const p = buildTrustProvenance(base(), { now: NOW });
  for (const f of p.factors) {
    assert.ok(f.value >= 0 && f.value <= 1);
    assert.ok(f.weight > 0 && f.weight <= 1);
    assert.equal(f.contribution, Math.round(f.value * f.weight * 100 * 100) / 100);
  }
});

test('present factors are flagged present', () => {
  const p = buildTrustProvenance(base(), { now: NOW });
  assert.ok(p.factors.every((f) => f.present));
});

test('absent factor defaults to neutral and is flagged', () => {
  const p = buildTrustProvenance(
    base({ historicalAccuracy: undefined }),
    { now: NOW },
  );
  const acc = p.factors.find((f) => f.name === 'historicalAccuracy')!;
  assert.equal(acc.present, false);
  assert.equal(acc.value, 0.5);
});

test('absent factor adds a limitation', () => {
  const p = buildTrustProvenance(
    base({ calibrationScore: undefined }),
    { now: NOW },
  );
  assert.ok(p.limitations.some((l) => /absent and defaulted/.test(l)));
});

test('thin sample adds a limitation', () => {
  const p = buildTrustProvenance(base({ evidenceCount: 3 }), { now: NOW });
  assert.ok(p.limitations.some((l) => /thin sample/.test(l)));
});

test('limitations always populated', () => {
  const p = buildTrustProvenance(base(), { now: NOW });
  assert.ok(p.limitations.length > 0);
});

test('weights map echoes the documented weights', () => {
  const p = buildTrustProvenance(base(), { now: NOW });
  assert.deepEqual(p.weights, PROVENANCE_WEIGHTS);
});

test('band derived from score', () => {
  assert.equal(buildTrustProvenance(base({ score: 75 }), { now: NOW }).band, 'high');
  assert.equal(buildTrustProvenance(base({ score: 50 }), { now: NOW }).band, 'medium');
  assert.equal(buildTrustProvenance(base({ score: 20 }), { now: NOW }).band, 'low');
});

test('score clamped to [0,100]', () => {
  assert.equal(buildTrustProvenance(base({ score: 250 }), { now: NOW }).score, 100);
  assert.equal(buildTrustProvenance(base({ score: -5 }), { now: NOW }).score, 0);
});

test('summary names the dominant factor', () => {
  const p = buildTrustProvenance(base(), { now: NOW });
  // historicalAccuracy has the highest weight*value here.
  assert.match(p.summary, /historicalAccuracy/);
});

test('history included and trend computed when >= 2 points', () => {
  const p = buildTrustProvenance(
    base({ history: IMPROVING.map((s) => ({ trustScore: s.trustScore, at: s.at })) }),
    { now: NOW },
  );
  assert.equal(p.history.length, IMPROVING.length);
  assert.ok(p.trend);
  assert.equal(p.trend?.trend, 'improving');
});

test('history sorted ascending', () => {
  const p = buildTrustProvenance(
    base({
      history: [
        { trustScore: 70, at: '2026-05-01T00:00:00.000Z' },
        { trustScore: 50, at: '2026-03-01T00:00:00.000Z' },
        { trustScore: 60, at: '2026-04-01T00:00:00.000Z' },
      ],
    }),
    { now: NOW },
  );
  assert.deepEqual(p.history.map((h) => h.trustScore), [50, 60, 70]);
});

test('no trend when fewer than 2 history points', () => {
  const p = buildTrustProvenance(
    base({ history: [{ trustScore: 70, at: NOW }] }),
    { now: NOW },
  );
  assert.equal(p.trend, undefined);
});

test('generatedAt uses injected now', () => {
  const p = buildTrustProvenance(base(), { now: '2031-01-01T00:00:00.000Z' });
  assert.equal(p.generatedAt, '2031-01-01T00:00:00.000Z');
});

test('entity identity carried through', () => {
  const p = buildTrustProvenance(base({ entityType: 'decision', entityId: 'd9' }), {
    now: NOW,
  });
  assert.equal(p.entityType, 'decision');
  assert.equal(p.entityId, 'd9');
});

test('deterministic across runs', () => {
  assert.deepEqual(
    buildTrustProvenance(base(), { now: NOW }),
    buildTrustProvenance(base(), { now: NOW }),
  );
});

test('all-absent inputs yield neutral 50-ish contributions', () => {
  const p = buildTrustProvenance(
    { entityType: 'source', entityId: 'e', score: 50 },
    { now: NOW },
  );
  const total = p.factors.reduce((a, f) => a + f.contribution, 0);
  // 0.5 * (sum of weights=1) * 100 = 50.
  assert.ok(Math.abs(total - 50) < 0.5);
});
