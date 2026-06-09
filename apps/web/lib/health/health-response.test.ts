// Run: node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test apps/web/lib/health/health-response.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shapeHealth,
  redactDetails,
  healthy,
  unhealthy,
  unconfigured,
} from './health-response';

test('shapeHealth: ok=true → status ok', () => {
  const out = shapeHealth('auth', { ok: true, message: 'fine' });
  assert.deepEqual(out, { ok: true, service: 'auth', status: 'ok', message: 'fine' });
});

test('shapeHealth: ok=false → status down', () => {
  const out = shapeHealth('auth', { ok: false, message: 'broken' });
  assert.equal(out.status, 'down');
  assert.equal(out.ok, false);
});

test('shapeHealth: explicit degraded status → ok false (only ok is healthy)', () => {
  const out = shapeHealth('rest', { ok: true, status: 'degraded', message: 'slow' });
  assert.equal(out.status, 'degraded');
  assert.equal(out.ok, false);
});

test('shapeHealth: explicit unconfigured status', () => {
  const out = shapeHealth('auth', { ok: false, status: 'unconfigured', message: 'no env' });
  assert.equal(out.status, 'unconfigured');
  assert.equal(out.ok, false);
});

test('shapeHealth: details are redacted', () => {
  const out = shapeHealth('auth', {
    ok: true,
    message: 'ok',
    details: { url: 'https://x.supabase.co', anonKey: 'secretval', nested: { token: 'abc' } },
  });
  assert.equal(out.details?.url, 'https://x.supabase.co');
  assert.equal(out.details?.anonKey, '[REDACTED]');
  assert.equal((out.details?.nested as Record<string, unknown>).token, '[REDACTED]');
});

test('redactDetails: strips key/secret/token/password/authorization', () => {
  const out = redactDetails({
    apiKey: 'a',
    serviceSecret: 'b',
    accessToken: 'c',
    password: 'd',
    Authorization: 'Bearer x',
    safe: 'keep',
  });
  assert.equal(out.apiKey, '[REDACTED]');
  assert.equal(out.serviceSecret, '[REDACTED]');
  assert.equal(out.accessToken, '[REDACTED]');
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.Authorization, '[REDACTED]');
  assert.equal(out.safe, 'keep');
});

test('redactDetails: walks arrays + nested objects, does not mutate input', () => {
  const input = { list: [{ token: 't1' }, { ok: 'v' }] };
  const out = redactDetails(input);
  const list = out.list as Array<Record<string, unknown>>;
  assert.equal(list[0].token, '[REDACTED]');
  assert.equal(list[1].ok, 'v');
  // original untouched
  assert.equal((input.list[0] as Record<string, unknown>).token, 't1');
});

test('healthy builder', () => {
  const out = healthy('rest', 'all good', { count: 3 });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'ok');
  assert.equal(out.details?.count, 3);
});

test('unhealthy builder', () => {
  const out = unhealthy('rest', 'down', { reason: 'x' });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'down');
});

test('unconfigured builder', () => {
  const out = unconfigured('auth', 'missing env');
  assert.equal(out.ok, false);
  assert.equal(out.status, 'unconfigured');
  assert.equal(out.details, undefined);
});

test('shapeHealth: no details key when none supplied', () => {
  const out = shapeHealth('auth', { ok: true, message: 'ok' });
  assert.ok(!('details' in out));
});
