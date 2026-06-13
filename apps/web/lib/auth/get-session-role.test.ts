import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSessionRoleFrom,
  highestRole,
  loadHighestRole,
  loadUserRoles,
} from './get-session-role';
import { hasRole, requiredRoleForRoute, type AppRole } from '../security/rbac-audit';

// ---------------------------------------------------------------------------
// A fake Supabase client that resolves roles the way the real one does:
//   client.auth.getUser()                            -> { data: { user } }
//   client.from('user_roles').select('roles(name)')
//         .eq('user_id', id)                         -> { data, error }
// `roleRows` mirrors PostgREST's embedded shape: [{ roles: { name } }].
// ---------------------------------------------------------------------------
function fakeClient(opts: {
  user?: { id: string; email?: string } | null;
  roleRows?: unknown;
  error?: unknown;
}): any {
  const { user = null, roleRows = [], error = null } = opts;
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from() {
      return {
        select() {
          return {
            eq: async () => ({ data: error ? null : roleRows, error }),
          };
        },
      };
    },
  };
}

const rows = (...names: string[]) => names.map((n) => ({ roles: { name: n } }));

// ---- highestRole (pure ladder) -------------------------------------------

test('highestRole: admin is highest', () => {
  assert.equal(highestRole(['viewer', 'admin', 'reviewer']), 'admin');
});

test('highestRole: each single role resolves to itself', () => {
  for (const r of ['viewer', 'researcher', 'reviewer', 'curator', 'admin'] as AppRole[]) {
    assert.equal(highestRole([r]), r);
  }
});

test('highestRole: multiple roles → the highest on the ladder', () => {
  assert.equal(highestRole(['researcher', 'curator']), 'curator');
  assert.equal(highestRole(['viewer', 'reviewer']), 'reviewer');
});

test('highestRole: unknown roles are ignored', () => {
  assert.equal(highestRole(['superuser', 'wizard']), null);
  assert.equal(highestRole(['wizard', 'admin']), 'admin');
});

test('highestRole: empty / missing → null', () => {
  assert.equal(highestRole([]), null);
});

// ---- loadUserRoles (DB chain parsing) ------------------------------------

test('loadUserRoles: parses embedded roles(name) objects', async () => {
  const c = fakeClient({ user: { id: 'u1' }, roleRows: rows('admin') });
  assert.deepEqual(await loadUserRoles(c, 'u1'), ['admin']);
});

test('loadUserRoles: lower-cases + de-dupes', async () => {
  const c = fakeClient({ user: { id: 'u1' }, roleRows: rows('Admin', 'ADMIN', 'reviewer') });
  assert.deepEqual(await loadUserRoles(c, 'u1').then((r) => r.sort()), ['admin', 'reviewer']);
});

test('loadUserRoles: handles the array-embed shape too', async () => {
  const c = fakeClient({ user: { id: 'u1' }, roleRows: [{ roles: [{ name: 'curator' }] }] });
  assert.deepEqual(await loadUserRoles(c, 'u1'), ['curator']);
});

test('loadUserRoles: DB error → [] (never throws)', async () => {
  const c = fakeClient({ user: { id: 'u1' }, error: { message: 'boom' } });
  assert.deepEqual(await loadUserRoles(c, 'u1'), []);
});

test('loadUserRoles: no assignments → []', async () => {
  const c = fakeClient({ user: { id: 'u1' }, roleRows: [] });
  assert.deepEqual(await loadUserRoles(c, 'u1'), []);
});

test('loadHighestRole: admin row resolves to admin', async () => {
  const c = fakeClient({ user: { id: 'u1' }, roleRows: rows('admin') });
  assert.equal(await loadHighestRole(c, 'u1'), 'admin');
});

// ---- getSessionRoleFrom (identity + roles) -------------------------------

test('getSessionRoleFrom: admin user → full SessionRole', async () => {
  const c = fakeClient({ user: { id: 'u1', email: 'research@amenxlabs.com' }, roleRows: rows('admin') });
  const s = await getSessionRoleFrom(c);
  assert.deepEqual(s, {
    userId: 'u1',
    email: 'research@amenxlabs.com',
    roles: ['admin'],
    highestRole: 'admin',
  });
});

test('getSessionRoleFrom: anonymous → empty session', async () => {
  const c = fakeClient({ user: null });
  const s = await getSessionRoleFrom(c);
  assert.equal(s.userId, null);
  assert.equal(s.highestRole, null);
  assert.deepEqual(s.roles, []);
});

test('getSessionRoleFrom: user with no roles → highestRole null', async () => {
  const c = fakeClient({ user: { id: 'u2', email: 'new@x.com' }, roleRows: [] });
  const s = await getSessionRoleFrom(c);
  assert.equal(s.highestRole, null);
});

// ---- route gating: admin reaches the previously-denied routes -------------

const DENIED_BEFORE = [
  '/dashboard/source-registry',
  '/dashboard/operations',
  '/dashboard/decisions/explorer',
  '/dashboard/review',
  '/dashboard/simulation',
  '/dashboard/security-monitor',
  '/dashboard/security',
  '/dashboard/settings',
];

test('admin satisfies every previously-denied route', () => {
  for (const path of DENIED_BEFORE) {
    const required = requiredRoleForRoute(path);
    assert.notEqual(required, null, `${path} should be role-gated`);
    assert.equal(hasRole('admin', required as AppRole), true, `admin should access ${path}`);
  }
});

test('viewer is denied on every gated route (RBAC still enforced)', () => {
  for (const path of DENIED_BEFORE) {
    const required = requiredRoleForRoute(path) as AppRole;
    assert.equal(hasRole('viewer', required), false, `viewer must NOT access ${path}`);
  }
});

test('role hierarchy: each gated route admits exactly the right minimum', () => {
  // settings/security → admin only; review/sources/operations → reviewer+;
  // simulation/decisions → researcher+.
  assert.equal(hasRole('curator', requiredRoleForRoute('/dashboard/settings') as AppRole), false);
  assert.equal(hasRole('admin', requiredRoleForRoute('/dashboard/settings') as AppRole), true);
  assert.equal(hasRole('reviewer', requiredRoleForRoute('/dashboard/review') as AppRole), true);
  assert.equal(hasRole('researcher', requiredRoleForRoute('/dashboard/review') as AppRole), false);
  assert.equal(hasRole('researcher', requiredRoleForRoute('/dashboard/simulation') as AppRole), true);
  assert.equal(hasRole('viewer', requiredRoleForRoute('/dashboard/simulation') as AppRole), false);
});

test('ungated routes need only a signed-in user (no role requirement)', () => {
  for (const path of [
    '/dashboard',
    '/dashboard/executive',
    '/dashboard/forecasts',
    '/dashboard/trust',
    '/dashboard/publishing',
    '/dashboard/worldforge',
  ]) {
    assert.equal(requiredRoleForRoute(path), null, `${path} should not be role-gated`);
  }
});

// ---- stale-JWT scenario ---------------------------------------------------

test('role is read from the DB, not the JWT — promotion is reflected without a new token', async () => {
  // Same identity (same user id from the JWT) but the DB now returns admin. The
  // resolver reflects the DB immediately, so a stale JWT (issued while the user
  // was a viewer) cannot keep an admin locked out.
  const beforePromotion = fakeClient({ user: { id: 'u9', email: 'r@x.com' }, roleRows: rows('viewer') });
  const afterPromotion = fakeClient({ user: { id: 'u9', email: 'r@x.com' }, roleRows: rows('admin') });
  assert.equal((await getSessionRoleFrom(beforePromotion)).highestRole, 'viewer');
  assert.equal((await getSessionRoleFrom(afterPromotion)).highestRole, 'admin');
});
