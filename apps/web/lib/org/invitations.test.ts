import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inviteState, inviteEmailMatches, canAcceptInvite, INVITE_TTL_MS } from './invitations';

const NOW = Date.parse('2026-06-15T12:00:00Z');
const future = '2026-06-20T12:00:00Z';
const past = '2026-06-10T12:00:00Z';

test('inviteState: valid / expired / accepted / not_found', () => {
  assert.equal(inviteState({ email: 'a@x.com', expiresAt: future }, NOW), 'valid');
  assert.equal(inviteState({ email: 'a@x.com', expiresAt: past }, NOW), 'expired');
  assert.equal(inviteState({ email: 'a@x.com', expiresAt: future, acceptedAt: '2026-06-14T00:00:00Z' }, NOW), 'accepted');
  assert.equal(inviteState(null, NOW), 'not_found');
});

test('email match is case-insensitive + trimmed', () => {
  assert.ok(inviteEmailMatches('A@X.com', ' a@x.com '));
  assert.ok(!inviteEmailMatches('a@x.com', 'b@x.com'));
  assert.ok(!inviteEmailMatches('a@x.com', null));
});

test('canAcceptInvite requires valid + email match', () => {
  const invite = { email: 'a@x.com', expiresAt: future };
  assert.ok(canAcceptInvite(invite, 'a@x.com', NOW));
  assert.ok(!canAcceptInvite(invite, 'b@x.com', NOW)); // wrong user
  assert.ok(!canAcceptInvite({ email: 'a@x.com', expiresAt: past }, 'a@x.com', NOW)); // expired
  assert.ok(!canAcceptInvite({ email: 'a@x.com', expiresAt: future, acceptedAt: 't' }, 'a@x.com', NOW)); // already accepted
  assert.ok(!canAcceptInvite(null, 'a@x.com', NOW));
});

test('invite TTL is 7 days', () => {
  assert.equal(INVITE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
});
