// Run: node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test apps/web/lib/auth/auth-errors.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCloudflareChallenge, translateAuthError } from './auth-errors';

// --- isCloudflareChallenge ---------------------------------------------------

test('isCloudflareChallenge: "Just a moment..." HTML → true', () => {
  assert.equal(isCloudflareChallenge('<html><title>Just a moment...</title></html>'), true);
});

test('isCloudflareChallenge: cf-challenge / __cf_chl markers → true', () => {
  assert.equal(isCloudflareChallenge('<div class="cf-challenge"></div>'), true);
  assert.equal(isCloudflareChallenge('window.__cf_chl_opt = {}'), true);
});

test('isCloudflareChallenge: "Attention Required" / "Checking your browser" → true', () => {
  assert.equal(isCloudflareChallenge('Attention Required! | Cloudflare'), true);
  assert.equal(isCloudflareChallenge('Checking your browser before accessing'), true);
});

test('isCloudflareChallenge: turnstile / hcaptcha markers → true', () => {
  assert.equal(isCloudflareChallenge('<div class="cf-turnstile"></div>'), true);
  assert.equal(isCloudflareChallenge('please complete the hcaptcha'), true);
});

test('isCloudflareChallenge: cf-mitigated via Response-like headers → true', () => {
  assert.equal(isCloudflareChallenge({ headers: { 'cf-mitigated': 'challenge' } }), true);
});

test('isCloudflareChallenge: enable javascript and cookies → true', () => {
  assert.equal(isCloudflareChallenge('Please enable JavaScript and cookies to continue'), true);
});

test('isCloudflareChallenge: object {message} carrying challenge text → true', () => {
  assert.equal(isCloudflareChallenge({ message: 'Just a moment...' }), true);
});

test('isCloudflareChallenge: plain JSON / normal error → false', () => {
  assert.equal(isCloudflareChallenge('{"error":"invalid_grant"}'), false);
  assert.equal(isCloudflareChallenge('Invalid login credentials'), false);
  assert.equal(isCloudflareChallenge(undefined), false);
  assert.equal(isCloudflareChallenge(null), false);
  assert.equal(isCloudflareChallenge(42), false);
});

// --- translateAuthError ------------------------------------------------------

test('invalid credentials → "Invalid email or password."', () => {
  const out = translateAuthError({ message: 'Invalid login credentials', status: 400 });
  assert.equal(out.kind, 'invalid_credentials');
  assert.equal(out.message, 'Invalid email or password.');
});

test('invalid_grant → invalid credentials', () => {
  const out = translateAuthError({ error: 'invalid_grant', error_description: 'invalid_grant' });
  assert.equal(out.kind, 'invalid_credentials');
});

test('email not confirmed → "Email not confirmed."', () => {
  const out = translateAuthError({ message: 'Email not confirmed', status: 400 });
  assert.equal(out.kind, 'email_not_confirmed');
  assert.equal(out.message, 'Email not confirmed.');
});

test('"Failed to fetch" TypeError → network message, NOT bare "Failed to fetch"', () => {
  const out = translateAuthError(new TypeError('Failed to fetch'));
  assert.equal(out.kind, 'network');
  assert.equal(out.message, 'Cannot reach Supabase Auth endpoint.');
  assert.match(out.hint ?? '', /NEXT_PUBLIC_SUPABASE_URL/);
  assert.notEqual(out.message, 'Failed to fetch');
});

test('"fetch failed" (node) → network', () => {
  const out = translateAuthError(new TypeError('fetch failed'));
  assert.equal(out.kind, 'network');
});

test('Cloudflare challenge body → challenge message with route + WAF hint', () => {
  const out = translateAuthError('<title>Just a moment...</title>', { route: '/auth/v1/token' });
  assert.equal(out.kind, 'cloudflare_challenge');
  assert.match(out.message, /Cloudflare challenge detected on \/auth\/v1\/token route\./);
  assert.match(out.hint ?? '', /WAF skip rule for \/auth\//);
});

test('CORS markers → "Browser blocked the request (CORS)."', () => {
  const out = translateAuthError({ message: 'blocked by CORS policy: no Access-Control-Allow-Origin' });
  assert.equal(out.kind, 'cors');
  assert.equal(out.message, 'Browser blocked the request (CORS).');
});

test('401 / invalid token → "Your session token is invalid."', () => {
  const out = translateAuthError({ message: 'invalid token', status: 401 });
  assert.equal(out.kind, 'invalid_token');
  assert.equal(out.message, 'Your session token is invalid.');
});

test('expired session → "Your session has expired — please sign in again."', () => {
  const out = translateAuthError({ message: 'JWT expired' });
  assert.equal(out.kind, 'expired_session');
  assert.match(out.message, /session has expired/);
});

test('429 → "Too many attempts — please wait and try again."', () => {
  const out = translateAuthError({ message: 'rate limit exceeded', status: 429 });
  assert.equal(out.kind, 'rate_limited');
  assert.equal(out.message, 'Too many attempts — please wait and try again.');
});

test('config placeholder → config_missing', () => {
  const out = translateAuthError({ message: 'using anon-placeholder-key' });
  assert.equal(out.kind, 'config_missing');
});

test('5xx on auth route → auth_endpoint_blocked', () => {
  const out = translateAuthError({ message: 'bad gateway', status: 502 }, { route: '/auth/' });
  assert.equal(out.kind, 'auth_endpoint_blocked');
});

test('5xx on rest route → rest_endpoint_blocked', () => {
  const out = translateAuthError({ message: 'server error', status: 503 }, { route: '/rest/v1/x' });
  assert.equal(out.kind, 'rest_endpoint_blocked');
});

test('unknown object → composed via formatErrorMessage, never [object Object]', () => {
  const out = translateAuthError({ weird: true, n: 1 });
  assert.equal(out.kind, 'unknown');
  assert.doesNotMatch(out.message, /\[object Object\]/);
  assert.match(out.message, /weird/);
});

test('never returns a bare "Failed to fetch" even when only formatErrorMessage would', () => {
  const out = translateAuthError({ message: 'Failed to fetch' });
  assert.notEqual(out.message, 'Failed to fetch');
  assert.equal(out.kind, 'network');
});

test('default route is /auth/ when ctx omitted', () => {
  const out = translateAuthError('Just a moment...');
  assert.match(out.message, /\/auth\//);
});
