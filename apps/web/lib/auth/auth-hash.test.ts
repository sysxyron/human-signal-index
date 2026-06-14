import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AUTH_CALLBACK_PATH, authHashForwardPath, isAuthHash } from './auth-hash';

// ---- isAuthHash: should NOT trigger for ordinary homepage hashes -----------

test('no hash → not an auth hash', () => {
  assert.equal(isAuthHash(''), false);
  assert.equal(isAuthHash('#'), false);
  assert.equal(isAuthHash(null), false);
  assert.equal(isAuthHash(undefined), false);
});

test('ordinary anchor / unrelated hash → not an auth hash', () => {
  assert.equal(isAuthHash('#features'), false);
  assert.equal(isAuthHash('#section-2'), false);
  assert.equal(isAuthHash('#tab=overview'), false);
  assert.equal(isAuthHash('#utm_source=newsletter'), false);
});

// ---- isAuthHash: should trigger for Supabase auth material -----------------

test('access_token hash → auth hash', () => {
  assert.equal(isAuthHash('#access_token=abc&refresh_token=xyz&type=magiclink&expires_in=3600'), true);
});

test('refresh_token alone → auth hash', () => {
  assert.equal(isAuthHash('#refresh_token=xyz'), true);
});

test('error hash → auth hash', () => {
  assert.equal(isAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), true);
});

test('error_description alone → auth hash', () => {
  assert.equal(isAuthHash('#error_description=something'), true);
});

test('type=magiclink / invite / recovery → auth hash', () => {
  assert.equal(isAuthHash('#type=magiclink'), true);
  assert.equal(isAuthHash('#type=invite'), true);
  assert.equal(isAuthHash('#type=recovery'), true);
});

test('unrelated type values → not an auth hash', () => {
  assert.equal(isAuthHash('#type=overview'), false);
});

test('works with or without leading #', () => {
  assert.equal(isAuthHash('access_token=abc'), true);
  assert.equal(isAuthHash('#access_token=abc'), true);
});

// ---- authHashForwardPath: preserves the hash exactly -----------------------

test('non-auth hash → null (no redirect)', () => {
  assert.equal(authHashForwardPath('#features'), null);
  assert.equal(authHashForwardPath(''), null);
  assert.equal(authHashForwardPath(null), null);
});

test('auth hash → /auth/callback with the hash preserved exactly', () => {
  const hash = '#access_token=abc&refresh_token=xyz&type=magiclink';
  assert.equal(authHashForwardPath(hash), `${AUTH_CALLBACK_PATH}#access_token=abc&refresh_token=xyz&type=magiclink`);
});

test('forward target has exactly one leading # (no double-hash)', () => {
  const out = authHashForwardPath('#access_token=abc') as string;
  assert.ok(out.includes('#'));
  assert.equal(out.indexOf('#'), out.lastIndexOf('#'));
  assert.equal(out, '/auth/callback#access_token=abc');
});

test('no token loss — every param survives the forward', () => {
  const hash = '#access_token=a.b.c&refresh_token=r-1_2&type=invite&expires_in=3600&token_type=bearer';
  const out = authHashForwardPath(hash) as string;
  assert.equal(out, `/auth/callback${hash}`);
  for (const part of hash.slice(1).split('&')) assert.ok(out.includes(part), `missing ${part}`);
});

test('error hash forwards too (so the callback can show a friendly message)', () => {
  const hash = '#error=access_denied&error_description=expired';
  assert.equal(authHashForwardPath(hash), `/auth/callback${hash}`);
});

test('deterministic', () => {
  const h = '#access_token=abc&type=recovery';
  assert.equal(authHashForwardPath(h), authHashForwardPath(h));
});
