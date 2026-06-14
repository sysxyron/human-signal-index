import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INVESTIGATION_ORDER, INVESTIGATION_TRANSITIONS, canTransition, isTerminalStatus, nextStatuses,
  transitionInvestigation, investigationProgress, buildInvestigationTimeline,
  isPublicationReady, readinessChecklist,
} from '../src/investigation';
import type { InvestigationEvent, PublicationReadiness } from '../src/types';

const NOW = '2026-06-14T12:00:00.000Z';

test('canonical order has all 9 statuses', () => {
  assert.equal(INVESTIGATION_ORDER.length, 9);
  assert.equal(INVESTIGATION_ORDER[0], 'intake');
  assert.equal(INVESTIGATION_ORDER[INVESTIGATION_ORDER.length - 1], 'archived');
});

test('archived is terminal', () => {
  assert.equal(isTerminalStatus('archived'), true);
  assert.equal(INVESTIGATION_TRANSITIONS.archived.length, 0);
});

test('forward transitions allowed; illegal jumps rejected', () => {
  assert.ok(canTransition('intake', 'research'));
  assert.ok(canTransition('review', 'governance'));
  assert.ok(!canTransition('intake', 'published'));
  assert.ok(!canTransition('archived', 'research'));
});

test('escalation allowed from research/evidence/review/governance', () => {
  assert.ok(canTransition('research', 'escalated'));
  assert.ok(canTransition('evidence_collection', 'escalated'));
  assert.ok(canTransition('review', 'escalated'));
});

test('transition requires actor + reason (no silent changes)', () => {
  assert.equal(transitionInvestigation('intake', 'research', { actor: '', reason: 'x' }, { now: NOW }).ok, false);
  assert.equal(transitionInvestigation('intake', 'research', { actor: 'u', reason: '' }, { now: NOW }).ok, false);
});

test('valid transition returns auditable event', () => {
  const r = transitionInvestigation('intake', 'research', { actor: 'u1', reason: 'claimed' }, { now: NOW });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.status, 'research');
    assert.equal(r.event.action, 'status:intake->research');
    assert.equal(r.event.actor, 'u1');
    assert.equal(r.event.at, NOW);
  }
});

test('same-state transition rejected', () => {
  assert.equal(transitionInvestigation('review', 'review', { actor: 'u', reason: 'r' }, { now: NOW }).ok, false);
});

test('nextStatuses returns a copy', () => {
  const a = nextStatuses('intake');
  a.push('archived');
  assert.notDeepEqual(a, nextStatuses('intake'));
});

test('progress increases along the order', () => {
  assert.equal(investigationProgress('intake'), 0);
  assert.equal(investigationProgress('archived'), 1);
  assert.ok(investigationProgress('review') > investigationProgress('research'));
});

test('timeline sorts by time and does not mutate input', () => {
  const events: InvestigationEvent[] = [
    { action: 'b', actor: 'u', reason: 'r', at: '2026-06-10T00:00:00Z' },
    { action: 'a', actor: 'u', reason: 'r', at: '2026-06-08T00:00:00Z' },
  ];
  const sorted = buildInvestigationTimeline(events);
  assert.equal(sorted[0].action, 'a');
  assert.equal(events[0].action, 'b'); // original untouched
});

test('publication readiness requires all six checks', () => {
  const full: PublicationReadiness = {
    evidenceComplete: true, reviewerComplete: true, governanceComplete: true,
    riskAssessed: true, traceabilitySufficient: true, sourceQualitySufficient: true,
  };
  assert.equal(isPublicationReady(full), true);
  assert.equal(isPublicationReady({ ...full, governanceComplete: false }), false);
  assert.equal(readinessChecklist(full).length, 6);
});
