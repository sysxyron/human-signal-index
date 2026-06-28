import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyRecoveryLink, INVALID_RECOVERY_LINK_MESSAGE } from './recovery-link';

// ---- PKCE code flow (current production recovery format) -------------------

test('?code=… → exchange action (PKCE), with recovery type', () => {
  const a = classifyRecoveryLink('?code=pkce_abc123&type=recovery', '');
  assert.equal(a.kind, 'code');
  assert.equal(a.kind === 'code' && a.code, 'pkce_abc123');
  assert.equal(a.type, 'recovery');
});

test('?code=… with no type → still a code action (type null)', () => {
  const a = classifyRecoveryLink('?code=abc', '');
  assert.equal(a.kind, 'code');
  assert.equal(a.type, null);
});

test('works with search passed without the leading "?"', () => {
  const a = classifyRecoveryLink('code=abc&type=recovery', '');
  assert.equal(a.kind, 'code');
  assert.equal(a.kind === 'code' && a.code, 'abc');
});

// ---- implicit hash-token flow ----------------------------------------------

test('#access_token + #refresh_token → setSession action', () => {
  const a = classifyRecoveryLink('', '#access_token=a.b.c&refresh_token=r-1_2&type=recovery&expires_in=3600');
  assert.equal(a.kind, 'hash');
  if (a.kind === 'hash') {
    assert.equal(a.accessToken, 'a.b.c');
    assert.equal(a.refreshToken, 'r-1_2');
    assert.equal(a.type, 'recovery');
  }
});

test('access_token without refresh_token → not a hash action (falls to session check)', () => {
  const a = classifyRecoveryLink('', '#access_token=onlyone');
  assert.equal(a.kind, 'session');
});

// ---- error links -----------------------------------------------------------

test('?error_description=… → error action with the provider message', () => {
  const a = classifyRecoveryLink('?error=access_denied&error_description=Email+link+is+invalid+or+has+expired', '');
  assert.equal(a.kind, 'error');
  assert.equal(a.kind === 'error' && a.message, 'Email link is invalid or has expired');
});

test('#error=… in the hash → error action (falls back to friendly copy)', () => {
  const a = classifyRecoveryLink('', '#error=access_denied&error_code=otp_expired');
  assert.equal(a.kind, 'error');
  assert.equal(a.kind === 'error' && a.message, INVALID_RECOVERY_LINK_MESSAGE);
});

test('error takes precedence over a stale code in the same URL', () => {
  const a = classifyRecoveryLink('?code=abc&error=access_denied&error_description=expired', '');
  assert.equal(a.kind, 'error');
});

// ---- no material → session check -------------------------------------------

test('empty URL → session action (check for a pre-established session)', () => {
  const a = classifyRecoveryLink('', '');
  assert.equal(a.kind, 'session');
  assert.equal(a.type, null);
});

test('?flow=recovery only (routed via /auth/callback) → session action keeps type', () => {
  // /auth/callback establishes the session then redirects with ?flow=recovery;
  // there is no code/hash here, so we check the existing session.
  const a = classifyRecoveryLink('?type=recovery', '');
  assert.equal(a.kind, 'session');
  assert.equal(a.type, 'recovery');
});

test('invite type is recognised (shared update-password page)', () => {
  const a = classifyRecoveryLink('?code=abc&type=invite', '');
  assert.equal(a.type, 'invite');
});

test('unrelated type value is ignored (null)', () => {
  const a = classifyRecoveryLink('?code=abc&type=signup', '');
  assert.equal(a.type, null);
});

// ---- robustness ------------------------------------------------------------

test('null / undefined inputs → session action, no throw', () => {
  assert.equal(classifyRecoveryLink(null, null).kind, 'session');
  assert.equal(classifyRecoveryLink(undefined, undefined).kind, 'session');
});

test('deterministic', () => {
  const s = '?code=abc&type=recovery';
  assert.deepEqual(classifyRecoveryLink(s, ''), classifyRecoveryLink(s, ''));
});
