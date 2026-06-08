import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSlaDeadlines,
  slaStatus,
  DEFAULT_SLA_POLICIES,
  type SlaPolicy,
} from '../src/sla';

const HIGH: SlaPolicy =
  DEFAULT_SLA_POLICIES.find((p) => p.severity === 'HIGH') ??
  ({ name: 'High', severity: 'HIGH', reviewDeadlineHours: 8, escalationDeadlineHours: 24 } as SlaPolicy);

const CREATED = '2026-01-01T00:00:00.000Z';

test('computeSlaDeadlines: adds review and escalation hours', () => {
  const d = computeSlaDeadlines(HIGH, CREATED);
  // HIGH: review +8h, escalation +24h.
  assert.equal(d.reviewDeadline, '2026-01-01T08:00:00.000Z');
  assert.equal(d.escalationDeadline, '2026-01-02T00:00:00.000Z');
});

test('slaStatus: on_track well before review deadline', () => {
  const s = slaStatus(HIGH, CREATED, '2026-01-01T01:00:00.000Z');
  assert.equal(s.state, 'on_track');
  assert.ok(s.hoursRemaining > 0);
});

test('slaStatus: due_soon within the due-soon window', () => {
  // Review deadline is +8h; at +5h there are 3h left (< DUE_SOON_HOURS=4).
  const s = slaStatus(HIGH, CREATED, '2026-01-01T05:00:00.000Z');
  assert.equal(s.state, 'due_soon');
});

test('slaStatus: overdue_review after review deadline, before escalation', () => {
  const s = slaStatus(HIGH, CREATED, '2026-01-01T12:00:00.000Z');
  assert.equal(s.state, 'overdue_review');
  assert.ok(s.hoursRemaining > 0, 'escalation still in the future');
});

test('slaStatus: overdue_escalation past escalation deadline', () => {
  const s = slaStatus(HIGH, CREATED, '2026-01-03T00:00:00.000Z');
  assert.equal(s.state, 'overdue_escalation');
  assert.ok(s.hoursRemaining < 0, 'escalation deadline passed');
});

test('slaStatus: a completed review before the deadline → on_track', () => {
  const s = slaStatus(
    HIGH,
    CREATED,
    '2026-01-01T20:00:00.000Z', // now is past review deadline...
    '2026-01-01T06:00:00.000Z', // ...but it was reviewed before it
  );
  assert.equal(s.state, 'on_track');
});
