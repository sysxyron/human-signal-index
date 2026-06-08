import { test } from 'node:test';
import assert from 'node:assert/strict';

import { captureNarrativeSnapshot } from '@hsi/temporal-intelligence';
import type { InfluenceEdge, NarrativeSnapshot, NarrativeStats } from '@hsi/temporal-intelligence';

import { detectCausalEvents } from '../src/events';
import type { CausalEventType, CausalInput } from '../src/types';

const NOW = '2026-03-01T00:00:00.000Z';

function daysBefore(d: number): string {
  return new Date(Date.parse(NOW) - d * 86400000).toISOString();
}

function mk(
  ageDays: number,
  stats: Partial<NarrativeStats>,
): NarrativeSnapshot {
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

function input(snaps: NarrativeSnapshot[], extra?: Partial<CausalInput>): CausalInput {
  return { narrativeId: 'n1', snapshots: snaps, evolution: [], now: NOW, ...extra };
}

function types(input: CausalInput): CausalEventType[] {
  return detectCausalEvents(input).map((e) => e.eventType);
}

test('signal_surge: 100→500 detected with +400% in the explanation', () => {
  const evs = detectCausalEvents(
    input([
      mk(14, { signalCount: 100, amplificationScore: 30 }),
      mk(7, { signalCount: 500, amplificationScore: 30 }),
    ]),
  );
  const surge = evs.find((e) => e.eventType === 'signal_surge');
  assert.ok(surge, 'signal_surge detected');
  assert.ok(surge!.explanation.includes('+400%'), 'explanation references +400%');
  assert.ok(surge!.explanation.includes('100→500'), 'explanation references the counts');
  assert.equal(surge!.metrics.from, 100);
  assert.equal(surge!.metrics.to, 500);
  assert.equal(surge!.metrics.deltaPct, 400);
});

test('signal_surge: strength scales with ratio (bigger ratio → higher strength)', () => {
  const small = detectCausalEvents(
    input([mk(14, { signalCount: 10 }), mk(7, { signalCount: 20 })]),
  ).find((e) => e.eventType === 'signal_surge');
  const big = detectCausalEvents(
    input([mk(14, { signalCount: 10 }), mk(7, { signalCount: 60 })]),
  ).find((e) => e.eventType === 'signal_surge');
  assert.ok(small && big);
  assert.ok(big!.eventStrength > small!.eventStrength);
});

test('signal_surge: NOT detected below threshold (tiny counts / small pct)', () => {
  // 1→2 is +100% but abs delta < SIGNAL_SURGE_ABS (3) → no surge.
  assert.ok(!types(input([mk(14, { signalCount: 1 }), mk(7, { signalCount: 2 })])).includes('signal_surge'));
  // 100→120 is +20% < SIGNAL_SURGE_PCT (50) → no surge.
  assert.ok(!types(input([mk(14, { signalCount: 100 }), mk(7, { signalCount: 120 })])).includes('signal_surge'));
});

test('source_expansion: 2→25 sources detected, explanation references counts', () => {
  const ev = detectCausalEvents(
    input([mk(14, { sourceCount: 2 }), mk(7, { sourceCount: 25 })]),
  ).find((e) => e.eventType === 'source_expansion');
  assert.ok(ev);
  assert.ok(ev!.explanation.includes('2→25'));
  assert.equal(ev!.metrics.delta, 23);
});

test('source_expansion: NOT detected for +1 source (below threshold)', () => {
  assert.ok(!types(input([mk(14, { sourceCount: 2 }), mk(7, { sourceCount: 3 })])).includes('source_expansion'));
});

test('community_growth: 1→15 communities detected', () => {
  const ev = detectCausalEvents(
    input([mk(14, { communityCount: 1 }), mk(7, { communityCount: 15 })]),
  ).find((e) => e.eventType === 'community_growth');
  assert.ok(ev);
  assert.ok(ev!.explanation.includes('1→15'));
  assert.equal(ev!.metrics.delta, 14);
});

test('amplification_spike: jump detected, explanation references the jump', () => {
  const ev = detectCausalEvents(
    input([mk(14, { amplificationScore: 20 }), mk(7, { amplificationScore: 80 })]),
  ).find((e) => e.eventType === 'amplification_spike');
  assert.ok(ev);
  assert.ok(ev!.explanation.includes('20→80'));
  assert.equal(ev!.metrics.delta, 60);
});

test('amplification_spike: NOT detected for small rise (+5 < threshold)', () => {
  assert.ok(!types(input([mk(14, { amplificationScore: 20 }), mk(7, { amplificationScore: 25 })])).includes('amplification_spike'));
});

test('contradiction_drop: falling contradiction detected with pts in explanation', () => {
  const ev = detectCausalEvents(
    input([mk(14, { contradictionRatio: 0.4 }), mk(7, { contradictionRatio: 0.1 })]),
  ).find((e) => e.eventType === 'contradiction_drop');
  assert.ok(ev);
  assert.ok(ev!.explanation.includes('40%→10%'));
  assert.equal(ev!.metrics.from, 40);
  assert.equal(ev!.metrics.to, 10);
});

test('contradiction_rise: rising contradiction detected', () => {
  const ev = detectCausalEvents(
    input([mk(14, { contradictionRatio: 0.1 }), mk(7, { contradictionRatio: 0.4 })]),
  ).find((e) => e.eventType === 'contradiction_rise');
  assert.ok(ev);
  assert.ok(ev!.explanation.includes('10%→40%'));
});

test('contradiction: NOT detected for tiny swing (< 0.08)', () => {
  const t = types(input([mk(14, { contradictionRatio: 0.1 }), mk(7, { contradictionRatio: 0.13 })]));
  assert.ok(!t.includes('contradiction_drop'));
  assert.ok(!t.includes('contradiction_rise'));
});

test('forecast_shift: detected as the trajectory changes (stable → rising)', () => {
  const evs = detectCausalEvents(
    input([
      mk(28, { signalCount: 5, amplificationScore: 20 }),
      mk(14, { signalCount: 30, amplificationScore: 70 }),
    ]),
  );
  const shift = evs.find((e) => e.eventType === 'forecast_shift');
  assert.ok(shift, 'forecast_shift detected');
  assert.ok(shift!.explanation.includes('→'));
  assert.ok(typeof shift!.metrics.fromState === 'string');
  assert.ok(typeof shift!.metrics.toState === 'string');
});

test('influence_transfer: strong inbound edge + growth → detected, names the source', () => {
  const edges: InfluenceEdge[] = [
    {
      sourceNarrativeId: 'narrative-c',
      targetNarrativeId: 'n1',
      influenceScore: 80,
      sharedEntities: 3,
      sharedSources: 2,
      sharedCommunities: 1,
      rationale: 'shared',
      createdAt: NOW,
    },
  ];
  const ev = detectCausalEvents(
    input(
      [mk(14, { signalCount: 10, amplificationScore: 20 }), mk(7, { signalCount: 60, amplificationScore: 60 })],
      { influenceIn: edges },
    ),
  ).find((e) => e.eventType === 'influence_transfer');
  assert.ok(ev);
  assert.ok(ev!.explanation.includes('narrative-c'));
  assert.equal(ev!.metrics.source, 'narrative-c');
});

test('influence_transfer: NOT detected when inbound edge is weak (< INFLUENCE_MIN)', () => {
  const edges: InfluenceEdge[] = [
    {
      sourceNarrativeId: 'weak',
      targetNarrativeId: 'n1',
      influenceScore: 20,
      sharedEntities: 1,
      sharedSources: 0,
      sharedCommunities: 0,
      rationale: 'weak',
      createdAt: NOW,
    },
  ];
  const t = types(
    input(
      [mk(14, { signalCount: 10 }), mk(7, { signalCount: 60 })],
      { influenceIn: edges },
    ),
  );
  assert.ok(!t.includes('influence_transfer'));
});

test('influence_transfer: NOT detected without coinciding growth', () => {
  const edges: InfluenceEdge[] = [
    {
      sourceNarrativeId: 'strong',
      targetNarrativeId: 'n1',
      influenceScore: 90,
      sharedEntities: 3,
      sharedSources: 2,
      sharedCommunities: 1,
      rationale: 'strong',
      createdAt: NOW,
    },
  ];
  // Flat narrative — strong edge but no growth step.
  const t = types(
    input([mk(14, { signalCount: 10 }), mk(7, { signalCount: 11 })], { influenceIn: edges }),
  );
  assert.ok(!t.includes('influence_transfer'));
});

test('all 8 event types are detectable across crafted histories', () => {
  const seen = new Set<string>();
  // surge + amp + source + community + contradiction_drop in one step.
  types(
    input([
      mk(14, { signalCount: 10, sourceCount: 1, communityCount: 1, amplificationScore: 10, contradictionRatio: 0.4 }),
      mk(7, { signalCount: 100, sourceCount: 5, communityCount: 5, amplificationScore: 80, contradictionRatio: 0.05 }),
    ]),
  ).forEach((t) => seen.add(t));
  // contradiction_rise
  types(input([mk(14, { contradictionRatio: 0.1 }), mk(7, { contradictionRatio: 0.4 })])).forEach((t) => seen.add(t));
  // forecast_shift
  types(input([mk(28, { signalCount: 5, amplificationScore: 20 }), mk(14, { signalCount: 30, amplificationScore: 70 })])).forEach((t) => seen.add(t));
  // influence_transfer
  types(
    input([mk(14, { signalCount: 10 }), mk(7, { signalCount: 60 })], {
      influenceIn: [{ sourceNarrativeId: 'c', targetNarrativeId: 'n1', influenceScore: 80, sharedEntities: 1, sharedSources: 1, sharedCommunities: 1, rationale: 'x', createdAt: NOW }],
    }),
  ).forEach((t) => seen.add(t));

  for (const t of [
    'signal_surge',
    'source_expansion',
    'community_growth',
    'amplification_spike',
    'contradiction_drop',
    'contradiction_rise',
    'forecast_shift',
    'influence_transfer',
  ]) {
    assert.ok(seen.has(t), `expected to detect ${t}`);
  }
});

test('single snapshot yields no events (no change to evidence)', () => {
  assert.equal(detectCausalEvents(input([mk(7, { signalCount: 10 })])).length, 0);
});

test('deterministic: same input → identical events', () => {
  const i = input([
    mk(14, { signalCount: 10, sourceCount: 1, amplificationScore: 10 }),
    mk(7, { signalCount: 100, sourceCount: 5, amplificationScore: 80 }),
  ]);
  assert.deepEqual(detectCausalEvents(i), detectCausalEvents(i));
});

test('events are time-ordered', () => {
  const evs = detectCausalEvents(
    input([
      mk(21, { signalCount: 5, amplificationScore: 10 }),
      mk(14, { signalCount: 40, amplificationScore: 50 }),
      mk(7, { signalCount: 80, amplificationScore: 90 }),
    ]),
  );
  for (let i = 1; i < evs.length; i += 1) {
    assert.ok(Date.parse(evs[i].occurredAt) >= Date.parse(evs[i - 1].occurredAt));
  }
});

test('strength and confidence are within bounds', () => {
  const evs = detectCausalEvents(
    input([
      mk(14, { signalCount: 10, sourceCount: 1, communityCount: 1, amplificationScore: 10, contradictionRatio: 0.5 }),
      mk(7, { signalCount: 9999, sourceCount: 99, communityCount: 99, amplificationScore: 100, contradictionRatio: 0.0 }),
    ]),
  );
  for (const e of evs) {
    assert.ok(e.eventStrength >= 0 && e.eventStrength <= 100);
    assert.ok(e.confidence >= 0 && e.confidence <= 1);
  }
});
