import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runConsensusStage } from './consensus-worker';

const NOW = '2026-06-09T12:00:00.000Z';

function fakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const store: Record<string, Array<Record<string, unknown>>> = {
    hsin_investigations: [],
    hsin_findings: [],
    hsin_challenges: [],
    hsin_consensus_snapshots: [],
    hsin_contributor_scores: [],
    ...seed,
  };

  function makeQuery(table: string) {
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    const run = () => (store[table] ?? []).filter(
      (r) => filters.every(([c, v]) => r[c] === v) && inFilters.every(([c, vs]) => vs.includes(r[c])),
    );
    const q = {
      eq(c: string, v: unknown) { filters.push([c, v]); return q; },
      in(c: string, vs: unknown[]) { inFilters.push([c, vs]); return q; },
      order() { return q; },
      async limit() { return { data: run(), error: null }; },
      async maybeSingle() { return { data: run()[0] ?? null, error: null }; },
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
              for (const row of store[table] ?? []) if (row[col] === val) Object.assign(row, values as Record<string, unknown>);
              return { error: null };
            },
          };
        },
      };
    },
  };
}

test('offline mode runs fixtures deterministically', async () => {
  const a = await runConsensusStage(NOW, { client: null });
  const b = await runConsensusStage(NOW, { client: null });
  assert.equal(a.mode, 'offline');
  assert.ok(a.snapshots >= 1);
  assert.ok(a.contributorScores >= 1);
  assert.deepEqual(a, b);
});

test('db mode with no investigations is a clean no-op', async () => {
  const r = await runConsensusStage(NOW, { client: fakeClient({}) });
  assert.equal(r.mode, 'db');
  assert.equal(r.investigations, 0);
  assert.equal(r.snapshots, 0);
});

test('db mode computes + persists a consensus snapshot', async () => {
  const client = fakeClient({
    hsin_investigations: [{ id: 'inv1', state: 'ACTIVE' }],
    hsin_findings: [
      { id: 'f1', investigation_id: 'inv1', contributor_id: 'c1', position: 'A', confidence: 0.8 },
      { id: 'f2', investigation_id: 'inv1', contributor_id: 'c2', position: 'A', confidence: 0.75 },
    ],
  });
  const r = await runConsensusStage(NOW, { client });
  assert.equal(r.investigations, 1);
  assert.equal(r.snapshots, 1);
  assert.equal(client.store.hsin_consensus_snapshots.length, 1);
  assert.equal(client.store.hsin_consensus_snapshots[0].consensus_position, 'A');
});

test('db mode computes contributor scores', async () => {
  const client = fakeClient({
    hsin_investigations: [{ id: 'inv1', state: 'ACTIVE' }],
    hsin_findings: [
      { id: 'f1', investigation_id: 'inv1', contributor_id: 'c1', position: 'A', confidence: 0.8 },
      { id: 'f2', investigation_id: 'inv1', contributor_id: 'c2', position: 'B', confidence: 0.4 },
    ],
  });
  const r = await runConsensusStage(NOW, { client });
  assert.ok(r.contributorScores >= 2);
  assert.ok(client.store.hsin_contributor_scores.length >= 2);
});

test('contributor score upsert updates an existing row', async () => {
  const client = fakeClient({
    hsin_investigations: [{ id: 'inv1', state: 'ACTIVE' }],
    hsin_findings: [{ id: 'f1', investigation_id: 'inv1', contributor_id: 'c1', position: 'A', confidence: 0.8 }],
    hsin_contributor_scores: [{ id: 'cs1', contributor_id: 'c1', trust: 50 }],
  });
  await runConsensusStage(NOW, { client });
  // still one row for c1 (updated, not duplicated).
  assert.equal(client.store.hsin_contributor_scores.filter((s) => s.contributor_id === 'c1').length, 1);
});

test('a contested investigation is flagged as a dispute', async () => {
  // Two roughly-equal opposing positions → low agreement.
  const client = fakeClient({
    hsin_investigations: [{ id: 'inv1', state: 'ACTIVE' }],
    hsin_findings: [
      { id: 'f1', investigation_id: 'inv1', contributor_id: 'c1', position: 'A', confidence: 0.7 },
      { id: 'f2', investigation_id: 'inv1', contributor_id: 'c2', position: 'B', confidence: 0.7 },
    ],
  });
  const r = await runConsensusStage(NOW, { client });
  assert.ok(r.disputes >= 1);
  assert.ok(r.pendingGovernance >= 1);
});

test('a strong consensus is not flagged as a dispute', async () => {
  const client = fakeClient({
    hsin_investigations: [{ id: 'inv1', state: 'ACTIVE' }],
    hsin_findings: [
      { id: 'f1', investigation_id: 'inv1', contributor_id: 'c1', position: 'A', confidence: 0.9 },
      { id: 'f2', investigation_id: 'inv1', contributor_id: 'c2', position: 'A', confidence: 0.85 },
      { id: 'f3', investigation_id: 'inv1', contributor_id: 'c3', position: 'A', confidence: 0.8 },
    ],
  });
  const r = await runConsensusStage(NOW, { client });
  assert.equal(r.disputes, 0);
});

test('only active-state investigations are processed', async () => {
  const client = fakeClient({
    hsin_investigations: [{ id: 'inv1', state: 'ARCHIVED' }, { id: 'inv2', state: 'ACTIVE' }],
    hsin_findings: [{ id: 'f1', investigation_id: 'inv2', contributor_id: 'c1', position: 'A', confidence: 0.8 }],
  });
  const r = await runConsensusStage(NOW, { client });
  assert.equal(r.investigations, 1);
});

test('worker never transitions an investigation (no auto-act)', async () => {
  const client = fakeClient({
    hsin_investigations: [{ id: 'inv1', state: 'ACTIVE' }],
    hsin_findings: [{ id: 'f1', investigation_id: 'inv1', contributor_id: 'c1', position: 'A', confidence: 0.8 }],
  });
  await runConsensusStage(NOW, { client });
  assert.equal(client.store.hsin_investigations[0].state, 'ACTIVE');
});

test('never throws on a broken client', async () => {
  const broken = { from() { throw new Error('db down'); } } as unknown as Parameters<typeof runConsensusStage>[1]['client'];
  const r = await runConsensusStage(NOW, { client: broken });
  assert.equal(r.mode, 'db');
  assert.equal(r.investigations, 0);
});
