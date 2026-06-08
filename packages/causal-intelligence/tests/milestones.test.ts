import { test } from 'node:test';
import assert from 'node:assert/strict';

import { captureNarrativeSnapshot, evolutionSeries } from '@hsi/temporal-intelligence';
import type { NarrativeSnapshot, NarrativeStats } from '@hsi/temporal-intelligence';

import { detectNarrativeMilestones } from '../src/milestones';
import { detectCausalEvents } from '../src/events';
import { buildCausalChains } from '../src/chains';
import { explainNarrativeChange } from '../src/explanation';
import { causalDemo, DEMO_CAUSAL_INPUTS, FIXTURE_NOW } from '../src/fixtures';
import type { CausalInput, MilestoneType } from '../src/types';

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
  return { narrativeId: 'n1', snapshots: snaps, evolution: evolutionSeries(snaps, NOW), now: NOW };
}

function ms(i: CausalInput): MilestoneType[] {
  return detectNarrativeMilestones(i, detectCausalEvents(i)).map((m) => m.milestoneType);
}

// ---- Milestone detection ----------------------------------------------------

test('birth detected on the first snapshot with signals', () => {
  const i = input([mk(20, { signalCount: 4, sourceCount: 1 }), mk(14, { signalCount: 6 })]);
  const all = detectNarrativeMilestones(i, detectCausalEvents(i));
  const birth = all.find((m) => m.milestoneType === 'birth')!;
  assert.ok(birth);
  assert.equal(birth.occurredAt, daysBefore(20));
  assert.equal(birth.metrics.signals, 4);
});

test('growth detected on a sustained rise', () => {
  const i = input([
    mk(28, { signalCount: 5 }),
    mk(21, { signalCount: 12 }),
    mk(14, { signalCount: 30 }),
  ]);
  assert.ok(ms(i).includes('growth'));
});

test('viral detected on a sharp signal + amplification surge', () => {
  const i = input([
    mk(14, { signalCount: 10, amplificationScore: 20 }),
    mk(7, { signalCount: 40, amplificationScore: 55 }),
  ]);
  const all = detectNarrativeMilestones(i, detectCausalEvents(i));
  const viral = all.find((m) => m.milestoneType === 'viral')!;
  assert.ok(viral);
  assert.ok(viral.metrics.signalPct >= 100);
  assert.ok(viral.metrics.ampDelta >= 20);
});

test('peak detected at the global max before a fall', () => {
  const i = input([
    mk(21, { signalCount: 10 }),
    mk(14, { signalCount: 50 }),
    mk(7, { signalCount: 20 }),
  ]);
  const all = detectNarrativeMilestones(i, detectCausalEvents(i));
  const peak = all.find((m) => m.milestoneType === 'peak')!;
  assert.ok(peak);
  assert.equal(peak.metrics.peakSignals, 50);
});

test('decline detected on a sustained drop', () => {
  const i = input([
    mk(28, { signalCount: 60 }),
    mk(21, { signalCount: 30 }),
    mk(14, { signalCount: 10 }),
  ]);
  assert.ok(ms(i).includes('decline'));
});

test('death detected when stale beyond DEAD_STALE_DAYS', () => {
  // Last snapshot 40 days before now → dead.
  const i = input([mk(60, { signalCount: 30 }), mk(40, { signalCount: 8 })]);
  const all = detectNarrativeMilestones(i, detectCausalEvents(i));
  const death = all.find((m) => m.milestoneType === 'death')!;
  assert.ok(death);
  assert.ok(death.metrics.staleDays >= 21);
});

test('resurgence detected on a renewed rise after a dip', () => {
  const i = input([
    mk(28, { signalCount: 20 }),
    mk(21, { signalCount: 8 }), // dip
    mk(14, { signalCount: 26 }), // resurge
  ]);
  const all = detectNarrativeMilestones(i, detectCausalEvents(i));
  const res = all.find((m) => m.milestoneType === 'resurgence')!;
  assert.ok(res);
  assert.equal(res.metrics.trough, 8);
  assert.equal(res.metrics.recoveredTo, 26);
});

test('all 7 milestone types are detectable across crafted histories', () => {
  const seen = new Set<string>();
  // birth + growth + viral + peak
  ms(input([
    mk(28, { signalCount: 4, amplificationScore: 20 }),
    mk(21, { signalCount: 16, amplificationScore: 50 }),
    mk(14, { signalCount: 40, amplificationScore: 80 }),
    mk(7, { signalCount: 20, amplificationScore: 40 }),
  ])).forEach((t) => seen.add(t));
  // decline
  ms(input([mk(28, { signalCount: 60 }), mk(21, { signalCount: 30 }), mk(14, { signalCount: 10 })])).forEach((t) => seen.add(t));
  // death (stale)
  ms(input([mk(60, { signalCount: 30 }), mk(40, { signalCount: 8 })])).forEach((t) => seen.add(t));
  // resurgence
  ms(input([mk(28, { signalCount: 20 }), mk(21, { signalCount: 8 }), mk(14, { signalCount: 26 })])).forEach((t) => seen.add(t));

  for (const t of ['birth', 'growth', 'viral', 'peak', 'decline', 'death', 'resurgence']) {
    assert.ok(seen.has(t), `expected milestone ${t}`);
  }
});

test('milestones carry confidence (0..1) and metrics', () => {
  const i = input([mk(28, { signalCount: 5 }), mk(21, { signalCount: 12 }), mk(14, { signalCount: 30 })]);
  const all = detectNarrativeMilestones(i, detectCausalEvents(i));
  assert.ok(all.length > 0);
  for (const m of all) {
    assert.ok(m.confidence >= 0 && m.confidence <= 1);
    assert.ok(Object.keys(m.metrics).length > 0);
    assert.ok(m.description.length > 0);
    assert.equal(m.createdAt, NOW);
  }
});

test('milestones are time-ordered and deterministic', () => {
  const i = input([mk(28, { signalCount: 5 }), mk(21, { signalCount: 12 }), mk(14, { signalCount: 30 }), mk(7, { signalCount: 20 })]);
  const a = detectNarrativeMilestones(i, detectCausalEvents(i));
  const b = detectNarrativeMilestones(i, detectCausalEvents(i));
  assert.deepEqual(a, b);
  for (let k = 1; k < a.length; k += 1) {
    assert.ok(Date.parse(a[k].occurredAt) >= Date.parse(a[k - 1].occurredAt));
  }
});

// ---- Explanation engine (data-grounded, honest) -----------------------------

test('explanation references real metrics (+400% surge)', () => {
  const i = input([mk(14, { signalCount: 100, amplificationScore: 30 }), mk(7, { signalCount: 500, amplificationScore: 60 })]);
  const events = detectCausalEvents(i);
  const exp = explainNarrativeChange(i, events, buildCausalChains(events, i));
  assert.ok(exp.text.includes('+400%') || exp.factors.some((f) => f.detail.includes('+400%')));
  assert.ok(exp.factors.length > 0);
});

test('explanation never references absent data (no source clause when no expansion)', () => {
  // Only an amplification spike — no source/community/contradiction change.
  const i = input([
    mk(14, { signalCount: 10, sourceCount: 2, communityCount: 1, amplificationScore: 20, contradictionRatio: 0.1 }),
    mk(7, { signalCount: 11, sourceCount: 2, communityCount: 1, amplificationScore: 80, contradictionRatio: 0.1 }),
  ]);
  const events = detectCausalEvents(i);
  const exp = explainNarrativeChange(i, events, buildCausalChains(events, i));
  assert.ok(!exp.text.includes('new source'), 'no fabricated source clause');
  assert.ok(exp.text.includes('amplification'), 'mentions the real amplification spike');
});

test('thin data → caveat + lowered confidence', () => {
  const i = input([mk(14, { sourceCount: 2 }), mk(7, { sourceCount: 4 })]); // one weak event, 2 snapshots
  const events = detectCausalEvents(i);
  const exp = explainNarrativeChange(i, events, buildCausalChains(events, i));
  assert.ok(exp.confidence <= 0.5);
  assert.ok(/thin/i.test(exp.text));
});

test('no events → inconclusive explanation, low confidence, no fabricated factors', () => {
  const i = input([mk(7, { signalCount: 10 })]);
  const exp = explainNarrativeChange(i, [], []);
  assert.equal(exp.factors.length, 0);
  assert.ok(exp.confidence <= 0.3);
  assert.ok(/inconclusive|insufficient/i.test(exp.text + exp.headline));
});

test('explanation reports an unexplained residual', () => {
  const i = input([mk(14, { signalCount: 5, sourceCount: 1, amplificationScore: 10 }), mk(7, { signalCount: 50, sourceCount: 5, amplificationScore: 80 })]);
  const events = detectCausalEvents(i);
  const exp = explainNarrativeChange(i, events, buildCausalChains(events, i));
  assert.ok(/unexplained/.test(exp.text));
});

test('declined narrative is explained by decline drivers, not surges', () => {
  const i = input([
    mk(60, { signalCount: 60, amplificationScore: 80, contradictionRatio: 0.2 }),
    mk(45, { signalCount: 30, amplificationScore: 50, contradictionRatio: 0.32 }),
    mk(30, { signalCount: 12, amplificationScore: 28, contradictionRatio: 0.45 }),
  ]);
  const events = detectCausalEvents(i);
  const exp = explainNarrativeChange(i, events, buildCausalChains(events, i));
  assert.ok(exp.headline.includes('declined'));
  // Lead sentence should not claim it declined "because signals surged".
  const lead = exp.text.split('.')[0];
  assert.ok(!lead.includes('surged'), `lead should not cite a surge: ${lead}`);
});

// ---- End-to-end demo --------------------------------------------------------

test('causalDemo runs end-to-end for every narrative', () => {
  const out = causalDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.equal(out.narratives.length, DEMO_CAUSAL_INPUTS.length);
  for (const n of out.narratives) {
    assert.ok(n.events.length > 0, `${n.narrativeId} has events`);
    assert.ok(n.chains.length > 0, `${n.narrativeId} has chains`);
    assert.ok(n.explanation.text.length > 0);
    assert.ok(n.replay.length > 0);
    assert.ok(n.milestones.length > 0);
    assert.ok(n.attribution.unexplained >= 0 && n.attribution.unexplained <= 100);
  }
});

test('causalDemo is deterministic', () => {
  assert.deepEqual(causalDemo(), causalDemo());
});

test('demo ai-jobs hits birth/viral/growth/peak; crypto hits decline/death; meme hits resurgence', () => {
  const out = causalDemo();
  const byId = new Map(out.narratives.map((n) => [n.narrativeId, n.milestones.map((m) => m.milestoneType)]));
  const aj = byId.get('ai-jobs')!;
  assert.ok(aj.includes('birth') && aj.includes('viral') && aj.includes('growth') && aj.includes('peak'));
  const cc = byId.get('crypto-crash')!;
  assert.ok(cc.includes('decline') && cc.includes('death'));
  const mm = byId.get('meme-stock')!;
  assert.ok(mm.includes('resurgence'));
});

test('demo crypto-crash explanation reads as a decline', () => {
  const out = causalDemo();
  const cc = out.narratives.find((n) => n.narrativeId === 'crypto-crash')!;
  assert.ok(cc.explanation.headline.includes('declined'));
});
