import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  attributionKey, isSelfLoop, isSelfAttribution, dedupeEdges, removeCycles,
  cleanAttribution, contributorAttributedWeight,
} from '../src/attribution';
import type { AttributionEdge } from '../src/types';

const edge = (o: string, d: string, rel: AttributionEdge['relationship'], w = 1, oo?: string, dd?: string): AttributionEdge => {
  const [ot, oi] = o.split(':'); const [dt, di] = d.split(':');
  return { origin: { type: ot as never, id: oi }, destination: { type: dt as never, id: di }, relationship: rel, weight: w, originOwner: oo, destinationOwner: dd };
};

test('attributionKey is stable + distinguishes direction', () => {
  const a = edge('signal:s1', 'investigation:i1', 'signal_to_investigation');
  const b = edge('investigation:i1', 'signal:s1', 'signal_to_investigation');
  assert.equal(attributionKey(a), attributionKey(edge('signal:s1', 'investigation:i1', 'signal_to_investigation')));
  assert.notEqual(attributionKey(a), attributionKey(b));
});

// ---- ANTI-GAMING ----------------------------------------------------------
test('self-loops are rejected', () => {
  assert.equal(isSelfLoop(edge('outcome:o1', 'outcome:o1', 'publication_to_outcome')), true);
  assert.equal(isSelfLoop(edge('signal:s1', 'investigation:i1', 'signal_to_investigation')), false);
  const r = cleanAttribution([edge('outcome:o1', 'outcome:o1', 'publication_to_outcome')]);
  assert.equal(r.clean.length, 0);
  assert.equal(r.dropped.selfLoops, 1);
});

test('duplicate edges are removed', () => {
  const e = edge('signal:s1', 'investigation:i1', 'signal_to_investigation');
  const r = cleanAttribution([e, e, e]);
  assert.equal(r.clean.length, 1);
  assert.equal(r.dropped.duplicates, 2);
});

test('self-attribution (same owner both ends of a credit edge) is dropped', () => {
  assert.equal(isSelfAttribution(edge('contributor:u1', 'outcome:o1', 'contributor_to_outcome', 1, 'u1', 'u1')), true);
  // legit credit by a different owner is kept
  assert.equal(isSelfAttribution(edge('contributor:u1', 'outcome:o1', 'contributor_to_outcome', 1, 'u1', 'u2')), false);
  // a non-credit edge with same owner is NOT self-attribution
  assert.equal(isSelfAttribution(edge('investigation:i1', 'publication:p1', 'investigation_to_publication', 1, 'u1', 'u1')), false);
  const r = cleanAttribution([edge('contributor:u1', 'outcome:o1', 'contributor_to_outcome', 1, 'u1', 'u1')]);
  assert.equal(r.clean.length, 0);
  assert.equal(r.dropped.selfAttributions, 1);
});

test('circular attribution is broken (A→B→A)', () => {
  const edges = [
    edge('investigation:a', 'publication:b', 'investigation_to_publication'),
    edge('publication:b', 'investigation:a', 'investigation_to_publication'), // closes a cycle
  ];
  const { kept, dropped } = removeCycles(edges);
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 1);
  const r = cleanAttribution(edges);
  assert.equal(r.dropped.cycles, 1);
});

test('cleanAttribution is idempotent', () => {
  const edges = [
    edge('signal:s1', 'investigation:i1', 'signal_to_investigation'),
    edge('signal:s1', 'investigation:i1', 'signal_to_investigation'),
    edge('contributor:u1', 'outcome:o1', 'contributor_to_outcome', 1, 'u1', 'u1'),
  ];
  const once = cleanAttribution(edges).clean;
  const twice = cleanAttribution(once).clean;
  assert.deepEqual(once, twice);
});

test('contributorAttributedWeight ignores self-attribution (no double-credit)', () => {
  const edges = [
    edge('contributor:u1', 'outcome:o1', 'contributor_to_outcome', 0.7, 'u1', 'u2'), // legit
    edge('contributor:u1', 'outcome:o2', 'contributor_to_outcome', 0.5, 'u1', 'u1'), // self → ignored
  ];
  assert.equal(contributorAttributedWeight(edges, 'u1'), 0.7);
});

test('dedupeEdges preserves first occurrence order', () => {
  const a = edge('signal:s1', 'investigation:i1', 'signal_to_investigation');
  const b = edge('signal:s2', 'investigation:i1', 'signal_to_investigation');
  const out = dedupeEdges([a, b, a]);
  assert.equal(out.length, 2);
  assert.equal(out[0].origin.id, 's1');
  assert.equal(out[1].origin.id, 's2');
});
