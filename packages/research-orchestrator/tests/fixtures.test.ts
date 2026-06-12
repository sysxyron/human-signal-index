import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIXTURE_NOW, orchestratorDemo, runFullPipeline } from '../src/fixtures';

test('runFullPipeline reaches COMPLETE', () => {
  const { run, tasks } = runFullPipeline();
  assert.equal(run.state, 'COMPLETE');
  assert.ok(tasks.length > 0);
});

test('runFullPipeline assigns agents for working stages', () => {
  const { tasks } = runFullPipeline();
  const agents = new Set(tasks.map((t) => t.agentType));
  assert.ok(agents.has('evidence'));
  assert.ok(agents.has('temporal'));
  assert.ok(agents.has('trust'));
});

test('orchestratorDemo runs the full chain', () => {
  const out = orchestratorDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.equal(out.run.state, 'COMPLETE');
  assert.ok(out.opportunities.length > 0);
  assert.equal(out.escalation.trigger, 'trust_collapse');
  assert.equal(out.health.length, 10);
  assert.equal(out.templates.length, 7);
});

test('orchestratorDemo agent health has eight agents', () => {
  const out = orchestratorDemo();
  assert.equal(out.agentHealth.length, 8);
});

test('orchestratorDemo opportunities are all proposed', () => {
  const out = orchestratorDemo();
  assert.ok(out.opportunities.every((o) => o.status === 'proposed'));
});

test('orchestratorDemo is deterministic', () => {
  assert.deepEqual(orchestratorDemo(), orchestratorDemo());
});
