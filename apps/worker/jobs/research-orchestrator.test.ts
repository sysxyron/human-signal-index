import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runResearchOrchestrator } from './research-orchestrator';

const NOW = '2026-06-09T12:00:00.000Z';

// -----------------------------------------------------------------------------
// In-memory fake of the minimal Supabase surface the orchestrator uses.
// -----------------------------------------------------------------------------
function fakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const store: Record<string, Array<Record<string, unknown>>> = {
    hsin_research_queue: [],
    hsin_research_runs: [],
    hsin_research_run_events: [],
    hsin_research_tasks: [],
    hsin_agent_assignments: [],
    hsin_research_escalations: [],
    ...seed,
  };

  function makeQuery(table: string) {
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    const q = {
      eq(col: string, val: unknown) { filters.push([col, val]); return q; },
      in(col: string, vals: unknown[]) { inFilters.push([col, vals]); return q; },
      order() { return q; },
      async limit() {
        const rows = (store[table] ?? []).filter(
          (r) => filters.every(([c, v]) => r[c] === v) && inFilters.every(([c, vs]) => vs.includes(r[c])),
        );
        return { data: rows, error: null };
      },
    };
    return q;
  }

  return {
    store,
    from(table: string) {
      return {
        select() { return makeQuery(table); },
        async insert(values: unknown) {
          store[table] = store[table] ?? [];
          store[table].push({ id: `${table}-${store[table].length}`, ...(values as Record<string, unknown>) });
          return { data: null, error: null };
        },
        update(values: unknown) {
          return {
            async eq(col: string, val: unknown) {
              for (const row of store[table] ?? []) {
                if (row[col] === val) Object.assign(row, values as Record<string, unknown>);
              }
              return { error: null };
            },
          };
        },
      };
    },
  };
}

test('offline mode runs fixtures deterministically', async () => {
  const a = await runResearchOrchestrator(NOW, { client: null });
  const b = await runResearchOrchestrator(NOW, { client: null });
  assert.equal(a.mode, 'offline');
  assert.ok(a.advanced > 0);
  assert.deepEqual(a, b);
});

test('db mode polls an empty queue gracefully', async () => {
  const client = fakeClient({});
  const r = await runResearchOrchestrator(NOW, { client });
  assert.equal(r.mode, 'db');
  assert.equal(r.polled, 0);
});

test('db mode advances a queued run and assigns an agent', async () => {
  const client = fakeClient({
    hsin_research_runs: [{ id: 'run-1', state: 'QUEUED', priority: 'HIGH', created_at: NOW }],
    hsin_research_queue: [{ id: 'q-1', run_id: 'run-1', priority: 'HIGH', status: 'queued', attempts: 0, max_attempts: 3, available_at: NOW, enqueued_at: NOW }],
  });
  const r = await runResearchOrchestrator(NOW, { client, batch: 1 });
  assert.equal(r.polled, 1);
  assert.equal(r.advanced, 1);
  // QUEUED → DISCOVERING needs a research agent.
  assert.equal(r.assigned, 1);
  assert.equal(client.store.hsin_research_run_events.length, 1);
  assert.equal(client.store.hsin_research_runs[0].state, 'DISCOVERING');
});

test('a run at a human gate is left for humans (not advanced)', async () => {
  const client = fakeClient({
    hsin_research_runs: [{ id: 'run-1', state: 'GOVERNANCE', priority: 'NORMAL', created_at: NOW }],
    hsin_research_queue: [{ id: 'q-1', run_id: 'run-1', priority: 'NORMAL', status: 'queued', attempts: 0, max_attempts: 3, available_at: NOW, enqueued_at: NOW }],
  });
  const r = await runResearchOrchestrator(NOW, { client, batch: 1 });
  assert.equal(r.advanced, 0);
  assert.equal(client.store.hsin_research_runs[0].state, 'GOVERNANCE');
});

test('a COMPLETE run drains its queue item without advancing', async () => {
  const client = fakeClient({
    hsin_research_runs: [{ id: 'run-1', state: 'COMPLETE', priority: 'NORMAL', created_at: NOW }],
    hsin_research_queue: [{ id: 'q-1', run_id: 'run-1', priority: 'NORMAL', status: 'queued', attempts: 0, max_attempts: 3, available_at: NOW, enqueued_at: NOW }],
  });
  const r = await runResearchOrchestrator(NOW, { client, batch: 1 });
  assert.equal(r.advanced, 0);
});

test('orphaned queue item (no run) is drained', async () => {
  const client = fakeClient({
    hsin_research_queue: [{ id: 'q-1', run_id: 'ghost', priority: 'NORMAL', status: 'queued', attempts: 0, max_attempts: 3, available_at: NOW, enqueued_at: NOW }],
  });
  const r = await runResearchOrchestrator(NOW, { client, batch: 1 });
  assert.equal(r.polled, 1);
  assert.equal(r.advanced, 0);
});

test('higher priority is dequeued first', async () => {
  const client = fakeClient({
    hsin_research_runs: [
      { id: 'run-low', state: 'QUEUED', priority: 'LOW', created_at: NOW },
      { id: 'run-crit', state: 'QUEUED', priority: 'CRITICAL', created_at: NOW },
    ],
    hsin_research_queue: [
      { id: 'q-low', run_id: 'run-low', priority: 'LOW', status: 'queued', attempts: 0, max_attempts: 3, available_at: NOW, enqueued_at: NOW },
      { id: 'q-crit', run_id: 'run-crit', priority: 'CRITICAL', status: 'queued', attempts: 0, max_attempts: 3, available_at: NOW, enqueued_at: NOW },
    ],
  });
  const r = await runResearchOrchestrator(NOW, { client, batch: 1 });
  assert.equal(r.polled, 1);
  // The CRITICAL run advanced first.
  assert.equal(client.store.hsin_research_runs.find((x) => x.id === 'run-crit')?.state, 'DISCOVERING');
  assert.equal(client.store.hsin_research_runs.find((x) => x.id === 'run-low')?.state, 'QUEUED');
});

test('never throws on a broken client', async () => {
  const broken = { from() { throw new Error('db down'); } } as unknown as Parameters<typeof runResearchOrchestrator>[1]['client'];
  const r = await runResearchOrchestrator(NOW, { client: broken });
  assert.equal(r.mode, 'db');
  assert.equal(r.polled, 0);
});

test('event records the transition reason', async () => {
  const client = fakeClient({
    hsin_research_runs: [{ id: 'run-1', state: 'CREATED', priority: 'NORMAL', created_at: NOW }],
    hsin_research_queue: [{ id: 'q-1', run_id: 'run-1', priority: 'NORMAL', status: 'queued', attempts: 0, max_attempts: 3, available_at: NOW, enqueued_at: NOW }],
  });
  await runResearchOrchestrator(NOW, { client, batch: 1 });
  const ev = client.store.hsin_research_run_events[0];
  assert.equal(ev.from_state, 'CREATED');
  assert.equal(ev.to_state, 'QUEUED');
  assert.equal(ev.actor, 'orchestrator');
});
