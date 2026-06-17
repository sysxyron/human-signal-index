// =============================================================================
// HSI Phase 41B.3B — role-application options: Admin is never applicable.
// Mirrors the /dashboard/apply-role page, which offers PURPOSE_OPTIONS whose
// requestedRole is not null. Admin must never appear as a requested role.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PURPOSE_OPTIONS } from './options';

test('no purpose option can request the admin role', () => {
  for (const o of PURPOSE_OPTIONS) {
    assert.notEqual(o.requestedRole, 'admin', `purpose "${o.path}" must not request admin`);
  }
});

test('applicable apply-role options are limited to contributor → curator', () => {
  // The apply-role page shows options with a non-null requestedRole.
  const applicable = PURPOSE_OPTIONS.filter((o) => o.requestedRole !== null);
  const roles = applicable.map((o) => o.requestedRole);
  assert.ok(roles.length > 0);
  assert.ok(!roles.includes('admin' as never), 'admin must not be selectable');
  for (const r of roles) {
    assert.ok(['contributor', 'researcher', 'reviewer', 'curator'].includes(r as string), `unexpected requestable role: ${r}`);
  }
});
