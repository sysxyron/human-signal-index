import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEmail, validateBetaApplication, validateDemoRequest,
  betaApplicationRow, demoRequestRow, isWithinDedupeWindow,
} from './intake';

// ---- normalizeEmail --------------------------------------------------------

test('normalizeEmail: trims + lowercases for a stable dedup key', () => {
  assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
});

// ---- beta application validation -------------------------------------------

test('validateBetaApplication: accepts a complete submission + coerces optionals', () => {
  const r = validateBetaApplication({ name: ' Ada ', email: 'ada@x.com', role: 'Researcher', reason: 'curious', organization: '  ', experience: 'lots' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.name, 'Ada');
  assert.equal(r.value.organization, null); // blank → null
  assert.equal(r.value.experience, 'lots');
  assert.equal(r.value.areaOfInterest, null);
});

test('validateBetaApplication: missing required fields → errors', () => {
  const r = validateBetaApplication({ name: '', email: 'not-an-email', role: '', reason: '' });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.length >= 4);
  assert.ok(r.errors.some((e) => /valid email/i.test(e)));
});

test('validateBetaApplication: non-string fields are rejected as missing', () => {
  const r = validateBetaApplication({ name: 123, email: 'a@b.com', role: 'x', reason: 'y' });
  assert.equal(r.ok, false);
});

test('validateBetaApplication: XSS-style name is rejected (security hotfix)', () => {
  const r = validateBetaApplication({
    name: '"><img src=x onerror=eval(atob(this.id))>',
    email: 'a@b.com', role: 'Researcher', reason: 'curious',
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => /valid name/i.test(e)));
});

test('validateBetaApplication: XSS-style organization is rejected', () => {
  const r = validateBetaApplication({
    name: 'Ada', email: 'a@b.com', role: 'Researcher', reason: 'curious',
    organization: '<script>alert(1)</script>',
  });
  assert.equal(r.ok, false);
});

// ---- demo request validation -----------------------------------------------

test('validateDemoRequest: accepts complete + coerces optionals', () => {
  const r = validateDemoRequest({ name: 'Bob', email: 'bob@co.com', organization: 'Co', useCase: 'monitoring', teamSize: '10', notes: '' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.organization, 'Co');
  assert.equal(r.value.teamSize, '10');
  assert.equal(r.value.notes, null);
});

test('validateDemoRequest: organization + useCase required', () => {
  const r = validateDemoRequest({ name: 'Bob', email: 'bob@co.com', organization: '', useCase: '' });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => /organization/i.test(e)));
  assert.ok(r.errors.some((e) => /use case/i.test(e)));
});

// ---- row builders ----------------------------------------------------------

test('betaApplicationRow: snake_case, status pending, source web, normalized email', () => {
  const input = { name: 'Ada', email: 'ada@x.com', role: 'Researcher', reason: 'curious', organization: 'Acme', areaOfInterest: null, experience: null, preferredRole: 'reviewer' };
  const row = betaApplicationRow(input, 'ada@x.com');
  assert.equal(row.status, 'pending');
  assert.equal(row.source, 'web');
  assert.equal(row.email, 'ada@x.com');
  assert.equal(row.area_of_interest, null);
  assert.equal(row.preferred_role, 'reviewer');
  // no camelCase keys leak into the DB row
  assert.equal('areaOfInterest' in row, false);
  assert.equal('preferredRole' in row, false);
});

test('demoRequestRow: snake_case, status new, source web', () => {
  const input = { name: 'Bob', email: 'bob@co.com', organization: 'Co', useCase: 'monitoring', role: null, teamSize: '10', timeline: null, notes: null };
  const row = demoRequestRow(input, 'bob@co.com');
  assert.equal(row.status, 'new');
  assert.equal(row.source, 'web');
  assert.equal(row.use_case, 'monitoring');
  assert.equal(row.team_size, '10');
  assert.equal('useCase' in row, false);
  assert.equal('teamSize' in row, false);
});

// ---- dedup window ----------------------------------------------------------

test('isWithinDedupeWindow: recent → true, outside window → false', () => {
  const now = 1_000_000_000_000;
  const hour = 60 * 60 * 1000;
  assert.equal(isWithinDedupeWindow(now - hour, now, 24 * hour), true);
  assert.equal(isWithinDedupeWindow(now - 25 * hour, now, 24 * hour), false);
});
