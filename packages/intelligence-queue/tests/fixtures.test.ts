import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIXTURE_NOW, queueDemo, seedQueue } from '../src/fixtures';

test('seedQueue has four prioritized items', () => {
  const q = seedQueue();
  assert.equal(q.length, 4);
  assert.deepEqual(q.map((i) => i.priority).sort(), ['CRITICAL', 'HIGH', 'LOW', 'NORMAL']);
});

test('queueDemo dequeues the CRITICAL item first', () => {
  const out = queueDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.equal(out.firstDequeued?.priority, 'CRITICAL');
  assert.equal(out.firstDequeued?.status, 'active');
});

test('queueDemo stats reflect one active', () => {
  const out = queueDemo();
  assert.equal(out.stats.byStatus.active, 1);
  assert.equal(out.stats.total, 4);
});

test('queueDemo is deterministic', () => {
  assert.deepEqual(queueDemo(), queueDemo());
});
