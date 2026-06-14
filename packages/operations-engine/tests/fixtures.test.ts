import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_CASES, FIXTURE_NOW, operationsDemo } from '../src/fixtures';

test('FIXTURE_NOW is a fixed instant', () => {
  assert.equal(FIXTURE_NOW, '2026-06-13T12:00:00.000Z');
});

test('DEMO_CASES span lifecycle states + teams', () => {
  const states = new Set(DEMO_CASES.map((c) => c.state));
  assert.ok(states.has('RESEARCH'));
  assert.ok(states.has('PUBLICATION_REVIEW'));
  assert.ok(states.has('PUBLISHED'));
});

test('operationsDemo runs the full chain', () => {
  const d = operationsDemo();
  assert.equal(d.now, FIXTURE_NOW);
  assert.ok(d.assignments.length > 0);
  assert.equal(d.chain.owner, 'erin'); // reassigned
  assert.ok(d.transitions.length > 0);
  assert.ok(d.timeline.length > 0);
  assert.equal(d.escalation.escalation.level, 'HIGH');
  assert.ok(d.workload.length > 0);
  assert.ok(d.teamWorkload.length > 0);
  assert.ok(d.capacity.weeklyCapacity >= 0);
  assert.ok(d.alerts.length > 0);
});

test('operationsDemo alerts are all advisory', () => {
  const d = operationsDemo();
  assert.ok(d.alerts.every((a) => a.advisory === true));
});

test('operationsDemo is deterministic', () => {
  assert.deepEqual(operationsDemo(), operationsDemo());
});

test('demo capacity for an under-resourced team grows', () => {
  const d = operationsDemo();
  // research: 3 members * 2/wk = 6 capacity < 8 inflow → growing
  assert.equal(d.capacity.trend, 'growing');
  assert.ok(d.capacity.staffingGap >= 1);
});
