import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_TEMPLATES,
  getWorkflowTemplate,
  workflowTemplateIds,
} from '../src/templates';

const EXPECTED = [
  'historical-investigation',
  'narrative-validation',
  'evidence-verification',
  'signal-analysis',
  'trust-recovery',
  'calibration-review',
  'counterfactual-analysis',
];

test('seven templates present', () => {
  assert.equal(WORKFLOW_TEMPLATES.length, 7);
  assert.deepEqual(workflowTemplateIds().sort(), [...EXPECTED].sort());
});

test('each template has stages, agents, evidence, governance flag', () => {
  for (const t of WORKFLOW_TEMPLATES) {
    assert.ok(t.stages.length > 0);
    assert.ok(t.requiredAgents.length > 0);
    assert.ok(t.requiredEvidence >= 0);
    assert.equal(typeof t.governanceRequired, 'boolean');
  }
});

test('every template ends at COMPLETE', () => {
  for (const t of WORKFLOW_TEMPLATES) {
    assert.equal(t.stages[t.stages.length - 1], 'COMPLETE');
  }
});

test('getWorkflowTemplate finds by id', () => {
  const t = getWorkflowTemplate('trust-recovery');
  assert.ok(t);
  assert.equal(t?.name, 'Trust Recovery');
});

test('getWorkflowTemplate returns undefined for unknown', () => {
  assert.equal(getWorkflowTemplate('nope'), undefined);
});

test('historical-investigation requires governance', () => {
  assert.equal(getWorkflowTemplate('historical-investigation')?.governanceRequired, true);
});

test('signal-analysis does not require governance', () => {
  assert.equal(getWorkflowTemplate('signal-analysis')?.governanceRequired, false);
});

test('trust-recovery includes the trust agent', () => {
  assert.ok(getWorkflowTemplate('trust-recovery')?.requiredAgents.includes('trust'));
});

test('counterfactual-analysis includes counterfactual stage', () => {
  assert.ok(getWorkflowTemplate('counterfactual-analysis')?.stages.includes('COUNTERFACTUAL'));
});
