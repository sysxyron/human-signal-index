// Run: node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test apps/web/lib/security/rbac-audit.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_RANK,
  hasRole,
  hasAnyRole,
  requireRole,
  requireAnyRole,
  requiredRoleForRoute,
  auditRouteAccess,
  auditProtectedRoutes,
} from './rbac-audit';

test('ROLE_RANK ascending ladder viewer<researcher<reviewer<curator<admin', () => {
  assert.ok(
    ROLE_RANK.viewer < ROLE_RANK.researcher &&
      ROLE_RANK.researcher < ROLE_RANK.reviewer &&
      ROLE_RANK.reviewer < ROLE_RANK.curator &&
      ROLE_RANK.curator < ROLE_RANK.admin,
  );
});

test('hasRole: rank-based comparison', () => {
  assert.equal(hasRole('admin', 'reviewer'), true);
  assert.equal(hasRole('reviewer', 'reviewer'), true);
  assert.equal(hasRole('viewer', 'reviewer'), false);
  assert.equal(hasRole(undefined, 'viewer'), false);
  assert.equal(hasRole('bogus', 'viewer'), false);
});

test('hasAnyRole: satisfies the lowest required rank', () => {
  assert.equal(hasAnyRole('researcher', ['reviewer', 'researcher']), true);
  assert.equal(hasAnyRole('viewer', ['reviewer', 'curator']), false);
  assert.equal(hasAnyRole('admin', ['reviewer']), true);
  assert.equal(hasAnyRole('viewer', []), false);
});

test('requireRole predicate: allow / deny with reason', () => {
  const guard = requireRole('curator');
  assert.deepEqual(guard('admin'), { allowed: true });
  const denied = guard('reviewer');
  assert.equal(denied.allowed, false);
  assert.match(denied.reason ?? '', /curator/);
});

test('requireAnyRole predicate: allow / deny', () => {
  const guard = requireAnyRole(['reviewer', 'admin']);
  assert.equal(guard('reviewer').allowed, true);
  assert.equal(guard('viewer').allowed, false);
});

test('requiredRoleForRoute: admin routes', () => {
  assert.equal(requiredRoleForRoute('/dashboard/security-monitor'), 'admin');
  assert.equal(requiredRoleForRoute('/dashboard/settings'), 'admin');
});

test('requiredRoleForRoute: reviewer routes', () => {
  assert.equal(requiredRoleForRoute('/dashboard/review'), 'reviewer');
  assert.equal(requiredRoleForRoute('/dashboard/review-queue'), 'reviewer');
  assert.equal(requiredRoleForRoute('/dashboard/sources'), 'reviewer');
  assert.equal(requiredRoleForRoute('/dashboard/operations'), 'reviewer');
});

test('requiredRoleForRoute: curator routes incl. publish override', () => {
  assert.equal(requiredRoleForRoute('/dashboard/publications'), 'curator');
  // Longest-prefix wins: /dashboard/curation/publish (curator) overrides
  // /dashboard/curation (reviewer).
  assert.equal(requiredRoleForRoute('/dashboard/curation'), 'reviewer');
  assert.equal(requiredRoleForRoute('/dashboard/curation/publish'), 'curator');
  assert.equal(requiredRoleForRoute('/dashboard/operations/dead-letter'), 'curator');
});

test('requiredRoleForRoute: researcher routes', () => {
  assert.equal(requiredRoleForRoute('/dashboard/intelligence/decisions'), 'researcher');
  assert.equal(requiredRoleForRoute('/dashboard/decisions'), 'researcher');
  assert.equal(requiredRoleForRoute('/dashboard/simulation'), 'researcher');
});

test('requiredRoleForRoute: unprotected / public route → null', () => {
  assert.equal(requiredRoleForRoute('/dashboard/worldforge'), null);
  assert.equal(requiredRoleForRoute('/dashboard'), null);
});

test('requiredRoleForRoute: Phase 56.1 hardened read-only intelligence routes', () => {
  assert.equal(requiredRoleForRoute('/dashboard/forecasting'), 'researcher');
  assert.equal(requiredRoleForRoute('/dashboard/watchlists'), 'researcher');
  assert.equal(requiredRoleForRoute('/dashboard/signal-intake'), 'researcher');
  // A viewer/contributor is denied; researcher+ allowed.
  assert.equal(auditRouteAccess('/dashboard/forecasting', 'viewer').allowed, false);
  assert.equal(auditRouteAccess('/dashboard/watchlists', 'researcher').allowed, true);
});

test('auditRouteAccess: denies low role on admin route', () => {
  const out = auditRouteAccess('/dashboard/security-monitor', 'reviewer');
  assert.equal(out.allowed, false);
  assert.equal(out.minRole, 'admin');
  assert.match(out.reason ?? '', /admin/);
});

test('auditRouteAccess: allows sufficient role', () => {
  const out = auditRouteAccess('/dashboard/review', 'curator');
  assert.equal(out.allowed, true);
  assert.equal(out.minRole, 'reviewer');
});

test('auditRouteAccess: unprotected route allowed for any role', () => {
  assert.equal(auditRouteAccess('/dashboard/worldforge', 'viewer').allowed, true);
});

test('auditProtectedRoutes: returns route + minRole pairs', () => {
  const all = auditProtectedRoutes();
  assert.ok(all.length > 0);
  assert.ok(all.every((r) => typeof r.route === 'string' && typeof r.minRole === 'string'));
  assert.ok(all.some((r) => r.route === '/dashboard/security-monitor' && r.minRole === 'admin'));
});

test('requiredRoleForRoute: nested sub-path inherits prefix rule', () => {
  assert.equal(requiredRoleForRoute('/dashboard/publications/123'), 'curator');
  assert.equal(requiredRoleForRoute('/dashboard/review/abc'), 'reviewer');
});
