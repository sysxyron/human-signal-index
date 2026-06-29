// =============================================================================
// HSI — app-identity sync tests (node:test via tsx).
//
// Covers ensureAppUserRow (the injectable core of ensureCurrentAppUser): a
// missing public.users row is created, an existing one is reused, races are safe,
// and an uncreatable row degrades to a non-secret failure. Also covers the FK
// error → friendly message mapping (no raw FK leaks) and that the two protected
// inserts target public.users.id.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureAppUserRow,
  isMissingIdentityError,
  deriveNameFromEmail,
  fallbackEmail,
  ACCOUNT_NOT_READY_MESSAGE,
  type MinimalIdentityClient,
} from './ensure-app-user';
import { buildRoleApplicationInsert, purposeOption } from '../contributor/options';
import { buildSubmissionInsert } from '../signals/submission-persistence';
import { validateSubmission } from '../signals/submission-validate';

// ---- a capturing fake `public.users` client --------------------------------

interface FakeOpts {
  existingId?: string | null;   // row visible on the first select
  afterInsertId?: string | null; // row visible after a failed insert (race/trigger)
  insertError?: unknown;        // error returned by .insert()
  selectError?: unknown;        // error returned by .select().eq().maybeSingle()
}
function fakeDb(opts: FakeOpts = {}) {
  const captured = { inserts: [] as Record<string, unknown>[], selectCalls: 0, table: '' as string };
  let insertHappened = false;
  const db: MinimalIdentityClient = {
    from(table: string) {
      captured.table = table;
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  captured.selectCalls++;
                  if (opts.selectError) return { data: null, error: opts.selectError };
                  const id = insertHappened ? (opts.afterInsertId ?? null) : (opts.existingId ?? null);
                  return { data: id ? { id } : null, error: null };
                },
              };
            },
          };
        },
        async insert(row: Record<string, unknown>) {
          captured.inserts.push(row);
          insertHappened = true;
          return { error: opts.insertError ?? null };
        },
      };
    },
  };
  return { db, captured };
}

// ---- ensureAppUserRow: create / fetch --------------------------------------

test('auth user MISSING a public.users row → row is created (same id)', async () => {
  const { db, captured } = fakeDb({ existingId: null });
  const res = await ensureAppUserRow(db, { id: 'u1', email: 'jane@example.org' });
  assert.equal(res.ok, true);
  assert.equal(res.id, 'u1');
  assert.equal(res.created, true);
  assert.equal(captured.inserts.length, 1);
  assert.equal(captured.inserts[0].id, 'u1');               // SAME id as auth.users
  assert.equal(captured.inserts[0].email, 'jane@example.org');
  assert.equal(captured.inserts[0].name, 'jane');           // local-part, like the trigger
});

test('existing public.users row → fetched, NOT re-inserted', async () => {
  const { db, captured } = fakeDb({ existingId: 'u2' });
  const res = await ensureAppUserRow(db, { id: 'u2', email: 'who@example.org' });
  assert.equal(res.ok, true);
  assert.equal(res.id, 'u2');
  assert.equal(res.created, false);
  assert.equal(captured.inserts.length, 0); // no insert when it already exists
});

test('missing email (e.g. phone-only auth) → a non-null unique default email is used', async () => {
  const { db, captured } = fakeDb({ existingId: null });
  const res = await ensureAppUserRow(db, { id: 'u3', email: null });
  assert.equal(res.ok, true);
  const email = captured.inserts[0].email as string;
  assert.equal(email, 'u3@no-email.users.local');
  assert.ok(email.length > 0); // satisfies public.users.email NOT NULL
});

test('insert race (conflict) but the row now exists → treated as success', async () => {
  const { db } = fakeDb({ existingId: null, insertError: { code: '23505', message: 'duplicate key' }, afterInsertId: 'u4' });
  const res = await ensureAppUserRow(db, { id: 'u4', email: 'r@example.org' });
  assert.equal(res.ok, true);
  assert.equal(res.id, 'u4');
  assert.equal(res.created, false);
});

test('insert fails AND row still missing (no service-role perms) → ok:false, non-secret reason', async () => {
  const { db } = fakeDb({ existingId: null, insertError: { code: '42501', message: 'permission denied for table users' }, afterInsertId: null });
  const res = await ensureAppUserRow(db, { id: 'u5', email: 'x@example.org' });
  assert.equal(res.ok, false);
  assert.ok(res.reason && !/permission denied/i.test(res.reason)); // reason is generic, not the raw DB error
});

test('no user id → ok:false (never throws)', async () => {
  const { db } = fakeDb();
  const res = await ensureAppUserRow(db, { id: '' });
  assert.equal(res.ok, false);
});

// ---- pure helpers ----------------------------------------------------------

test('deriveNameFromEmail: local-part, with a safe fallback', () => {
  assert.equal(deriveNameFromEmail('Jane.Doe@example.org'), 'Jane.Doe');
  assert.equal(deriveNameFromEmail('@weird'), 'Member');
});

test('fallbackEmail: keeps a real email, synthesises a unique one otherwise', () => {
  assert.equal(fallbackEmail('u1', 'real@example.org'), 'real@example.org');
  assert.equal(fallbackEmail('u1', null), 'u1@no-email.users.local');
  assert.equal(fallbackEmail('u1', '   '), 'u1@no-email.users.local');
});

// ---- FK error mapping: raw FK errors are never shown -----------------------

test('isMissingIdentityError: detects the identity FK violations', () => {
  assert.equal(isMissingIdentityError({ code: '23503' }), true);
  assert.equal(isMissingIdentityError({ message: 'insert or update on table "role_applications" violates foreign key constraint "role_applications_user_id_fkey"' }), true);
  assert.equal(isMissingIdentityError({ message: 'violates foreign key constraint "signal_submissions_submitter_id_fkey"' }), true);
  assert.equal(isMissingIdentityError({ details: 'Key (id)=(...) is not present in table "public.users".' }), true);
});

test('isMissingIdentityError: unrelated errors are NOT mapped', () => {
  assert.equal(isMissingIdentityError({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isMissingIdentityError({ message: 'network error' }), false);
  assert.equal(isMissingIdentityError(null), false);
  assert.equal(isMissingIdentityError('boom'), false);
});

test('the user-facing message reveals no FK / token / SQL detail', () => {
  assert.match(ACCOUNT_NOT_READY_MESSAGE, /account setup is still being prepared/i);
  assert.doesNotMatch(ACCOUNT_NOT_READY_MESSAGE, /fkey|foreign key|users|auth|token|null/i);
});

// ---- protected inserts target public.users.id ------------------------------

test('role application insert uses the confirmed public.users.id', () => {
  const opt = purposeOption('researcher_applicant')!;
  const row = buildRoleApplicationInsert('app-user-id', opt, { reason: 'help verify' });
  assert.equal(row.user_id, 'app-user-id'); // FK → public.users(id)
  assert.equal(row.status, 'pending');      // RLS requires pending on insert
  assert.equal(row.requested_role, 'researcher');
});

test('signal submission insert uses the confirmed public.users.id', () => {
  const validated = validateSubmission({ observation: 'A clearly described public narrative worth review.' });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const row = buildSubmissionInsert('app-user-id', validated.value, 'org-1');
  assert.equal(row.submitter_id, 'app-user-id'); // FK → public.users(id)
  assert.equal(row.organization_id, 'org-1');
  assert.equal(row.status, 'pending');
});
