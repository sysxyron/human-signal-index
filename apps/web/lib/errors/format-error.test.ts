// Run: node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test apps/web/lib/errors/format-error.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatErrorMessage, formatErrorDetails } from './format-error';

test('string passes through', () => {
  assert.equal(formatErrorMessage('boom'), 'boom');
});

test('null / undefined never throw and never produce [object Object]', () => {
  assert.equal(formatErrorMessage(null), 'Unknown error (no details provided).');
  assert.equal(formatErrorMessage(undefined), 'Unknown error (no details provided).');
  assert.doesNotMatch(formatErrorMessage(null), /\[object Object\]/);
});

test('Error instance → its message', () => {
  assert.equal(formatErrorMessage(new Error('kaboom')), 'kaboom');
});

test('plain object with NO message → JSON, never [object Object]', () => {
  const out = formatErrorMessage({ weird: true, n: 1 });
  assert.doesNotMatch(out, /\[object Object\]/);
  assert.match(out, /weird/);
});

test('Supabase/PostgREST object surfaces message + code + hint', () => {
  const pgErr = { message: 'something failed', code: 'P0001', hint: 'try again', details: 'x' };
  const out = formatErrorMessage(pgErr);
  assert.match(out, /something failed/);
  assert.match(out, /P0001/);
  assert.match(out, /try again/);
  assert.doesNotMatch(out, /\[object Object\]/);
});

test('missing table (Postgres 42P01) → actionable message with relation name', () => {
  const err = { code: '42P01', message: 'relation "public.hsin_sources" does not exist' };
  assert.equal(
    formatErrorMessage(err),
    'Database table missing or migration not applied: hsin_sources.',
  );
});

test('missing table (PostgREST PGRST205 schema cache) → actionable message', () => {
  const err = {
    code: 'PGRST205',
    message: "Could not find the table 'public.hsin_signals' in the schema cache",
  };
  assert.equal(
    formatErrorMessage(err),
    'Database table missing or migration not applied: hsin_signals.',
  );
});

test('RLS / insufficient privilege (42501) → RLS message', () => {
  const err = { code: '42501', message: 'permission denied for table hsin_alerts' };
  assert.match(formatErrorMessage(err), /row-level security \(RLS\)/i);
});

test('row-level-security violation text → RLS message even without code', () => {
  const err = { message: 'new row violates row-level security policy for table "worlds"' };
  assert.match(formatErrorMessage(err), /row-level security/i);
});

test('network failure → reachability message', () => {
  assert.match(formatErrorMessage(new TypeError('fetch failed')), /Could not reach the database/i);
});

test('formatErrorDetails returns structured fields', () => {
  const d = formatErrorDetails({ message: 'm', code: 'C', hint: 'h', details: 'd' });
  assert.deepEqual(d, { message: 'm', code: 'C', hint: 'h', details: 'd' });
});

test('auth-style { error, error_description } object', () => {
  const out = formatErrorMessage({ error: 'invalid_grant', error_description: 'bad token' });
  assert.match(out, /bad token/);
  assert.doesNotMatch(out, /\[object Object\]/);
});
