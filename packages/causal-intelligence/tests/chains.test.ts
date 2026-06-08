import { test } from 'node:test';
import assert from 'node:assert/strict';

import { captureNarrativeSnapshot } from '@hsi/temporal-intelligence';
import type { NarrativeSnapshot, NarrativeStats } from '@hsi/temporal-intelligence';

import { buildCausalChains } from '../src/chains';
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

const GROWTH_SNAPS = [
  mk(28, { signalCount: 5, sourceCount: 1, communityCount: 1, amplificationScore: 20, contradictionRatio: 0.4 }),
  mk(14, { signalCount: 30, sourceCount: 5, communityCount: 4, amplificationScore: 72, contradictionRatio: 0.12 }),
];

test('growth chain produced from growth-driver events', () => {
  const i = input(GROWTH_SNAPS);
  const events = detectCausalEvents(i);
  const chains = buildCausalChains(events, i);
  const growth = chains.find((c) => c.chainName === 'Growth cause');
  assert.ok(growth, 'growth chain present');
  assert.ok(growth!.events.length > 1);
});

test('growth chain orders source_expansion before signal_surge before amplification_spike', () => {
  const i = input(GROWTH_SNAPS);
  const chains = buildCausalChains(detectCausalEvents(i), i);
  const growth = chains.find((c) => c.chainName === 'Growth cause')!;
  const order = growth.events.map((e) => String(e.eventType));
  const idx = (t: string) => order.indexOf(t);
  // All in the same boundary → causal precedence tiebreak applies.
  assert.ok(idx('source_expansion') < idx('signal_surge'));
  assert.ok(idx('signal_surge') < idx('community_growth'));
  assert.ok(idx('community_growth') < idx('amplification_spike'));
});

test('summary lists the ACTUAL member event explanations', () => {
  const i = input(GROWTH_SNAPS);
  const chains = buildCausalChains(detectCausalEvents(i), i);
  const growth = chains.find((c) => c.chainName === 'Growth cause')!;
  for (const ev of growth.events) {
    assert.ok(growth.summary.includes(ev.explanation), `summary contains "${ev.explanation}"`);
  }
});

test('decline chain produced when contradiction rises / forecast worsens', () => {
  const i = input([
    mk(60, { signalCount: 60, amplificationScore: 80, contradictionRatio: 0.2 }),
    mk(45, { signalCount: 30, amplificationScore: 50, contradictionRatio: 0.32 }),
    mk(30, { signalCount: 12, amplificationScore: 28, contradictionRatio: 0.45 }),
  ]);
  const chains = buildCausalChains(detectCausalEvents(i), i);
  const decline = chains.find((c) => c.chainName === 'Decline cause');
  assert.ok(decline, 'decline chain present');
  assert.ok(decline!.events.length > 0);
});

test('chain confidence is bounded 0..1', () => {
  for (const base of DEMO_CAUSAL_INPUTS) {
    const i: CausalInput = { ...base, now: NOW };
    const chains = buildCausalChains(detectCausalEvents(i), i);
    for (const c of chains) {
      assert.ok(c.confidence >= 0 && c.confidence <= 1, `${c.chainName} conf ${c.confidence}`);
    }
  }
});

test('no events → no chains', () => {
  const i = input([mk(7, { signalCount: 10 })]);
  assert.deepEqual(buildCausalChains(detectCausalEvents(i), i), []);
});

test('chains are deterministic', () => {
  const i = input(GROWTH_SNAPS);
  const events = detectCausalEvents(i);
  assert.deepEqual(buildCausalChains(events, i), buildCausalChains(events, i));
});

test('growth chain returned before decline chain when both present', () => {
  const i = input([
    mk(40, { signalCount: 10, sourceCount: 1, amplificationScore: 20, contradictionRatio: 0.1 }),
    mk(28, { signalCount: 60, sourceCount: 4, amplificationScore: 70, contradictionRatio: 0.25 }),
    mk(14, { signalCount: 20, amplificationScore: 30, contradictionRatio: 0.45 }),
  ]);
  const chains = buildCausalChains(detectCausalEvents(i), i);
  if (chains.length === 2) {
    assert.equal(chains[0].chainName, 'Growth cause');
    assert.equal(chains[1].chainName, 'Decline cause');
  }
  assert.ok(chains.some((c) => c.chainName === 'Growth cause'));
  assert.ok(chains.some((c) => c.chainName === 'Decline cause'));
});

test('chain carries narrativeId and createdAt = now', () => {
  const i = input(GROWTH_SNAPS);
  const chains = buildCausalChains(detectCausalEvents(i), i);
  for (const c of chains) {
    assert.equal(c.narrativeId, 'n1');
    assert.equal(c.createdAt, NOW);
  }
});

test('demo ai-jobs produces a coherent growth chain whose summary names sources', () => {
  const i: CausalInput = { ...DEMO_CAUSAL_INPUTS[0], now: NOW };
  const chains = buildCausalChains(detectCausalEvents(i), i);
  const growth = chains.find((c) => c.chainName === 'Growth cause')!;
  assert.ok(growth.summary.includes('sources'));
  assert.ok(growth.summary.includes('signals rose'));
});
