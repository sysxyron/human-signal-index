// Run: node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test apps/web/lib/auth/auth-diagnostics.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnoseConfig,
  diagnoseFetchOutcome,
  summarizeDiagnoses,
  diagnoseStartupEnv,
} from './auth-diagnostics';

test('diagnoseStartupEnv: missing required → error rows incl APP_URL', () => {
  const out = diagnoseStartupEnv({});
  assert.ok(out.some((d) => d.code.includes('NEXT_PUBLIC_APP_URL') && !d.ok && d.severity === 'error'));
  assert.ok(out.some((d) => d.code.includes('NEXT_PUBLIC_SUPABASE_URL') && !d.ok));
});

test('diagnoseStartupEnv: missing optional → info row, ok stays true', () => {
  const out = diagnoseStartupEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'realkey',
    NEXT_PUBLIC_APP_URL: 'https://app.example',
  });
  const optional = out.find((d) => d.code.includes('optional.missing.OPENAI_API_KEY'));
  assert.ok(optional);
  assert.equal(optional?.ok, true);
  assert.equal(optional?.severity, 'info');
});

test('diagnoseStartupEnv: all valid → single ok row', () => {
  const out = diagnoseStartupEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'realkey',
    NEXT_PUBLIC_APP_URL: 'https://app.example',
    SUPABASE_SERVICE_ROLE_KEY: 'svc',
    OPENAI_API_KEY: 'sk-x',
    YOUTUBE_API_KEY: 'yt',
    PODCAST_INDEX_API_KEY: 'pi',
    RESEND_API_KEY: 'rk',
    RESEND_FROM: 'noreply@x.com',
    BETA_NOTIFY_EMAIL: 'beta@x.com',
    CRON_SECRET: 'cs',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'env.ok');
  assert.equal(out[0].ok, true);
});

test('diagnoseStartupEnv: never leaks secret values', () => {
  const out = diagnoseStartupEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'realkey',
    NEXT_PUBLIC_APP_URL: 'https://app.example',
    OPENAI_API_KEY: 'sk-LEAKME-secret',
  });
  assert.doesNotMatch(JSON.stringify(out), /LEAKME/);
});

// --- diagnoseConfig ----------------------------------------------------------

test('diagnoseConfig: missing url + anon → two errors', () => {
  const out = diagnoseConfig({});
  const urlErr = out.find((d) => d.code === 'config.url.missing');
  const anonErr = out.find((d) => d.code === 'config.anon.missing');
  assert.ok(urlErr && !urlErr.ok && urlErr.severity === 'error');
  assert.ok(anonErr && !anonErr.ok && anonErr.severity === 'error');
});

test('diagnoseConfig: placeholder url + anon detected as not configured', () => {
  const out = diagnoseConfig({ url: 'http://127.0.0.1:54321', anonKey: 'anon-placeholder-key' });
  assert.ok(out.find((d) => d.code === 'config.url.placeholder' && !d.ok));
  assert.ok(out.find((d) => d.code === 'config.anon.placeholder' && !d.ok));
});

test('diagnoseConfig: invalid url format flagged', () => {
  const out = diagnoseConfig({ url: 'not-a-url', anonKey: 'realkey123' });
  assert.ok(out.find((d) => d.code === 'config.url.invalid' && !d.ok));
});

test('diagnoseConfig: valid config → ok rows', () => {
  const out = diagnoseConfig({ url: 'https://abc.supabase.co', anonKey: 'eyJrealkey' });
  assert.ok(out.find((d) => d.code === 'config.url.ok' && d.ok));
  assert.ok(out.find((d) => d.code === 'config.anon.ok' && d.ok));
});

// --- diagnoseFetchOutcome ----------------------------------------------------

test('diagnoseFetchOutcome: 2xx → ok', () => {
  const out = diagnoseFetchOutcome({ status: 200, service: 'auth' });
  assert.equal(out.ok, true);
  assert.equal(out.severity, 'info');
  assert.match(out.code, /auth\.ok/);
});

test('diagnoseFetchOutcome: Cloudflare HTML body → challenge error', () => {
  const out = diagnoseFetchOutcome({ status: 200, bodyText: 'Just a moment...', service: 'auth' });
  assert.equal(out.ok, false);
  assert.equal(out.severity, 'error');
  assert.match(out.code, /cloudflare_challenge/);
  assert.match(out.message, /Cloudflare challenge detected on \/auth\/ route/);
});

test('diagnoseFetchOutcome: 401/403 on auth settings → OK-ish note', () => {
  const out401 = diagnoseFetchOutcome({ status: 401, service: 'auth' });
  const out403 = diagnoseFetchOutcome({ status: 403, service: 'auth' });
  assert.equal(out401.ok, true);
  assert.equal(out403.ok, true);
  assert.match(out401.message, /public/);
});

test('diagnoseFetchOutcome: 401 on rest → warning (not OK)', () => {
  const out = diagnoseFetchOutcome({ status: 401, service: 'rest' });
  assert.equal(out.ok, false);
  assert.equal(out.severity, 'warning');
});

test('diagnoseFetchOutcome: network error / no status → endpoint blocked', () => {
  const out = diagnoseFetchOutcome({ error: new TypeError('Failed to fetch'), service: 'auth' });
  assert.equal(out.ok, false);
  assert.equal(out.severity, 'error');
  assert.match(out.code, /endpoint_blocked/);
});

test('diagnoseFetchOutcome: 5xx → service error', () => {
  const out = diagnoseFetchOutcome({ status: 503, service: 'rest' });
  assert.equal(out.ok, false);
  assert.equal(out.severity, 'error');
  assert.match(out.code, /service_error/);
});

test('diagnoseFetchOutcome: 429 → rate limited warning', () => {
  const out = diagnoseFetchOutcome({ status: 429, service: 'storage' });
  assert.equal(out.severity, 'warning');
  assert.match(out.code, /rate_limited/);
});

// --- summarizeDiagnoses ------------------------------------------------------

test('summarizeDiagnoses: worst severity + ok flag', () => {
  const out = summarizeDiagnoses([
    { code: 'a', ok: true, severity: 'info', message: 'fine' },
    { code: 'b', ok: false, severity: 'warning', message: 'warn' },
    { code: 'c', ok: false, severity: 'error', message: 'bad' },
  ]);
  assert.equal(out.ok, false);
  assert.equal(out.worst, 'error');
  assert.deepEqual(out.messages, ['fine', 'warn', 'bad']);
});

test('summarizeDiagnoses: all ok → ok true, worst info', () => {
  const out = summarizeDiagnoses([
    { code: 'a', ok: true, severity: 'info', message: 'fine' },
    { code: 'b', ok: true, severity: 'info', message: 'also fine' },
  ]);
  assert.equal(out.ok, true);
  assert.equal(out.worst, 'info');
});
