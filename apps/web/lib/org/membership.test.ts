import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBERSHIP_ROLES, MEMBERSHIP_RANK, isMembershipRole, canManageMembers,
  highestMembership, canRemoveMember, scopeToOrg, isVisibleInOrg,
} from './membership';

test('6 membership roles; owner ranks highest', () => {
  assert.equal(MEMBERSHIP_ROLES.length, 6);
  assert.ok(MEMBERSHIP_RANK.owner > MEMBERSHIP_RANK.administrator);
  assert.ok(MEMBERSHIP_RANK.administrator > MEMBERSHIP_RANK.contributor);
  assert.ok(isMembershipRole('reviewer'));
  assert.ok(!isMembershipRole('admin')); // global RBAC role is NOT a membership role
});

test('only owner/administrator manage members (org-scoped, not RBAC)', () => {
  assert.ok(canManageMembers('owner'));
  assert.ok(canManageMembers('administrator'));
  assert.ok(!canManageMembers('reviewer'));
  assert.ok(!canManageMembers('contributor'));
  assert.ok(!canManageMembers(null));
});

test('highestMembership picks the strongest role', () => {
  assert.equal(highestMembership(['contributor', 'administrator', 'tester']), 'administrator');
  assert.equal(highestMembership(['contributor']), 'contributor');
  assert.equal(highestMembership(['bogus']), null);
});

test('cannot remove the last owner', () => {
  assert.equal(canRemoveMember('owner', 1), false);
  assert.equal(canRemoveMember('owner', 2), true);
  assert.equal(canRemoveMember('contributor', 1), true);
});

// ---- tenant isolation (mirrors DB RESTRICTIVE RLS) -------------------------
test('scopeToOrg: same-org + global visible; other orgs hidden', () => {
  const rows = [
    { id: 'a', organization_id: 'org1' },
    { id: 'b', organization_id: 'org2' },
    { id: 'c', organization_id: null }, // global/platform
  ];
  const seen = scopeToOrg(rows, 'org1').map((r) => r.id).sort();
  assert.deepEqual(seen, ['a', 'c']);
  // no cross-org leakage
  assert.ok(!scopeToOrg(rows, 'org1').some((r) => r.id === 'b'));
});

test('platform admin sees everything (global oversight)', () => {
  const rows = [{ id: 'a', organization_id: 'org1' }, { id: 'b', organization_id: 'org2' }];
  assert.equal(scopeToOrg(rows, 'org1', { platformAdmin: true }).length, 2);
});

test('isVisibleInOrg matches scopeToOrg semantics', () => {
  assert.equal(isVisibleInOrg({ organization_id: 'org1' }, 'org1'), true);
  assert.equal(isVisibleInOrg({ organization_id: 'org2' }, 'org1'), false);
  assert.equal(isVisibleInOrg({ organization_id: null }, 'org1'), true);
  assert.equal(isVisibleInOrg({ organization_id: 'org2' }, 'org1', true), true); // platform admin
});
