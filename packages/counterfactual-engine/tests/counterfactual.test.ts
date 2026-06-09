import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureNarrativeSnapshot,
  evolutionSeries,
} from '@hsi/temporal-intelligence';
import { detectCausalEvents } from '@hsi/causal-intelligence';
import type {
  CausalInput,
  InfluenceEdge,
  NarrativeSnapshot,
} from '@hsi/causal-intelligence';
import type { NarrativeStats } from '@hsi/temporal-intelligence';

import { generateCounterfactual, MAX_CONFIDENCE } from '../src/counterfactual';
import type { CounterfactualInput, ScenarioType } from '../src/types';

const NOW = '2026-03-01T00:00:00.000Z';
const DAY = 86400000;

function daysBefore(d: number): string {
  return new Date(Date.parse(NOW) - d * DAY).toISOString();
}

function snap(
  narrativeId: string,
  ageDays: number,
  stats: Omit<NarrativeStats, 'narrativeId'>,
): NarrativeSnapshot {
  return captureNarrativeSnapshot({ narrativeId, ...stats }, daysBefore(ageDays));
}

// A rich GROWTH history exercising every detector.
const GROWTH_SNAPS: NarrativeSnapshot[] = [
  snap('g', 28, { signalCount: 5, sourceCount: 1, communityCount: 1, amplificationScore: 20, reliabilityScore: 55, supportRatio: 0.55, contradictionRatio: 0.3 }),
  snap('g', 21, { signalCount: 12, sourceCount: 3, communityCount: 2, amplificationScore: 42, reliabilityScore: 58, supportRatio: 0.6, contradictionRatio: 0.22 }),
  snap('g', 14, { signalCount: 30, sourceCount: 5, communityCount: 4, amplificationScore: 72, reliabilityScore: 61, supportRatio: 0.68, contradictionRatio: 0.12 }),
  snap('g', 7, { signalCount: 40, sourceCount: 6, communityCount: 5, amplificationScore: 90, reliabilityScore: 63, supportRatio: 0.72, contradictionRatio: 0.08 }),
  snap('g', 2, { signalCount: 34, sourceCount: 6, communityCount: 5, amplificationScore: 78, reliabilityScore: 63, supportRatio: 0.7, contradictionRatio: 0.09 }),
];

// A DECLINE history with rising contradiction.
const DECLINE_SNAPS: NarrativeSnapshot[] = [
  snap('d', 40, { signalCount: 18, sourceCount: 3, communityCount: 2, amplificationScore: 55, reliabilityScore: 50, supportRatio: 0.5, contradictionRatio: 0.2 }),
  snap('d', 30, { signalCount: 60, sourceCount: 4, communityCount: 3, amplificationScore: 85, reliabilityScore: 48, supportRatio: 0.45, contradictionRatio: 0.28 }),
  snap('d', 20, { signalCount: 30, sourceCount: 3, communityCount: 2, amplificationScore: 50, reliabilityScore: 46, supportRatio: 0.4, contradictionRatio: 0.4 }),
  snap('d', 10, { signalCount: 12, sourceCount: 2, communityCount: 1, amplificationScore: 28, reliabilityScore: 44, supportRatio: 0.35, contradictionRatio: 0.45 }),
];

const INFLUENCE: InfluenceEdge[] = [
  {
    sourceNarrativeId: 'src',
    targetNarrativeId: 'g',
    influenceScore: 72,
    sharedEntities: 3,
    sharedSources: 2,
    sharedCommunities: 1,
    rationale: 'preceded surge',
    createdAt: NOW,
  },
];

function inputFor(
  narrativeId: string,
  snaps: NarrativeSnapshot[],
  influenceIn?: InfluenceEdge[],
): CounterfactualInput {
  const evolution = evolutionSeries(snaps, NOW);
  const causal: CausalInput = {
    narrativeId,
    snapshots: snaps,
    evolution,
    influenceIn,
    now: NOW,
  };
  return {
    narrativeId,
    snapshots: snaps,
    evolution,
    events: detectCausalEvents(causal),
    now: NOW,
  };
}

const GROWTH = inputFor('g', GROWTH_SNAPS, INFLUENCE);
const DECLINE = inputFor('d', DECLINE_SNAPS);

const ALL_TYPES: ScenarioType[] = [
  'remove_event',
  'delay_event',
  'accelerate_event',
  'reduce_amplification',
  'increase_amplification',
  'remove_source',
  'add_source',
  'remove_community',
  'increase_reliability',
  'decrease_reliability',
  'remove_contradiction',
  'increase_contradiction',
];

// ---- Structural: every scenario type yields a well-formed result ------------

for (const t of ALL_TYPES) {
  test(`scenario ${t}: produces both timelines + deltas`, () => {
    // Use the narrative that actually has the relevant events.
    const input = t.includes('contradiction') ? DECLINE : GROWTH;
    const r = generateCounterfactual(input, { type: t }, NOW);
    assert.equal(r.scenarioType, t);
    assert.equal(r.narrativeId, input.narrativeId);
    assert.ok(r.original.frames.length >= 2, 'original timeline populated');
    assert.ok(r.counterfactual.frames.length >= 2, 'cf timeline populated');
    assert.ok(typeof r.deltas.signalDeltaPct === 'number');
    assert.ok(typeof r.deltas.amplificationDelta === 'number');
    assert.equal(typeof r.deltas.forecastChanged, 'boolean');
    assert.ok(typeof r.deltas.growthDeltaPct === 'number');
    assert.ok(r.original.finalForecastState, 'baseline final forecast present');
    assert.ok(r.counterfactual.finalForecastState, 'cf final forecast present');
  });

  test(`scenario ${t}: confidence in (0,MAX] and band consistent`, () => {
    const input = t.includes('contradiction') ? DECLINE : GROWTH;
    const r = generateCounterfactual(input, { type: t }, NOW);
    assert.ok(r.confidence > 0 && r.confidence <= MAX_CONFIDENCE, `conf ${r.confidence}`);
    if (r.confidenceBand === 'high') assert.ok(r.confidence >= 0.66);
    if (r.confidenceBand === 'low') assert.ok(r.confidence < 0.4);
  });

  test(`scenario ${t}: LIMITATIONS always present`, () => {
    const input = t.includes('contradiction') ? DECLINE : GROWTH;
    const r = generateCounterfactual(input, { type: t }, NOW);
    assert.ok(r.limitations.length >= 1, 'at least one limitation');
    assert.ok(
      r.limitations.some((l) => /estimate/i.test(l)),
      'limitations state this is an estimate, not certainty',
    );
  });

  test(`scenario ${t}: reasoning + summary present`, () => {
    const input = t.includes('contradiction') ? DECLINE : GROWTH;
    const r = generateCounterfactual(input, { type: t }, NOW);
    assert.ok(r.reasoning.length >= 1);
    assert.ok(r.summary.length > 0);
    assert.ok(/confidence/i.test(r.summary));
  });

  test(`scenario ${t}: deterministic (same input → identical output)`, () => {
    const input = t.includes('contradiction') ? DECLINE : GROWTH;
    const a = generateCounterfactual(input, { type: t }, NOW);
    const b = generateCounterfactual(input, { type: t }, NOW);
    assert.deepEqual(a, b);
  });
}

// ---- Grounding: evidence references real events -----------------------------

test('evidence references real detected events (explanation + strength)', () => {
  const r = generateCounterfactual(GROWTH, { type: 'remove_source' }, NOW);
  assert.ok(r.evidence.length >= 1);
  // Every evidence string for a matched change should name the event type and
  // include the real explanation substring from the causal event.
  const srcEvents = GROWTH.events.filter((e) => e.eventType === 'source_expansion');
  assert.ok(srcEvents.length >= 1);
  assert.ok(
    r.evidence.some((ev) => srcEvents.some((e) => ev.includes(e.explanation))),
    'evidence quotes a real event explanation',
  );
});

test('changes carry originalEventId of real events', () => {
  const r = generateCounterfactual(GROWTH, { type: 'reduce_amplification' }, NOW);
  assert.ok(r.changes.length >= 1);
  const ids = new Set(GROWTH.events.map((e) => e.id));
  for (const c of r.changes) {
    assert.ok(c.originalEventId && ids.has(c.originalEventId), 'change ties to a real event id');
    assert.equal(c.action, 'reduced');
    assert.ok(c.impactScore >= 0 && c.impactScore <= 100);
  }
});

// ---- Direction: spec example (remove source_expansion → growth slows) -------

test('removing source_expansion slows downstream growth (signals fall)', () => {
  const r = generateCounterfactual(GROWTH, { type: 'remove_source' }, NOW);
  assert.ok(r.deltas.signalDeltaPct < 0, `expected fall, got ${r.deltas.signalDeltaPct}`);
  const oLast = r.original.frames.at(-1)!;
  const cLast = r.counterfactual.frames.at(-1)!;
  assert.ok(cLast.signals < oLast.signals, 'cf final signals below baseline');
  assert.ok(cLast.communities <= oLast.communities, 'communities no higher');
});

test('strong removal of source_expansion can downgrade the forecast', () => {
  const r = generateCounterfactual(
    GROWTH,
    { type: 'remove_source', magnitude: 2 },
    NOW,
  );
  assert.equal(r.deltas.forecastChanged, true, 'forecast flips under strong removal');
  assert.equal(r.original.finalForecastState, 'rising');
  assert.notEqual(r.counterfactual.finalForecastState, 'rising');
  assert.ok(
    r.reasoning.some((s) => /Forecast state changes/.test(s)),
    'reasoning explains the flip',
  );
});

test('add_source (amplify) increases downstream growth vs baseline', () => {
  const r = generateCounterfactual(GROWTH, { type: 'add_source' }, NOW);
  assert.ok(r.deltas.signalDeltaPct > 0, `expected rise, got ${r.deltas.signalDeltaPct}`);
});

test('increase_contradiction on a declining narrative deepens the decline', () => {
  const r = generateCounterfactual(DECLINE, { type: 'increase_contradiction' }, NOW);
  assert.ok(
    r.deltas.signalDeltaPct < 0,
    `more contradiction should suppress reach, got ${r.deltas.signalDeltaPct}`,
  );
});

test('remove_contradiction on a declining narrative relieves the decline', () => {
  const r = generateCounterfactual(DECLINE, { type: 'remove_contradiction' }, NOW);
  assert.ok(
    r.deltas.signalDeltaPct > 0,
    `clearing contradictions should help reach, got ${r.deltas.signalDeltaPct}`,
  );
});

// ---- Confidence: upstream / thin-data penalties -----------------------------

test('upstream intervention has lower confidence than a downstream one', () => {
  const events = [...GROWTH.events].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const earliest = events[0];
  const latest = events.at(-1)!;
  const up = generateCounterfactual(
    GROWTH,
    { type: 'remove_event', targetEventId: earliest.id },
    NOW,
  );
  const down = generateCounterfactual(
    GROWTH,
    { type: 'remove_event', targetEventId: latest.id },
    NOW,
  );
  assert.ok(
    up.confidence <= down.confidence,
    `upstream ${up.confidence} should be ≤ downstream ${down.confidence}`,
  );
});

test('thin data lowers confidence and adds a limitation', () => {
  const thin = inputFor('thin', GROWTH_SNAPS.slice(0, 2));
  const r = generateCounterfactual(thin, { type: 'remove_source' }, NOW);
  assert.ok(
    r.limitations.some((l) => /thin data/i.test(l)),
    'thin-data limitation present',
  );
  const full = generateCounterfactual(GROWTH, { type: 'remove_source' }, NOW);
  assert.ok(r.confidence < full.confidence, 'thin confidence below full');
});

test('no matching event → low confidence + honest limitation, still valid', () => {
  // GROWTH has no contradiction_rise → remove_contradiction matches nothing.
  const r = generateCounterfactual(GROWTH, { type: 'remove_contradiction' }, NOW);
  assert.equal(r.changes.length, 0);
  assert.equal(r.confidenceBand, 'low');
  assert.ok(
    r.limitations.some((l) => /no matching causal event/i.test(l)),
    'states that no event matched',
  );
  assert.ok(r.original.frames.length >= 2, 'baseline still produced');
});

// ---- magnitude monotonicity -------------------------------------------------

test('larger removal magnitude => larger downstream effect', () => {
  const m1 = generateCounterfactual(GROWTH, { type: 'remove_source', magnitude: 1 }, NOW);
  const m2 = generateCounterfactual(GROWTH, { type: 'remove_source', magnitude: 2 }, NOW);
  assert.ok(
    Math.abs(m2.deltas.signalDeltaPct) >= Math.abs(m1.deltas.signalDeltaPct),
    'stronger removal moves signals at least as much',
  );
});

test('generatedAt carries injected now', () => {
  const r = generateCounterfactual(GROWTH, { type: 'remove_source' }, NOW);
  assert.equal(r.generatedAt, NOW);
});
