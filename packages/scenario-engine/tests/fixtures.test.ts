import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIXTURE_NOW, scenarioDemo } from '../src/fixtures';

test('scenarioDemo runs the full chain', () => {
  const out = scenarioDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.equal(out.scenarios.length, 3);
  assert.equal(out.comparison.leading, 'sc-resurge');
  assert.ok(out.tree.children.length === 3);
  assert.ok(out.warnings.length >= 5);
});

test('demo leader scenario advanced to ACTIVE', () => {
  const out = scenarioDemo();
  assert.equal(out.scenarios[0].state, 'ACTIVE');
});

test('demo warnings span multiple kinds', () => {
  const out = scenarioDemo();
  const kinds = new Set(out.warnings.map((w) => w.kind));
  assert.ok(kinds.size >= 4);
});

test('demo warnings ordered by level', () => {
  const out = scenarioDemo();
  const rank = { CRITICAL: 0, WARNING: 1, WATCH: 2, INFO: 3 } as const;
  for (let i = 1; i < out.warnings.length; i++) {
    assert.ok(rank[out.warnings[i - 1].level] <= rank[out.warnings[i].level]);
  }
});

test('scenarioDemo is deterministic', () => {
  assert.deepEqual(scenarioDemo(), scenarioDemo());
});
