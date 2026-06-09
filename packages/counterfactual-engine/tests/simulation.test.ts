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

import {
  buildAlternativeTimeline,
  buildBaselineTimeline,
  compareTimelines,
  repropagateSnapshots,
  windowDays,
  VIRAL_COMMUNITY_THRESHOLD,
} from '../src/simulation';
import type {
  CounterfactualEventChange,
  CounterfactualInput,
} from '../src/types';

const NOW = '2026-03-01T00:00:00.000Z';
const DAY = 86400000;
const db = (d: number) => new Date(Date.parse(NOW) - d * DAY).toISOString();

function snap(
  id: string,
  age: number,
  s: Omit<NarrativeStats, 'narrativeId'>,
): NarrativeSnapshot {
  return captureNarrativeSnapshot({ narrativeId: id, ...s }, db(age));
}

const SNAPS: NarrativeSnapshot[] = [
  snap('g', 28, { signalCount: 5, sourceCount: 1, communityCount: 1, amplificationScore: 20, reliabilityScore: 55, supportRatio: 0.55, contradictionRatio: 0.3 }),
  snap('g', 21, { signalCount: 12, sourceCount: 3, communityCount: 2, amplificationScore: 42, reliabilityScore: 58, supportRatio: 0.6, contradictionRatio: 0.22 }),
  snap('g', 14, { signalCount: 30, sourceCount: 5, communityCount: 4, amplificationScore: 72, reliabilityScore: 61, supportRatio: 0.68, contradictionRatio: 0.12 }),
  snap('g', 7, { signalCount: 40, sourceCount: 6, communityCount: 5, amplificationScore: 90, reliabilityScore: 63, supportRatio: 0.72, contradictionRatio: 0.08 }),
  snap('g', 2, { signalCount: 34, sourceCount: 6, communityCount: 5, amplificationScore: 78, reliabilityScore: 63, supportRatio: 0.7, contradictionRatio: 0.09 }),
];

function mkInput(snaps: NarrativeSnapshot[]): CounterfactualInput {
  const evolution = evolutionSeries(snaps, NOW);
  const causal: CausalInput = {
    narrativeId: 'g',
    snapshots: snaps,
    evolution,
    now: NOW,
  };
  return {
    narrativeId: 'g',
    snapshots: snaps,
    evolution,
    events: detectCausalEvents(causal),
    now: NOW,
  };
}

const INPUT = mkInput(SNAPS);

function changeFor(eventType: string, action: CounterfactualEventChange['action'], impact: number): CounterfactualEventChange[] {
  return INPUT.events
    .filter((e) => e.eventType === eventType)
    .map((e) => ({
      originalEventId: e.id,
      eventType: e.eventType,
      action,
      impactScore: impact,
      reasoning: 'test change',
    }));
}

// ---- baseline timeline ------------------------------------------------------

test('buildBaselineTimeline mirrors the real snapshot series', () => {
  const tl = buildBaselineTimeline(INPUT, NOW);
  assert.equal(tl.frames.length, SNAPS.length);
  assert.equal(tl.frames[0].signals, 5);
  assert.equal(tl.frames.at(-1)!.signals, 34);
  assert.ok(tl.finalForecastState, 'final forecast computed');
  tl.frames.forEach((f) => assert.ok(typeof f.forecast === 'string'));
});

test('empty timeline with no changes equals baseline (identity)', () => {
  const base = buildBaselineTimeline(INPUT, NOW);
  const alt = buildAlternativeTimeline(INPUT, [], NOW);
  assert.deepEqual(alt, base);
});

// ---- re-propagation ---------------------------------------------------------

test('repropagateSnapshots returns same-length, ordered series', () => {
  const timeById = new Map(INPUT.events.map((e) => [e.id!, e.occurredAt]));
  const out = repropagateSnapshots(SNAPS, changeFor('source_expansion', 'removed', 60), timeById);
  assert.equal(out.length, SNAPS.length);
  for (let i = 1; i < out.length; i += 1) {
    assert.ok(
      Date.parse(out[i].capturedAt) >= Date.parse(out[i - 1].capturedAt),
      'time-ordered',
    );
  }
});

test('repropagateSnapshots leaves the first snapshot unchanged (no pre-history rewrite)', () => {
  const timeById = new Map(INPUT.events.map((e) => [e.id!, e.occurredAt]));
  const out = repropagateSnapshots(SNAPS, changeFor('source_expansion', 'removed', 60), timeById);
  assert.equal(out[0].signalCount, SNAPS[0].signalCount);
  assert.equal(out[0].sourceCount, SNAPS[0].sourceCount);
  assert.equal(out[0].amplificationScore, SNAPS[0].amplificationScore);
});

test('removing source_expansion lowers downstream sources + signals monotonically vs baseline', () => {
  const timeById = new Map(INPUT.events.map((e) => [e.id!, e.occurredAt]));
  const out = repropagateSnapshots(SNAPS, changeFor('source_expansion', 'removed', 60), timeById);
  // After the first divergence each altered snapshot's signals ≤ baseline's.
  let diverged = false;
  for (let i = 1; i < out.length; i += 1) {
    if (out[i].signalCount !== SNAPS[i].signalCount) diverged = true;
    if (diverged) {
      assert.ok(out[i].signalCount <= SNAPS[i].signalCount, `step ${i} signals`);
      assert.ok(out[i].sourceCount <= SNAPS[i].sourceCount, `step ${i} sources`);
    }
  }
  assert.ok(diverged, 'series actually diverged from baseline');
});

test('larger impact removes more of the increment (monotonic in impact)', () => {
  const timeById = new Map(INPUT.events.map((e) => [e.id!, e.occurredAt]));
  const lo = repropagateSnapshots(SNAPS, changeFor('source_expansion', 'removed', 30), timeById);
  const hi = repropagateSnapshots(SNAPS, changeFor('source_expansion', 'removed', 90), timeById);
  assert.ok(
    hi.at(-1)!.signalCount <= lo.at(-1)!.signalCount,
    'higher impact => fewer final signals',
  );
});

test('amplifying source_expansion raises downstream metrics vs baseline', () => {
  const timeById = new Map(INPUT.events.map((e) => [e.id!, e.occurredAt]));
  const out = repropagateSnapshots(SNAPS, changeFor('source_expansion', 'amplified', 60), timeById);
  assert.ok(out.at(-1)!.signalCount >= SNAPS.at(-1)!.signalCount, 'more signals');
});

test('metrics stay within valid bounds after re-propagation', () => {
  const timeById = new Map(INPUT.events.map((e) => [e.id!, e.occurredAt]));
  const out = repropagateSnapshots(SNAPS, changeFor('amplification_spike', 'removed', 80), timeById);
  for (const s of out) {
    assert.ok(s.signalCount >= 0);
    assert.ok(s.sourceCount >= 0);
    assert.ok(s.communityCount >= 0);
    assert.ok(s.amplificationScore >= 0 && s.amplificationScore <= 100);
    assert.ok(s.reliabilityScore >= 0 && s.reliabilityScore <= 100);
    assert.ok(s.contradictionRatio >= 0 && s.contradictionRatio <= 1);
  }
});

test('re-propagation is deterministic', () => {
  const timeById = new Map(INPUT.events.map((e) => [e.id!, e.occurredAt]));
  const a = repropagateSnapshots(SNAPS, changeFor('community_growth', 'removed', 50), timeById);
  const b = repropagateSnapshots(SNAPS, changeFor('community_growth', 'removed', 50), timeById);
  assert.deepEqual(a, b);
});

// ---- buildAlternativeTimeline + forecast re-run -----------------------------

test('buildAlternativeTimeline re-runs the real forecaster on altered series', () => {
  const base = buildBaselineTimeline(INPUT, NOW);
  const alt = buildAlternativeTimeline(INPUT, changeFor('source_expansion', 'removed', 90), NOW);
  assert.equal(alt.frames.length, base.frames.length);
  assert.ok(alt.finalForecastState, 'forecast re-run produced a state');
  // The strongly-removed series should have fewer final signals.
  assert.ok(alt.frames.at(-1)!.signals < base.frames.at(-1)!.signals);
});

test('per-frame forecasts present on altered timeline', () => {
  const alt = buildAlternativeTimeline(INPUT, changeFor('source_expansion', 'removed', 60), NOW);
  alt.frames.forEach((f) => assert.ok(typeof f.forecast === 'string' && f.forecast.length > 0));
});

// ---- compareTimelines -------------------------------------------------------

test('compareTimelines: identical timelines => zero deltas, no flip', () => {
  const base = buildBaselineTimeline(INPUT, NOW);
  const d = compareTimelines(base, base);
  assert.equal(d.signalDeltaPct, 0);
  assert.equal(d.amplificationDelta, 0);
  assert.equal(d.growthDeltaPct, 0);
  assert.equal(d.forecastChanged, false);
});

test('compareTimelines: removal yields negative signal/amplification deltas', () => {
  const base = buildBaselineTimeline(INPUT, NOW);
  const alt = buildAlternativeTimeline(INPUT, changeFor('source_expansion', 'removed', 60), NOW);
  const d = compareTimelines(base, alt);
  assert.ok(d.signalDeltaPct < 0);
  assert.ok(d.amplificationDelta <= 0);
});

test('compareTimelines: forecastChanged true when final states differ', () => {
  const base = buildBaselineTimeline(INPUT, NOW);
  const alt = buildAlternativeTimeline(INPUT, changeFor('source_expansion', 'removed', 100), NOW);
  const d = compareTimelines(base, alt);
  if (alt.finalForecastState !== base.finalForecastState) {
    assert.equal(d.forecastChanged, true);
  } else {
    assert.equal(d.forecastChanged, false);
  }
});

// ---- helpers ----------------------------------------------------------------

test('windowDays computes the span of the series', () => {
  assert.equal(Math.round(windowDays(SNAPS)), 26); // 28d ago → 2d ago
  assert.equal(windowDays([SNAPS[0]]), 0);
  assert.equal(windowDays([]), 0);
});

test('VIRAL_COMMUNITY_THRESHOLD is the documented constant', () => {
  assert.equal(VIRAL_COMMUNITY_THRESHOLD, 3);
});

test('removing community growth can push final communities below viral threshold', () => {
  const alt = buildAlternativeTimeline(INPUT, changeFor('community_growth', 'removed', 90), NOW);
  const base = buildBaselineTimeline(INPUT, NOW);
  assert.ok(base.frames.at(-1)!.communities >= VIRAL_COMMUNITY_THRESHOLD);
  assert.ok(alt.frames.at(-1)!.communities < base.frames.at(-1)!.communities);
});
