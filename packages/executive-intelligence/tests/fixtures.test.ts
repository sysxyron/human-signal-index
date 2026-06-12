import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_INPUTS, FIXTURE_NOW, executiveDemo } from '../src/fixtures';

test('FIXTURE_NOW is a fixed ISO instant', () => {
  assert.equal(FIXTURE_NOW, '2026-06-09T12:00:00.000Z');
});

test('DEMO_INPUTS span every subsystem', () => {
  assert.ok((DEMO_INPUTS.investigations ?? []).length > 0);
  assert.ok((DEMO_INPUTS.consensus ?? []).length > 0);
  assert.ok((DEMO_INPUTS.forecasts ?? []).length > 0);
  assert.ok((DEMO_INPUTS.warnings ?? []).length > 0);
  assert.ok((DEMO_INPUTS.trust ?? []).length > 0);
  assert.ok((DEMO_INPUTS.opportunities ?? []).length > 0);
  assert.ok((DEMO_INPUTS.scenarios ?? []).length > 0);
  assert.ok((DEMO_INPUTS.governanceQueue ?? []).length > 0);
});

test('executiveDemo runs the full chain', () => {
  const out = executiveDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.ok(out.priorities.length > 0);
  assert.ok(out.risks.length > 0);
  assert.ok(out.opportunities.length > 0);
  assert.ok(out.snapshot.strategicPriorities.length > 0);
  assert.equal(out.report.brief.kind, 'daily');
  assert.equal(out.briefs.weekly.kind, 'weekly');
  assert.equal(out.briefs.critical.kind, 'critical');
  assert.equal(out.briefs.governance.kind, 'governance');
  assert.equal(out.briefs.forecast.kind, 'forecast');
  assert.equal(out.briefs.operations.kind, 'operations');
});

test('executiveDemo produces a human decision', () => {
  const out = executiveDemo();
  assert.equal(out.review.status, 'queued');
  assert.equal(out.decision.decision, 'approved');
  assert.equal(out.decision.reviewer, 'exec-alice');
  assert.equal(out.decision.reversible, true);
});

test('executiveDemo is deterministic', () => {
  assert.deepEqual(executiveDemo(), executiveDemo());
});

test('top priority is the most urgent', () => {
  const out = executiveDemo();
  assert.equal(out.priorities[0].rank, 1);
  assert.ok(out.priorities[0].score >= out.priorities[out.priorities.length - 1].score);
});
