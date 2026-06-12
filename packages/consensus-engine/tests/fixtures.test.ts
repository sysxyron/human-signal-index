import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_FINDINGS, FIXTURE_NOW, consensusDemo } from '../src/fixtures';

test('DEMO_FINDINGS span multiple positions', () => {
  const positions = new Set(DEMO_FINDINGS.map((f) => f.position));
  assert.ok(positions.size >= 3);
});

test('consensusDemo runs the chain', () => {
  const out = consensusDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.equal(out.result.consensusPosition, 'Earlier settlement');
  assert.equal(out.snapshot.consensusPosition, 'Earlier settlement');
  assert.ok(out.snapshot.dissentPositions.length >= 2);
});

test('consensusDemo is deterministic', () => {
  assert.deepEqual(consensusDemo(), consensusDemo());
});
