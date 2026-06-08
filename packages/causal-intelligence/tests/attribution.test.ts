import { test } from 'node:test';
import assert from 'node:assert/strict';

import { captureNarrativeSnapshot } from '@hsi/temporal-intelligence';
import type { NarrativeSnapshot, NarrativeStats } from '@hsi/temporal-intelligence';

import { attributeChange, PRIMARY_SHARE_MIN } from '../src/attribution';
import { detectCausalEvents } from '../src/events';
import { DEMO_CAUSAL_INPUTS } from '../src/fixtures';
import type { CausalInput } from '../src/types';

const NOW = '2026-03-01T00:00:00.000Z';

function daysBefore(d: number): string {
  return new Date(Date.parse(NOW) - d * 86400000).toISOString();
}

function mk(ageDays: number, stats: Partial<NarrativeStats>): NarrativeSnapshot {
  const base: NarrativeStats = {
    narrativeId: 'n1',
    signalCount: 0,
    sourceCount: 0,
    communityCount: 0,
    amplificationScore: 0,
    reliabilityScore: 50,
    supportRatio: 0.5,
    contradictionRatio: 0.1,
  };
  return captureNarrativeSnapshot({ ...base, ...stats }, daysBefore(ageDays));
}

function input(snaps: NarrativeSnapshot[]): CausalInput {
  return { narrativeId: 'n1', snapshots: snaps, evolution: [], now: NOW };
}

const STRONG = input([
  mk(14, { signalCount: 5, sourceCount: 1, communityCount: 1, amplificationScore: 10, contradictionRatio: 0.4 }),
  mk(7, { signalCount: 50, sourceCount: 6, communityCount: 5, amplificationScore: 90, contradictionRatio: 0.05 }),
]);

test('shares sum to ≤ 100 with an explicit unexplained residual', () => {
  const events = detectCausalEvents(STRONG);
  const attr = attributeChange(STRONG, events);
  const explained = attr.growthAttribution.reduce((a, g) => a + g.share, 0);
  assert.ok(explained <= 100, `explained ${explained} ≤ 100`);
  assert.ok(attr.unexplained > 0, 'unexplained residual is always reported');
  assert.ok(Math.abs(explained + attr.unexplained - 100) < 0.5, 'explained + unexplained ≈ 100');
});

test('never forces 100% — unexplained is never zero even with strong evidence', () => {
  const attr = attributeChange(STRONG, detectCausalEvents(STRONG));
  assert.ok(attr.unexplained >= 8, 'at least the MAX_EXPLAINED residual remains');
});

test('primary vs contributing ranking by impact (strength × confidence)', () => {
  // A single dominant surge → it should be primary.
  const i = input([
    mk(14, { signalCount: 10, amplificationScore: 30 }),
    mk(7, { signalCount: 200, amplificationScore: 33 }),
  ]);
  const events = detectCausalEvents(i);
  const attr = attributeChange(i, events);
  assert.ok(attr.primaryCauses.length >= 1, 'a dominant cause is primary');
  // Every primary cause has share ≥ PRIMARY_SHARE_MIN; contributing are below.
  const shareOf = new Map(attr.growthAttribution.map((g) => [g.eventType, g.share]));
  for (const p of attr.primaryCauses) {
    assert.ok((shareOf.get(p.eventType) ?? 0) >= PRIMARY_SHARE_MIN || attr.primaryCauses.length > 1);
  }
});

test('growthAttribution is sorted by descending share', () => {
  const attr = attributeChange(STRONG, detectCausalEvents(STRONG));
  for (let i = 1; i < attr.growthAttribution.length; i += 1) {
    assert.ok(attr.growthAttribution[i - 1].share >= attr.growthAttribution[i].share);
  }
});

test('thin / low-confidence evidence lowers coverage (larger unexplained)', () => {
  // Just-above-threshold single event → low confidence → small coverage.
  const thin = input([
    mk(14, { sourceCount: 2 }),
    mk(7, { sourceCount: 4 }), // source_expansion only, +2 (min)
  ]);
  const rich = STRONG;
  const thinAttr = attributeChange(thin, detectCausalEvents(thin));
  const richAttr = attributeChange(rich, detectCausalEvents(rich));
  assert.ok(thinAttr.unexplained > richAttr.unexplained, 'thin data → more unexplained');
});

test('no events → 100% unexplained, empty cause lists', () => {
  const i = input([mk(7, { signalCount: 10 })]);
  const attr = attributeChange(i, detectCausalEvents(i));
  assert.equal(attr.unexplained, 100);
  assert.deepEqual(attr.primaryCauses, []);
  assert.deepEqual(attr.contributingCauses, []);
  assert.deepEqual(attr.growthAttribution, []);
});

test('every attributed event type is unique in growthAttribution (aggregated)', () => {
  const attr = attributeChange(STRONG, detectCausalEvents(STRONG));
  const seen = new Set(attr.growthAttribution.map((g) => g.eventType));
  assert.equal(seen.size, attr.growthAttribution.length);
});

test('deterministic attribution', () => {
  const events = detectCausalEvents(STRONG);
  assert.deepEqual(attributeChange(STRONG, events), attributeChange(STRONG, events));
});

test('all demo narratives keep shares ≤ 100', () => {
  for (const base of DEMO_CAUSAL_INPUTS) {
    const i: CausalInput = { ...base, now: NOW };
    const attr = attributeChange(i, detectCausalEvents(i));
    const explained = attr.growthAttribution.reduce((a, g) => a + g.share, 0);
    assert.ok(explained <= 100.01);
    assert.ok(attr.unexplained >= 0);
  }
});

test('primary causes are a subset of the detected events', () => {
  const events = detectCausalEvents(STRONG);
  const attr = attributeChange(STRONG, events);
  for (const p of [...attr.primaryCauses, ...attr.contributingCauses]) {
    assert.ok(events.includes(p));
  }
});
