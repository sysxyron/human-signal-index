import { test } from 'node:test';
import assert from 'node:assert/strict';

// RBAC source of truth — proves that hiding a menu is NOT the only protection:
// direct URLs to restricted areas are still gated by the middleware role map.
import { requiredRoleForRoute, hasRole } from '../security/rbac-audit';

test('admin areas remain RBAC-gated to admin (direct URL access)', () => {
  for (const path of ['/dashboard/admin/users', '/dashboard/admin/teams', '/dashboard/security', '/dashboard/settings', '/dashboard/launch']) {
    assert.equal(requiredRoleForRoute(path), 'admin', path);
    assert.equal(hasRole('viewer', 'admin'), false);
    assert.equal(hasRole('curator', 'admin'), false);
  }
});

test('reviewer areas remain RBAC-gated (viewer/researcher denied by URL)', () => {
  for (const path of ['/dashboard/review', '/dashboard/source-registry', '/dashboard/operations']) {
    const required = requiredRoleForRoute(path);
    assert.equal(required, 'reviewer', path);
    assert.equal(hasRole('viewer', required as 'reviewer'), false);
    assert.equal(hasRole('researcher', required as 'reviewer'), false);
    assert.equal(hasRole('reviewer', required as 'reviewer'), true);
  }
});

test('researcher operational areas remain RBAC-gated (viewer denied by URL)', () => {
  for (const path of ['/dashboard/operations-center', '/dashboard/my-work', '/dashboard/decisions/explorer', '/dashboard/simulation']) {
    const required = requiredRoleForRoute(path);
    assert.equal(required, 'researcher', path);
    assert.equal(hasRole('viewer', required as 'researcher'), false);
  }
});

test('admin satisfies every gated route (no over-restriction)', () => {
  for (const path of ['/dashboard/admin/users', '/dashboard/review', '/dashboard/operations-center', '/dashboard/settings']) {
    assert.equal(hasRole('admin', requiredRoleForRoute(path) as never), true, path);
  }
});

test('the profile page is NOT URL-gated (any signed-in user)', () => {
  assert.equal(requiredRoleForRoute('/dashboard/profile'), null);
});
