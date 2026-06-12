import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runExecutiveStage, assembleUnifiedInputs, makeExecutiveWorkerJob } from './executive-worker';

const NOW = '2026-06-09T12:00:00.000Z';

function fakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const store: Record<string, Array<Record<string, unknown>>> = {
    hsin_investigations: [], hsin_consensus_snapshots: [], hsin_forecasts: [], hsin_early_warning_alerts: [],
    hsin_source_trust: [], hsin_research_opportunities: [], hsin_scenarios: [], hsin_recalibration_proposals: [],
    hsin_research_escalations: [], hsin_research_runs: [], hsin_trust_publications: [], hsin_outcome_measurements: [],
    hsin_executive_snapshots: [], hsin_executive_priorities: [], hsin_executive_briefs: [], hsin_executive_reports: [],
    ...seed,
  };
  function makeQuery(table: string) {
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    const q = {
      eq(c: string, v: unknown) { filters.push([c, v]); return q; },
      in(c: string, vs: unknown[]) { inFilters.push([c, vs]); return q; },
      order() { return q; },
      async limit() {
        const rows = (store[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v) && inFilters.every(([c, vs]) => vs.includes(r[c])));
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
        insert(values: unknown) {
          store[table] = store[table] ?? [];
          const row = { id: `${table}-${store[table].length}`, ...(values as Record<string, unknown>) };
          store[table].push(row);
          const promise = Promise.resolve({ data: null, error: null });
          return Object.assign(promise, {
            select() { return { async single() { return { data: { id: row.id }, error: null }; } }; },
          });
        },
      };
    },
  };
}

test('offline mode runs fixtures deterministically', async () => {
  const a = await runExecutiveStage(NOW, { client: null });
  const b = await runExecutiveStage(NOW, { client: null });
  assert.equal(a.mode, 'offline');
  assert.ok(a.priorities > 0);
  assert.ok(a.risks > 0);
  assert.ok(a.attentionIndex >= 0);
  assert.deepEqual(a, b);
});

test('offline mode persists nothing', async () => {
  const r = await runExecutiveStage(NOW, { client: null });
  assert.equal(r.snapshotPersisted, false);
  assert.equal(r.briefPersisted, false);
  assert.equal(r.reportPersisted, false);
});

test('db mode with an empty system is a clean, valid run', async () => {
  const client = fakeClient({});
  const r = await runExecutiveStage(NOW, { client });
  assert.equal(r.mode, 'db');
  assert.equal(r.snapshotPersisted, true);
  assert.equal(client.store.hsin_executive_snapshots.length, 1);
});

test('db mode ranks priorities from subsystem data', async () => {
  const client = fakeClient({
    hsin_early_warning_alerts: [{ id: 'w1', kind: 'trust_collapse', level: 'CRITICAL', title: 'Trust collapse', status: 'open' }],
    hsin_research_opportunities: [{ id: 'o1', title: 'Investigate gap', confidence: 0.8, priority: 'HIGH', status: 'proposed' }],
  });
  const r = await runExecutiveStage(NOW, { client });
  assert.ok(r.priorities > 0);
  assert.ok(r.risks > 0);
  assert.ok(r.opportunities > 0);
  assert.ok(client.store.hsin_executive_priorities.length > 0);
});

test('db mode persists daily brief + report', async () => {
  const client = fakeClient({
    hsin_forecasts: [{ id: 'f1', prediction: 'p', confidence: 0.8, reliability: 0.7, status: 'active' }],
  });
  const r = await runExecutiveStage(NOW, { client });
  assert.equal(r.briefPersisted, true);
  assert.equal(r.reportPersisted, true);
  // daily brief + governance brief = 2.
  assert.equal(client.store.hsin_executive_briefs.length, 2);
  assert.equal(client.store.hsin_executive_reports.length, 1);
});

test('critical warning raises attention', async () => {
  const client = fakeClient({
    hsin_early_warning_alerts: [{ id: 'w1', kind: 'trust_collapse', level: 'CRITICAL', title: 'Trust collapse', status: 'open' }],
  });
  const r = await runExecutiveStage(NOW, { client });
  assert.ok(r.attentionIndex > 0);
});

test('worker never writes a decision (no auto-governance)', async () => {
  const client = fakeClient({
    hsin_recalibration_proposals: [{ id: 'g1', entity_type: 'source', entity_id: 's', severity: 'HIGH', status: 'proposed' }],
  });
  await runExecutiveStage(NOW, { client });
  assert.equal((client.store.hsin_executive_decisions ?? []).length, 0);
  assert.equal((client.store.hsin_executive_reviews ?? []).length, 0);
});

test('assembleUnifiedInputs maps subsystem rows', async () => {
  const client = fakeClient({
    hsin_investigations: [{ id: 'i1', title: 'Inv', state: 'ACTIVE' }],
    hsin_consensus_snapshots: [{ investigation_id: 'i1', consensus_position: 'pos', agreement_score: 0.3, confidence: 0.5, contributor_count: 4, dissent_positions: ['d'] }],
    hsin_forecasts: [{ id: 'f1', prediction: 'p', confidence: 0.8, reliability: 0.6, status: 'active' }],
    hsin_source_trust: [{ source_id: 's1', trust_score: 25, band: 'low' }],
    hsin_research_escalations: [{ id: 'e1', reason: 'r', severity: 'HIGH', status: 'open' }],
  });
  const inputs = await assembleUnifiedInputs(client);
  assert.equal(inputs.investigations?.length, 1);
  assert.equal(inputs.consensus?.[0].disputed, true);
  assert.equal(inputs.forecasts?.length, 1);
  assert.equal(inputs.trust?.[0].score, 25);
  assert.equal(inputs.operations?.openEscalations, 1);
});

test('degraded health derives from open escalations', async () => {
  const client = fakeClient({
    hsin_research_escalations: [{ id: 'e1', reason: 'r', severity: 'HIGH', status: 'open' }],
  });
  const inputs = await assembleUnifiedInputs(client);
  assert.equal(inputs.operations?.overallHealth, 'DEGRADED');
});

test('never throws on a broken client', async () => {
  const broken = { from() { throw new Error('db down'); } } as unknown as Parameters<typeof runExecutiveStage>[1] extends { client?: infer C } ? C : never;
  const r = await runExecutiveStage(NOW, { client: broken });
  assert.equal(r.mode, 'db');
  assert.equal(r.priorities, 0);
});

test('the job is scheduled hourly and declares no auto-actions', () => {
  const job = makeExecutiveWorkerJob();
  assert.equal(job.name, 'executiveWorker');
  assert.equal(job.schedule, '0 * * * *');
  assert.match(job.description, /NEVER auto-publishes/);
});
