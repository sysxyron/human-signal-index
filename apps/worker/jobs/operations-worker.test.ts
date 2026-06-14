import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runOperationsStage, makeOperationsWorkerJob } from './operations-worker';

const NOW = '2026-06-13T12:00:00.000Z';

function fakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const store: Record<string, Array<Record<string, unknown>>> = {
    assignments: [], escalations: [], workloads: [], operations_alerts: [], ...seed,
  };
  function query(table: string) {
    const filters: Array<[string, unknown]> = [];
    const api = {
      eq(c: string, v: unknown) { filters.push([c, v]); return api; },
      async limit() {
        const rows = (store[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
        return { data: rows, error: null };
      },
    };
    return api;
  }
  return {
    store,
    from(table: string) {
      return {
        select() { return query(table); },
        async insert(values: unknown) {
          store[table] = store[table] ?? [];
          store[table].push({ id: `${table}-${store[table].length}`, ...(values as Record<string, unknown>) });
          return { data: null, error: null };
        },
      };
    },
  };
}

test('offline mode runs fixtures deterministically', async () => {
  const a = await runOperationsStage(NOW, { client: null });
  const b = await runOperationsStage(NOW, { client: null });
  assert.equal(a.mode, 'offline');
  assert.ok(a.alertsGenerated > 0);
  assert.deepEqual(a, b);
});

test('offline mode writes nothing', async () => {
  const r = await runOperationsStage(NOW, { client: null });
  assert.equal(r.workloadsWritten, 0);
});

test('db mode with nothing is a clean no-op', async () => {
  const client = fakeClient({});
  const r = await runOperationsStage(NOW, { client });
  assert.equal(r.mode, 'db');
  assert.equal(r.cases, 0);
});

test('db mode builds workloads from assignments + escalations', async () => {
  const client = fakeClient({
    assignments: [
      { case_id: 'c1', role: 'owner', assignee: 'alice', case_kind: 'research', active: true },
      { case_id: 'c2', role: 'owner', assignee: 'alice', case_kind: 'research', active: true },
    ],
    escalations: [{ case_id: 'c2', level: 'CRITICAL', active: true }],
  });
  const r = await runOperationsStage(NOW, { client });
  assert.equal(r.cases, 2);
  assert.ok(r.workloadsWritten > 0);
  assert.ok(client.store.workloads.length > 0);
});

test('critical escalation produces an advisory alert', async () => {
  const client = fakeClient({
    assignments: [{ case_id: 'c1', role: 'owner', assignee: 'alice', case_kind: 'review', active: true }],
    escalations: [{ case_id: 'c1', level: 'CRITICAL', active: true }],
  });
  const r = await runOperationsStage(NOW, { client });
  assert.ok(r.alertsGenerated >= 1);
  assert.ok(client.store.operations_alerts.some((a) => a.kind === 'escalation_pending'));
});

test('worker never writes assignments/escalations (no autonomous actions)', async () => {
  const client = fakeClient({ assignments: [{ case_id: 'c1', role: 'owner', assignee: 'a', case_kind: 'research', active: true }] });
  const before = client.store.assignments.length;
  await runOperationsStage(NOW, { client });
  assert.equal(client.store.assignments.length, before);
  assert.equal(client.store.escalations.length, 0);
});

test('never throws on a broken client', async () => {
  const broken = { from() { throw new Error('db down'); } } as unknown as Parameters<typeof runOperationsStage>[1] extends { client?: infer C } ? C : never;
  const r = await runOperationsStage(NOW, { client: broken });
  assert.equal(r.mode, 'db');
  assert.equal(r.cases, 0);
});

test('job scheduled every 30 min, declares no auto-actions', () => {
  const job = makeOperationsWorkerJob();
  assert.equal(job.name, 'operationsWorker');
  assert.equal(job.schedule, '*/30 * * * *');
  assert.match(job.description, /NEVER auto-assigns/);
});
