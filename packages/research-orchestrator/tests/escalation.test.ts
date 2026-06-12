import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escalateResearchIssue, orderEscalations } from '../src/escalation';
import { FIXTURE_NOW } from '../src/fixtures';
import type { EscalationTrigger } from '../src/types';

const NOW = FIXTURE_NOW;

const TRIGGERS: EscalationTrigger[] = [
  'repeated_failures',
  'trust_collapse',
  'calibration_drift',
  'missing_evidence',
  'governance_backlog',
  'queue_blockage',
];

test('every trigger produces an open escalation with defaults', () => {
  for (const trigger of TRIGGERS) {
    const e = escalateResearchIssue({ id: `e-${trigger}`, trigger }, { now: NOW });
    assert.equal(e.status, 'open');
    assert.ok(e.reason.length > 0);
    assert.ok(e.recommendation.length > 0);
    assert.ok(['INFO', 'WARNING', 'HIGH', 'CRITICAL'].includes(e.severity));
  }
});

test('trust_collapse is CRITICAL by default', () => {
  const e = escalateResearchIssue({ id: 'e', trigger: 'trust_collapse' }, { now: NOW });
  assert.equal(e.severity, 'CRITICAL');
});

test('missing_evidence is WARNING by default', () => {
  const e = escalateResearchIssue({ id: 'e', trigger: 'missing_evidence' }, { now: NOW });
  assert.equal(e.severity, 'WARNING');
});

test('severity can be overridden', () => {
  const e = escalateResearchIssue({ id: 'e', trigger: 'missing_evidence', severity: 'CRITICAL' }, { now: NOW });
  assert.equal(e.severity, 'CRITICAL');
});

test('runId carried when provided', () => {
  const e = escalateResearchIssue({ id: 'e', trigger: 'queue_blockage', runId: 'run-9' }, { now: NOW });
  assert.equal(e.runId, 'run-9');
});

test('custom reason + evidence + recommendation honored', () => {
  const e = escalateResearchIssue(
    { id: 'e', trigger: 'repeated_failures', reason: 'custom', evidence: ['x', 'y'], recommendation: 'do z' },
    { now: NOW },
  );
  assert.equal(e.reason, 'custom');
  assert.deepEqual(e.evidence, ['x', 'y']);
  assert.equal(e.recommendation, 'do z');
});

test('createdAt uses injected now', () => {
  const e = escalateResearchIssue({ id: 'e', trigger: 'queue_blockage' }, { now: '2030-01-01T00:00:00.000Z' });
  assert.equal(e.createdAt, '2030-01-01T00:00:00.000Z');
});

test('orderEscalations ranks CRITICAL first', () => {
  const items = [
    escalateResearchIssue({ id: 'a', trigger: 'missing_evidence' }, { now: NOW }), // WARNING
    escalateResearchIssue({ id: 'b', trigger: 'trust_collapse' }, { now: NOW }), // CRITICAL
    escalateResearchIssue({ id: 'c', trigger: 'repeated_failures' }, { now: NOW }), // HIGH
  ];
  const ordered = orderEscalations(items);
  assert.deepEqual(ordered.map((e) => e.severity), ['CRITICAL', 'HIGH', 'WARNING']);
});

test('deterministic escalation', () => {
  assert.deepEqual(
    escalateResearchIssue({ id: 'e', trigger: 'trust_collapse' }, { now: NOW }),
    escalateResearchIssue({ id: 'e', trigger: 'trust_collapse' }, { now: NOW }),
  );
});

test('empty evidence defaults to empty array', () => {
  const e = escalateResearchIssue({ id: 'e', trigger: 'queue_blockage' }, { now: NOW });
  assert.deepEqual(e.evidence, []);
});
