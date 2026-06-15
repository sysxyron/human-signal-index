import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildChains, originsOfType } from '../src/chain';
import { isOutcomeType, OUTCOME_TYPES, outcomeWeight } from '../src/outcomes';
import { demoEdges } from '../src/fixtures';
import type { AttributionEdge } from '../src/types';

test('outcome taxonomy has 9 types with weights', () => {
  assert.equal(OUTCOME_TYPES.length, 9);
  assert.ok(isOutcomeType('VERIFIED_FINDING'));
  assert.ok(!isOutcomeType('NOPE'));
  assert.equal(outcomeWeight('VERIFIED_FINDING'), 1.0);
  assert.ok(outcomeWeight('OTHER') < outcomeWeight('GOVERNANCE_ACTION'));
});

test('buildChains resolves an outcome to its many origins', () => {
  const chains = buildChains(demoEdges);
  assert.equal(chains.length, 1);
  const c = chains[0];
  assert.equal(c.outcome.id, 'o1');
  // many-to-many: two signals feed the single investigation feed the publication.
  const signals = originsOfType(c, 'signal').map((s) => s.id).sort();
  assert.deepEqual(signals, ['s1', 's2']);
  assert.ok(c.strength > 0 && c.strength <= 1);
  assert.ok(c.links.length >= 3);
});

test('many-to-many: a publication from multiple investigations', () => {
  const edges: AttributionEdge[] = [
    { origin: { type: 'investigation', id: 'i1' }, destination: { type: 'publication', id: 'p1' }, relationship: 'investigation_to_publication', weight: 0.5 },
    { origin: { type: 'investigation', id: 'i2' }, destination: { type: 'publication', id: 'p1' }, relationship: 'investigation_to_publication', weight: 0.5 },
    { origin: { type: 'publication', id: 'p1' }, destination: { type: 'outcome', id: 'o9' }, relationship: 'publication_to_outcome', weight: 1 },
  ];
  const [chain] = buildChains(edges);
  const invs = originsOfType(chain, 'investigation').map((i) => i.id).sort();
  assert.deepEqual(invs, ['i1', 'i2']);
});

test('chains never include outcomes with no edges; empty input → empty', () => {
  assert.deepEqual(buildChains([]), []);
});

test('strength is the strongest path weight product (0..1)', () => {
  const edges: AttributionEdge[] = [
    { origin: { type: 'signal', id: 's1' }, destination: { type: 'investigation', id: 'i1' }, relationship: 'signal_to_investigation', weight: 0.5 },
    { origin: { type: 'investigation', id: 'i1' }, destination: { type: 'outcome', id: 'o1' }, relationship: 'investigation_to_outcome', weight: 0.5 },
  ];
  const [c] = buildChains(edges);
  assert.equal(c.strength, 0.25); // 0.5 * 0.5
});
