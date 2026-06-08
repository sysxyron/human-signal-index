import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildNarrativeGenealogy } from '../src/genealogy';
import type { NarrativeInput, SignalInput, TemporalDeps } from '../src/types';

const NOW = '2026-02-01T00:00:00.000Z';
const deps: TemporalDeps = { now: NOW };

function days(n: number): string {
  return new Date(Date.parse(NOW) - n * 86400000).toISOString();
}

test('derived_from: later + similar + shared entities/sources', async () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'parent',
      name: 'AI displacing jobs automation labor economy',
      signalIds: [],
      entityIds: ['ai', 'labor'],
      sourceIds: ['src1', 'src2'],
      firstSeenAt: days(20),
    },
    {
      id: 'child',
      name: 'AI displacing jobs automation labor economy growth',
      signalIds: [],
      entityIds: ['ai', 'labor'],
      sourceIds: ['src1'],
      firstSeenAt: days(5),
    },
  ];
  const edges = await buildNarrativeGenealogy(narratives, [], deps);
  const derived = edges.find((e) => e.relationship === 'derived_from');
  assert.ok(derived, 'expected a derived_from edge');
  assert.equal(derived!.parentNarrativeId, 'parent');
  assert.equal(derived!.childNarrativeId, 'child');
  assert.ok(derived!.confidence > 0);
});

test('contradicts: opposing stance with high overlap', async () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'claim',
      name: 'Vaccine causes autism children study',
      signalIds: [],
      entityIds: ['vaccine', 'autism'],
      sourceIds: ['src1'],
      firstSeenAt: days(20),
    },
    {
      id: 'rebuttal',
      name: 'Vaccine autism link false debunked myth children study',
      signalIds: [],
      entityIds: ['vaccine', 'autism'],
      sourceIds: ['src1'],
      firstSeenAt: days(5),
    },
  ];
  const edges = await buildNarrativeGenealogy(narratives, [], deps);
  assert.ok(edges.some((e) => e.relationship === 'contradicts'));
});

test('no edge when unrelated', async () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'a',
      name: 'Quarterly earnings report stock market finance',
      signalIds: [],
      entityIds: ['stocks'],
      sourceIds: ['srcA'],
      firstSeenAt: days(20),
    },
    {
      id: 'b',
      name: 'Local sports team championship victory parade',
      signalIds: [],
      entityIds: ['sports'],
      sourceIds: ['srcB'],
      firstSeenAt: days(5),
    },
  ];
  const edges = await buildNarrativeGenealogy(narratives, [], deps);
  assert.equal(edges.length, 0);
});

test('amplifies: reuses sources + intensification cues', async () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'orig',
      name: 'New product launch announcement tech gadget',
      signalIds: [],
      entityIds: ['product'],
      sourceIds: ['srcShared'],
      firstSeenAt: days(20),
    },
    {
      id: 'amp',
      name: 'New product launch announcement tech gadget going viral spreading everywhere surge',
      signalIds: [],
      entityIds: ['product'],
      sourceIds: ['srcShared'],
      firstSeenAt: days(5),
    },
  ];
  const edges = await buildNarrativeGenealogy(narratives, [], deps);
  assert.ok(edges.some((e) => e.relationship === 'amplifies' || e.relationship === 'derived_from'));
});

test('merged_from: child draws from two earlier parents', async () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'solar',
      name: 'Solar power energy growth grid renewable',
      signalIds: [],
      entityIds: ['solar', 'energy', 'grid'],
      sourceIds: ['srcE', 'srcN'],
      firstSeenAt: days(40),
    },
    {
      id: 'wind',
      name: 'Wind power energy growth grid renewable',
      signalIds: [],
      entityIds: ['wind', 'energy', 'grid'],
      sourceIds: ['srcE', 'srcG'],
      firstSeenAt: days(38),
    },
    {
      id: 'renew',
      name: 'Renewable energy solar wind power grid growth',
      signalIds: [],
      entityIds: ['solar', 'wind', 'energy', 'grid'],
      sourceIds: ['srcE', 'srcN', 'srcG'],
      firstSeenAt: days(5),
    },
  ];
  const edges = await buildNarrativeGenealogy(narratives, [], deps);
  const merges = edges.filter((e) => e.relationship === 'merged_from' && e.childNarrativeId === 'renew');
  assert.ok(merges.length >= 2, 'renew should merge from both solar and wind');
});

test('split_from: child is a diverging subset of a larger parent', async () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'core',
      name: 'Climate change action urgency emissions policy energy temperature global',
      signalIds: [],
      entityIds: ['emissions', 'policy', 'energy', 'temperature', 'ipcc'],
      sourceIds: ['srcS', 'srcN'],
      firstSeenAt: days(30),
    },
    {
      id: 'tech',
      name: 'Climate change emissions energy technology',
      signalIds: [],
      entityIds: ['emissions', 'energy'],
      sourceIds: ['srcS'],
      firstSeenAt: days(5),
    },
  ];
  const edges = await buildNarrativeGenealogy(narratives, [], deps);
  assert.ok(edges.some((e) => e.childNarrativeId === 'tech'));
});

test('time ordering: no edge when parent is not earlier', async () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'later',
      name: 'AI displacing jobs automation labor economy',
      signalIds: [],
      entityIds: ['ai', 'labor'],
      sourceIds: ['src1'],
      firstSeenAt: days(5),
    },
    {
      id: 'earlier',
      name: 'AI displacing jobs automation labor economy',
      signalIds: [],
      entityIds: ['ai', 'labor'],
      sourceIds: ['src1'],
      firstSeenAt: days(20),
    },
  ];
  const edges = await buildNarrativeGenealogy(narratives, [], deps);
  // Only earlier→later is valid; never later→earlier.
  assert.ok(edges.every((e) => e.parentNarrativeId === 'earlier'));
});

test('deterministic: same inputs → identical edges', async () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'p',
      name: 'AI displacing jobs automation labor economy',
      signalIds: [],
      entityIds: ['ai', 'labor'],
      sourceIds: ['src1'],
      firstSeenAt: days(20),
    },
    {
      id: 'c',
      name: 'AI displacing jobs automation labor economy growth',
      signalIds: [],
      entityIds: ['ai', 'labor'],
      sourceIds: ['src1'],
      firstSeenAt: days(5),
    },
  ];
  const e1 = await buildNarrativeGenealogy(narratives, [], deps);
  const e2 = await buildNarrativeGenealogy(narratives, [], deps);
  assert.deepEqual(e1, e2);
});

test('uses injected embed when provided', async () => {
  let called = false;
  const embed = async (texts: string[]): Promise<number[][]> => {
    called = true;
    // identical vectors → similarity 1
    return texts.map(() => [1, 0, 0]);
  };
  const narratives: NarrativeInput[] = [
    { id: 'p', name: 'x', signalIds: [], entityIds: ['e'], sourceIds: ['s'], firstSeenAt: days(20) },
    { id: 'c', name: 'y', signalIds: [], entityIds: ['e'], sourceIds: ['s'], firstSeenAt: days(5) },
  ];
  const edges = await buildNarrativeGenealogy(narratives, [], { now: NOW, embed });
  assert.ok(called);
  assert.ok(edges.length >= 1);
});
