import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureNarrativeSnapshot,
  evolutionSeries,
} from '@hsi/temporal-intelligence';
import { detectCausalEvents } from '@hsi/causal-intelligence';
import type {
  CausalInput,
  NarrativeSnapshot,
} from '@hsi/causal-intelligence';
import type { NarrativeStats } from '@hsi/temporal-intelligence';

import { runSensitivityAnalysis, eventTypeLabel } from '../src/sensitivity';
import type { DecisionInput } from '../src/types';

const NOW = '2026-04-01T00:00:00.000Z';
const DAY = 86400000;

function daysBefore(d: number): string {
  return new Date(Date.parse(NOW) - d * DAY).toISOString();
}
function snap(
  id: string,
  ageDays: number,
  stats: Omit<NarrativeStats, 'narrativeId'>,
): NarrativeSnapshot {
  return captureNarrativeSnapshot({ narrativeId: id, ...stats }, daysBefore(ageDays));
}

// A history where the amplification spike is the dominant cause (20→90 leap
// while signals/sources/communities grow only gently).
const SNAPS: NarrativeSnapshot[] = [
  snap('n', 28, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 20, reliabilityScore: 48, supportRatio: 0.5, contradictionRatio: 0.28 }),
  snap('n', 21, { signalCount: 33, sourceCount: 4, communityCount: 3, amplificationScore: 22, reliabilityScore: 47, supportRatio: 0.52, contradictionRatio: 0.26 }),
  snap('n', 14, { signalCount: 38, sourceCount: 5, communityCount: 4, amplificationScore: 90, reliabilityScore: 45, supportRatio: 0.55, contradictionRatio: 0.22 }),
  snap('n', 7, { signalCount: 44, sourceCount: 5, communityCount: 4, amplificationScore: 93, reliabilityScore: 44, supportRatio: 0.57, contradictionRatio: 0.2 }),
  snap('n', 2, { signalCount: 48, sourceCount: 5, communityCount: 4, amplificationScore: 94, reliabilityScore: 43, supportRatio: 0.58, contradictionRatio: 0.19 }),
];

function buildInput(id: string, snaps: NarrativeSnapshot[]): DecisionInput {
  const evolution = evolutionSeries(snaps, NOW);
  const ci: CausalInput = { narrativeId: id, snapshots: snaps, evolution, now: NOW };
  const events = detectCausalEvents(ci);
  return { narrativeId: id, snapshots: snaps, evolution, events, now: NOW };
}

const INPUT = buildInput('n', SNAPS);

test('eventTypeLabel humanizes snake_case', () => {
  assert.equal(eventTypeLabel('amplification_spike'), 'Amplification Spike');
  assert.equal(eventTypeLabel('signal_surge'), 'Signal Surge');
  assert.equal(eventTypeLabel(''), '');
});

test('identifies a dominant cause', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  assert.ok(s.dominant, 'dominant should be defined');
  assert.equal(s.dominant!.eventType, 'amplification_spike');
});

test('dominant share is the largest', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  for (const c of s.contributions) {
    assert.ok(s.dominant!.sharePct >= c.sharePct - 1e-9);
  }
});

test('dominant amplification spike is a strong majority', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  assert.ok(s.dominant!.sharePct > 50, `expected >50, got ${s.dominant!.sharePct}`);
});

test('contributions are sorted descending by share', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  for (let i = 1; i < s.contributions.length; i += 1) {
    assert.ok(s.contributions[i - 1].sharePct >= s.contributions[i].sharePct - 1e-9);
  }
});

test('unexplained residual is present and not forced to 0 or 100', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  assert.ok(s.unexplainedPct > 0, 'never force full explanation');
  assert.ok(s.unexplainedPct < 100);
});

test('explained shares + unexplained do not exceed 100', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  const explained = s.contributions.reduce((a, c) => a + c.sharePct, 0);
  assert.ok(explained + s.unexplainedPct <= 100.5);
});

test('contributions carry real event ids', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  const hit = s.contributions.find((c) => c.eventType === 'amplification_spike');
  assert.ok(hit);
  assert.ok(hit!.eventId && hit!.eventId.includes('amplification_spike'));
});

test('reasoning references the dominant cause', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  assert.ok(s.reasoning.length > 0);
  assert.ok(s.reasoning.some((r) => /Dominant cause/.test(r)));
  assert.ok(s.reasoning.some((r) => /Amplification Spike/.test(r)));
});

test('reasoning mentions the unexplained residual', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  assert.ok(s.reasoning.some((r) => /unexplained/i.test(r)));
});

test('empty events → fully unexplained, no dominant', () => {
  const empty: DecisionInput = { ...INPUT, events: [] };
  const s = runSensitivityAnalysis(empty, NOW);
  assert.equal(s.unexplainedPct, 100);
  assert.equal(s.dominant, undefined);
  assert.equal(s.contributions.length, 0);
  assert.ok(s.reasoning.some((r) => /No causal events/i.test(r)));
});

test('deterministic across runs', () => {
  const a = runSensitivityAnalysis(INPUT, NOW);
  const b = runSensitivityAnalysis(INPUT, NOW);
  assert.deepEqual(a, b);
});

test('share ordering style matches an 81/13/6-like cascade', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  // top contribution dominates, the rest taper off
  assert.ok(s.contributions[0].sharePct > 40);
  if (s.contributions.length > 1) {
    assert.ok(s.contributions[0].sharePct > s.contributions[1].sharePct);
  }
});

test('all contribution shares are non-negative', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  for (const c of s.contributions) assert.ok(c.sharePct >= 0);
});

test('dominant matches the first contribution type', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  assert.equal(s.contributions[0].eventType, s.dominant!.eventType);
});

test('single-snapshot narrative yields no events → unexplained 100', () => {
  const single: NarrativeSnapshot[] = [SNAPS[0]];
  const inp2 = buildInput('n', single);
  const s = runSensitivityAnalysis(inp2, NOW);
  assert.equal(s.unexplainedPct, 100);
});

test('reasoning is non-empty and references percentages', () => {
  const s = runSensitivityAnalysis(INPUT, NOW);
  assert.ok(s.reasoning.length >= 2);
  assert.ok(s.reasoning.some((r) => /%/.test(r)));
});

test('injected now does not affect attribution output', () => {
  const a = runSensitivityAnalysis(INPUT, NOW);
  const b = runSensitivityAnalysis(INPUT, '2030-01-01T00:00:00.000Z');
  assert.deepEqual(a.contributions, b.contributions);
});
