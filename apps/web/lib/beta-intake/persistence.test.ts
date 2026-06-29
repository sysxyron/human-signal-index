import { test } from 'node:test';
import assert from 'node:assert/strict';

import { persistBetaApplication, persistDemoRequest, type IntakeClient } from './persistence';
import type { BetaApplicationInput, DemoRequestInput } from './intake';

const BETA: BetaApplicationInput = { name: 'Ada', email: 'Ada@X.com', role: 'Researcher', reason: 'curious', organization: null, areaOfInterest: null, experience: null, preferredRole: null };
const DEMO: DemoRequestInput = { name: 'Bob', email: 'BOB@co.com', organization: 'Co', useCase: 'monitoring', role: null, teamSize: null, timeline: null, notes: null };

/** Fake client: records the insert it receives + the dedup query email/since. */
function fakeClient(opts: { existing?: boolean; insertError?: string; newId?: string } = {}): {
  client: IntakeClient;
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  queries: Array<{ table: string; email: string; since: string }>;
} {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const queries: Array<{ table: string; email: string; since: string }> = [];
  const client: IntakeClient = {
    from(table: string) {
      return {
        select() {
          return {
            eq(_c: string, email: string) {
              return {
                gte(_c2: string, since: string) {
                  return {
                    async limit() {
                      queries.push({ table, email, since });
                      return { data: opts.existing ? [{ id: 'existing' }] : [] };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  inserts.push({ table, row });
                  if (opts.insertError) return { data: null, error: { message: opts.insertError } };
                  return { data: { id: opts.newId ?? 'new-id' }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, inserts, queries };
}

test('persist: no client (unconfigured) → not_configured, no throw', async () => {
  const res = await persistBetaApplication(BETA, { client: null });
  assert.deepEqual(res, { persisted: false, reason: 'not_configured' });
});

test('persistBetaApplication: fresh email → inserts a normalized-email row', async () => {
  const f = fakeClient({ newId: 'beta-1' });
  const res = await persistBetaApplication(BETA, { client: f.client });
  assert.deepEqual(res, { persisted: true, id: 'beta-1', duplicate: false });
  assert.equal(f.inserts.length, 1);
  assert.equal(f.inserts[0].table, 'beta_applications');
  assert.equal(f.inserts[0].row.email, 'ada@x.com'); // normalized before persist
  assert.equal(f.inserts[0].row.status, 'pending');
  // dedup query used the normalized email
  assert.equal(f.queries[0].email, 'ada@x.com');
});

test('persistBetaApplication: existing recent row → duplicate, NO insert', async () => {
  const f = fakeClient({ existing: true });
  const res = await persistBetaApplication(BETA, { client: f.client });
  assert.deepEqual(res, { persisted: false, duplicate: true });
  assert.equal(f.inserts.length, 0);
});

test('persistBetaApplication: insert error → error result (never throws)', async () => {
  const f = fakeClient({ insertError: 'duplicate key value violates unique constraint' });
  const res = await persistBetaApplication(BETA, { client: f.client });
  assert.deepEqual(res, { persisted: false, reason: 'error' });
});

test('persistDemoRequest: fresh → inserts into demo_requests with normalized email', async () => {
  const f = fakeClient({ newId: 'demo-1' });
  const res = await persistDemoRequest(DEMO, { client: f.client });
  assert.deepEqual(res, { persisted: true, id: 'demo-1', duplicate: false });
  assert.equal(f.inserts[0].table, 'demo_requests');
  assert.equal(f.inserts[0].row.email, 'bob@co.com');
  assert.equal(f.inserts[0].row.use_case, 'monitoring');
  assert.equal(f.inserts[0].row.status, 'new');
});

test('persist: dedup window controls the since timestamp', async () => {
  const f = fakeClient();
  await persistBetaApplication(BETA, { client: f.client, nowIso: '2026-06-29T12:00:00.000Z', windowMs: 60 * 60 * 1000 });
  assert.equal(f.queries[0].since, '2026-06-29T11:00:00.000Z');
});
