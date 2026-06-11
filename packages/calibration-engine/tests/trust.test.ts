import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_TRUST_SAMPLES,
  W_ACCURACY,
  W_CALIBRATION,
  W_EVIDENCE,
  W_GOVERNANCE,
  applyTrustOverride,
  computeTrustScore,
  decisionTrust,
  forecastTrust,
  narrativeTrust,
  sourceTrust,
} from '../src/trust';
import { calibrationDemo, DEMO_TRUST_INPUTS, FIXTURE_NOW } from '../src/fixtures';
import type { TrustInputs } from '../src/types';

const NOW = FIXTURE_NOW;

function base(overrides: Partial<TrustInputs> = {}): TrustInputs {
  return {
    entityType: 'source',
    entityId: 'e1',
    historicalAccuracy: 0.9,
    evidenceQuality: 0.9,
    calibrationScore: 0.9,
    sampleCount: FULL_TRUST_SAMPLES,
    ...overrides,
  };
}

test('weights sum to 1', () => {
  assert.ok(Math.abs(W_ACCURACY + W_CALIBRATION + W_EVIDENCE + W_GOVERNANCE - 1) < 1e-9);
});

test('high signals + full sample -> high band', () => {
  const t = computeTrustScore(base(), { now: NOW });
  assert.equal(t.band, 'high');
  assert.ok(t.trustScore >= 70);
});

test('low signals -> low band', () => {
  const t = computeTrustScore(
    base({ historicalAccuracy: 0.05, evidenceQuality: 0.05, calibrationScore: 0.05 }),
    { now: NOW },
  );
  assert.equal(t.band, 'low');
  assert.ok(t.trustScore < 40);
});

test('medium signals -> medium band', () => {
  const t = computeTrustScore(
    base({ historicalAccuracy: 0.5, evidenceQuality: 0.5, calibrationScore: 0.5 }),
    { now: NOW },
  );
  assert.equal(t.band, 'medium');
});

test('band boundary high at exactly 70', () => {
  const over = applyTrustOverride(computeTrustScore(base(), { now: NOW }), {
    newScore: 70,
    reason: 'set boundary',
    now: NOW,
  });
  assert.equal(over.band, 'high');
});

test('band boundary medium at exactly 40', () => {
  const over = applyTrustOverride(computeTrustScore(base(), { now: NOW }), {
    newScore: 40,
    reason: 'set boundary',
    now: NOW,
  });
  assert.equal(over.band, 'medium');
});

test('trustScore bounded in [0,100]', () => {
  const t = computeTrustScore(base(), { now: NOW });
  assert.ok(t.trustScore >= 0 && t.trustScore <= 100);
});

test('weighted blend matches manual computation at full sample', () => {
  const inp = base({
    historicalAccuracy: 0.8,
    calibrationScore: 0.6,
    evidenceQuality: 0.4,
  });
  // no review/governance -> governance-net neutral 0.5
  const expected =
    (W_ACCURACY * 0.8 + W_CALIBRATION * 0.6 + W_EVIDENCE * 0.4 + W_GOVERNANCE * 0.5) * 100;
  const t = computeTrustScore(inp, { now: NOW });
  assert.ok(Math.abs(t.trustScore - expected) < 0.5, `got ${t.trustScore} expected ${expected}`);
});

test('small sample pulls score toward neutral 50', () => {
  const big = computeTrustScore(base({ sampleCount: FULL_TRUST_SAMPLES }), { now: NOW });
  const small = computeTrustScore(base({ sampleCount: 1 }), { now: NOW });
  assert.ok(small.trustScore < big.trustScore);
  assert.ok(small.trustScore > 50 - 5); // pulled toward 50 from above
});

test('small sample yields lower confidence', () => {
  const big = computeTrustScore(base({ sampleCount: FULL_TRUST_SAMPLES }), { now: NOW });
  const small = computeTrustScore(base({ sampleCount: 1 }), { now: NOW });
  assert.ok(small.confidence < big.confidence);
});

test('zero sample -> score exactly neutral 50', () => {
  const t = computeTrustScore(base({ sampleCount: 0 }), { now: NOW });
  assert.equal(t.trustScore, 50);
});

test('confidence in [0,1]', () => {
  const t = computeTrustScore(base(), { now: NOW });
  assert.ok(t.confidence >= 0 && t.confidence <= 1);
});

test('missing signals lower confidence', () => {
  const full = computeTrustScore(base(), { now: NOW });
  const sparse = computeTrustScore(
    { entityType: 'source', entityId: 'e1', historicalAccuracy: 0.9, sampleCount: FULL_TRUST_SAMPLES },
    { now: NOW },
  );
  assert.ok(sparse.confidence < full.confidence);
});

test('explanation enumerates all four factors', () => {
  const t = computeTrustScore(base(), { now: NOW });
  const joined = t.explanation.join('\n');
  assert.match(joined, /Historical accuracy/);
  assert.match(joined, /Calibration/);
  assert.match(joined, /Evidence quality/);
  assert.match(joined, /Governance-net/);
});

test('explanation references weights', () => {
  const t = computeTrustScore(base(), { now: NOW });
  const joined = t.explanation.join('\n');
  assert.match(joined, new RegExp(String(W_ACCURACY)));
});

test('limitations always populated', () => {
  const t = computeTrustScore(base(), { now: NOW });
  assert.ok(t.limitations.length > 0);
});

test('small sample adds a sample-floor limitation', () => {
  const t = computeTrustScore(base({ sampleCount: 2 }), { now: NOW });
  assert.ok(t.limitations.some((l) => /below the .* floor/.test(l)));
});

test('missing signal adds a neutral-default limitation', () => {
  const t = computeTrustScore(
    { entityType: 'source', entityId: 'e1', historicalAccuracy: 0.9, sampleCount: FULL_TRUST_SAMPLES },
    { now: NOW },
  );
  assert.ok(t.limitations.some((l) => /defaulted to a neutral/.test(l)));
});

test('no governance signal adds an indirect-assumption limitation', () => {
  const t = computeTrustScore(base(), { now: NOW });
  assert.ok(t.limitations.some((l) => /governance-net is an indirect/.test(l)));
});

test('governance outcomes shift the score', () => {
  const good = computeTrustScore(
    base({ governanceOutcomes: { validated: 10, escalated: 0, rejected: 0 } }),
    { now: NOW },
  );
  const bad = computeTrustScore(
    base({ governanceOutcomes: { validated: 0, escalated: 0, rejected: 10 } }),
    { now: NOW },
  );
  assert.ok(good.trustScore > bad.trustScore);
});

test('review outcomes shift the score', () => {
  const good = computeTrustScore(base({ reviewOutcomes: { approved: 10, rejected: 0 } }), { now: NOW });
  const bad = computeTrustScore(base({ reviewOutcomes: { approved: 0, rejected: 10 } }), { now: NOW });
  assert.ok(good.trustScore > bad.trustScore);
});

test('calibrationScore field echoes the input', () => {
  const t = computeTrustScore(base({ calibrationScore: 0.73 }), { now: NOW });
  assert.equal(t.calibrationScore, 0.73);
});

test('evidenceCount echoes sampleCount', () => {
  const t = computeTrustScore(base({ sampleCount: 7 }), { now: NOW });
  assert.equal(t.evidenceCount, 7);
});

test('lastUpdated uses injected now', () => {
  const t = computeTrustScore(base(), { now: '2031-01-01T00:00:00.000Z' });
  assert.equal(t.lastUpdated, '2031-01-01T00:00:00.000Z');
});

test('deterministic across runs', () => {
  assert.deepEqual(computeTrustScore(base(), { now: NOW }), computeTrustScore(base(), { now: NOW }));
});

test('sourceTrust sets entityType source', () => {
  const t = sourceTrust({ entityId: 's', sampleCount: 5 }, { now: NOW });
  assert.equal(t.entityType, 'source');
});

test('narrativeTrust sets entityType narrative', () => {
  const t = narrativeTrust({ entityId: 'n', sampleCount: 5 }, { now: NOW });
  assert.equal(t.entityType, 'narrative');
});

test('forecastTrust sets entityType forecast', () => {
  const t = forecastTrust({ entityId: 'f', sampleCount: 5 }, { now: NOW });
  assert.equal(t.entityType, 'forecast');
});

test('decisionTrust sets entityType decision', () => {
  const t = decisionTrust({ entityId: 'd', sampleCount: 5 }, { now: NOW });
  assert.equal(t.entityType, 'decision');
});

test('builders carry entityId through', () => {
  const t = sourceTrust({ entityId: 'src-x', sampleCount: 5 }, { now: NOW });
  assert.equal(t.entityId, 'src-x');
});

test('applyTrustOverride applies a new score with a reason', () => {
  const b = computeTrustScore(base(), { now: NOW });
  const o = applyTrustOverride(b, { newScore: 12, reason: 'manual downgrade', now: NOW });
  assert.equal(o.trustScore, 12);
  assert.equal(o.band, 'low');
  assert.equal(o.overridden, true);
  assert.equal(o.overrideReason, 'manual downgrade');
});

test('applyTrustOverride logs the override in explanation', () => {
  const b = computeTrustScore(base(), { now: NOW });
  const o = applyTrustOverride(b, { newScore: 90, reason: 'verified', by: 'alice', now: NOW });
  assert.ok(o.explanation.some((e) => /OVERRIDE by alice/.test(e)));
});

test('applyTrustOverride adds an override limitation', () => {
  const b = computeTrustScore(base(), { now: NOW });
  const o = applyTrustOverride(b, { newScore: 90, reason: 'verified', now: NOW });
  assert.ok(o.limitations.some((l) => /manually overridden/.test(l)));
});

test('applyTrustOverride rejects a blank reason and keeps base score', () => {
  const b = computeTrustScore(base(), { now: NOW });
  const o = applyTrustOverride(b, { newScore: 5, reason: '   ', now: NOW });
  assert.equal(o.trustScore, b.trustScore);
  assert.equal(o.overridden, true);
  assert.match(o.overrideReason, /rejected/);
});

test('applyTrustOverride blank-reason logs a rejection limitation', () => {
  const b = computeTrustScore(base(), { now: NOW });
  const o = applyTrustOverride(b, { newScore: 5, reason: '', now: NOW });
  assert.ok(o.limitations.some((l) => /REJECTED/.test(l)));
});

test('applyTrustOverride clamps the new score into [0,100]', () => {
  const b = computeTrustScore(base(), { now: NOW });
  const hi = applyTrustOverride(b, { newScore: 250, reason: 'x', now: NOW });
  const lo = applyTrustOverride(b, { newScore: -50, reason: 'x', now: NOW });
  assert.equal(hi.trustScore, 100);
  assert.equal(lo.trustScore, 0);
});

test('applyTrustOverride updates lastUpdated', () => {
  const b = computeTrustScore(base(), { now: NOW });
  const o = applyTrustOverride(b, { newScore: 50, reason: 'x', now: '2032-02-02T00:00:00.000Z' });
  assert.equal(o.lastUpdated, '2032-02-02T00:00:00.000Z');
});

test('demo trust inputs produce sane scores', () => {
  const out = calibrationDemo();
  assert.ok(out.trust.source.trustScore > out.trust.decision.trustScore);
  assert.equal(out.trust.source.entityType, 'source');
  assert.equal(out.trust.decision.entityType, 'decision');
});

test('DEMO_TRUST_INPUTS decision is a thin small sample', () => {
  assert.ok((DEMO_TRUST_INPUTS.decision.sampleCount ?? 0) < FULL_TRUST_SAMPLES);
});

// ---- end-to-end demo --------------------------------------------------------

test('calibrationDemo runs the full chain', () => {
  const out = calibrationDemo();
  assert.ok(out.curve.sampleCount > 0);
  assert.ok(out.byKind.forecast);
  assert.ok(out.brierOverall.sampleCount > 0);
  assert.ok(out.brierByKind.recommendation);
  assert.ok(out.drift.overconfidence);
  assert.ok(out.trust.source);
});

test('calibrationDemo meaning82 is the spec sentence', () => {
  const out = calibrationDemo();
  assert.match(
    out.meaning82.sentence,
    /confidence predictions have historically succeeded .* of the time across \d+ observations\./,
  );
});

test('calibrationDemo drift covers all kinds with severities', () => {
  const out = calibrationDemo();
  assert.equal(out.drift.overconfidence.result.kind, 'overconfidence');
  assert.equal(out.drift.underconfidence.result.kind, 'underconfidence');
  assert.equal(out.drift.degradation.result.kind, 'degradation');
  assert.equal(out.drift.improvement.result.kind, 'improvement');
  assert.equal(out.drift.stable.result.kind, 'stable');
  for (const d of Object.values(out.drift)) {
    assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(d.severity));
  }
});

test('calibrationDemo is deterministic', () => {
  assert.deepEqual(calibrationDemo(), calibrationDemo());
});
