// =============================================================================
// HSI Phase 76 — central domain error mapper tests. Verifies that infrastructure
// errors classify correctly and that the returned message NEVER leaks SQL,
// constraint names, RLS policy text, SQLSTATE codes, or raw Supabase messages.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyDomainError, mapDomainError, toUserMessage } from './domain-error';
import { ACCOUNT_NOT_READY_MESSAGE } from '../auth/ensure-app-user';

// ---- classification --------------------------------------------------------

test('identity FK violation → ACCOUNT_NOT_READY (single identity path)', () => {
  assert.equal(classifyDomainError({ code: '23503', message: 'violates foreign key constraint "role_applications_user_id_fkey"' }), 'ACCOUNT_NOT_READY');
  assert.equal(mapDomainError({ code: '23503', message: 'signal_submissions_submitter_id_fkey' }).message, ACCOUNT_NOT_READY_MESSAGE);
});

test('unique violation → DUPLICATE', () => {
  assert.equal(classifyDomainError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }), 'DUPLICATE');
  assert.equal(classifyDomainError({ message: 'already exists' }), 'DUPLICATE');
});

test('RLS / privilege → PERMISSION_DENIED', () => {
  assert.equal(classifyDomainError({ code: '42501', message: 'permission denied for table beta_issues' }), 'PERMISSION_DENIED');
  assert.equal(classifyDomainError({ code: 'PGRST301' }), 'PERMISSION_DENIED');
  assert.equal(classifyDomainError({ message: 'new row violates row-level security policy for table "x"' }), 'PERMISSION_DENIED');
});

test('zero-rows / not found → NOT_FOUND', () => {
  assert.equal(classifyDomainError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }), 'NOT_FOUND');
});

test('check / not-null / invalid-input → VALIDATION', () => {
  assert.equal(classifyDomainError({ code: '23514', message: 'violates check constraint' }), 'VALIDATION');
  assert.equal(classifyDomainError({ code: '23502', message: 'null value in column "title"' }), 'VALIDATION');
  assert.equal(classifyDomainError({ code: '22P02', message: 'invalid input syntax for type uuid' }), 'VALIDATION');
});

test('non-identity foreign key → INVALID_STATE', () => {
  assert.equal(classifyDomainError({ code: '23503', message: 'violates foreign key constraint "beta_issues_cohort_id_fkey"' }), 'INVALID_STATE');
});

test('transport failure → UNAVAILABLE', () => {
  assert.equal(classifyDomainError({ message: 'fetch failed' }), 'UNAVAILABLE');
  assert.equal(classifyDomainError({ message: 'ECONNREFUSED 127.0.0.1:5432' }), 'UNAVAILABLE');
});

test('unrecognised → UNKNOWN', () => {
  assert.equal(classifyDomainError({ message: 'something odd' }), 'UNKNOWN');
  assert.equal(classifyDomainError(null), 'UNKNOWN');
});

// ---- overrides -------------------------------------------------------------

test('domain-specific overrides win over the generic default', () => {
  const m = mapDomainError({ code: '23505' }, { duplicate: 'You have already applied for this path.' });
  assert.equal(m.code, 'DUPLICATE');
  assert.equal(m.message, 'You have already applied for this path.');
  // falls back to the safe default when no override is supplied
  assert.equal(mapDomainError({ code: '23505' }).message, 'This has already been submitted.');
});

// ---- the critical guarantee: NO leakage ------------------------------------

const LEAKY_ERRORS: unknown[] = [
  { code: '42501', message: 'permission denied for table public.beta_issues', details: 'pg_policy beta_issues_insert_own', hint: 'check RLS' },
  { code: '23505', message: 'duplicate key value violates unique constraint "role_applications_pkey"', details: 'Key (id)=(...) already exists.' },
  { code: '23503', message: 'insert or update on table "beta_feedback" violates foreign key constraint "beta_feedback_user_id_fkey"', details: 'Key (user_id)=(...) is not present in table "users".' },
  { code: '42P01', message: 'relation "public.role_applications" does not exist' },
  { message: 'stack trace:\n  at Object.<anonymous> (/app/lib/x.ts:1:1)' },
  new Error('Supabase internal: JWT expired at 1700000000'),
];

test('mapped messages never leak SQL / constraint / RLS / table / SQLSTATE / stack detail', () => {
  const FORBIDDEN = [
    /constraint/i, /fkey/i, /pkey/i, /pg_policy/i, /row-level/i, /\bRLS\b/, /relation /i,
    /\btable\b/i, /\bcolumn\b/i, /SQLSTATE/i, /23505|23503|42501|42P01|PGRST/i,
    /stack trace/i, /\bat Object\b/i, /public\./i, /JWT/i, /supabase/i,
  ];
  for (const err of LEAKY_ERRORS) {
    const msg = toUserMessage(err);
    for (const pat of FORBIDDEN) {
      assert.ok(!pat.test(msg), `leaked ${pat} in: "${msg}"`);
    }
    assert.ok(msg.length > 0);
  }
});

test('toUserMessage is deterministic', () => {
  const e = { code: '23505', message: 'dup' };
  assert.equal(toUserMessage(e), toUserMessage(e));
});
