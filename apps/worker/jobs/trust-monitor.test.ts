import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runTrustMonitoringStage } from './trust-monitor';

const NOW = '2026-06-09T12:00:00.000Z';

// -----------------------------------------------------------------------------
// A tiny in-memory fake of the minimal Supabase surface the stage uses. Trust
// tables are seeded; hsin_trust_history accumulates inserts and is queryable so
// the second pass (drift) sees the freshly-recorded snapshots.
// -----------------------------------------------------------------------------
function fakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const store: Record<string, Array<Record<string, unknown>>> = {
    hsin_source_trust: [],
    hsin_narrative_trust: [],
    hsin_forecast_trust: [],
    hsin_decision_trust: [],
    hsin_trust_history: [],
    hsin_trust_drift: [],
    hsin_recalibration_proposals: [],
    hsin_decision_alerts: [],
    ...seed,
  };

  function makeQuery(table: string) {
    const filters: Array<[string, unknown]> = [];
    const q = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return q;
      },
      order() {
        return q;
      },
      async limit() {
        const rows = (store[table] ?? []).filter((r) =>
          filters.every(([c, v]) => r[c] === v),
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
        select() {
          return makeQuery(table);
        },
        async insert(values: unknown) {
          store[table] = store[table] ?? [];
          const row = { id: `${table}-${store[table].length}`, ...(values as Record<string, unknown>) };
          store[table].push(row);
          return { data: [row], error: null };
        },
      };
    },
  };
}

test('offline mode (no client) runs fixtures deterministically', async () => {
  const r = await runTrustMonitoringStage(NOW, { client: null });
  assert.equal(r.mode, 'offline');
  assert.ok(r.snapshotsRecorded > 0);
  assert.ok(r.driftDetected > 0);
  assert.ok(r.proposals > 0);
  assert.ok(r.alerts > 0);
});

test('offline mode is deterministic', async () => {
  const a = await runTrustMonitoringStage(NOW, { client: null });
  const b = await runTrustMonitoringStage(NOW, { client: null });
  assert.deepEqual(a, b);
});

test('db mode records a snapshot per trust row', async () => {
  const client = fakeClient({
    hsin_source_trust: [
      { source_id: 's1', trust_score: 80, confidence: 0.7, calibration_score: 0.75, evidence_count: 20 },
      { source_id: 's2', trust_score: 55, confidence: 0.5, calibration_score: 0.5, evidence_count: 10 },
    ],
  });
  const r = await runTrustMonitoringStage(NOW, { client });
  assert.equal(r.mode, 'db');
  assert.equal(r.snapshotsRecorded, 2);
  assert.equal(client.store.hsin_trust_history.length, 2);
});

test('db mode with a single snapshot detects no drift', async () => {
  const client = fakeClient({
    hsin_source_trust: [
      { source_id: 's1', trust_score: 80, confidence: 0.7, calibration_score: 0.75, evidence_count: 20 },
    ],
  });
  const r = await runTrustMonitoringStage(NOW, { client });
  // Only one snapshot exists after this run → no drift.
  assert.equal(r.driftDetected, 0);
  assert.equal(r.proposals, 0);
});

test('db mode detects collapse from prior history + raises alert + proposal', async () => {
  // Seed 4 prior high snapshots; the current trust row is a collapse.
  const priorHistory = [78, 80, 79, 81].map((score, i) => ({
    id: `h${i}`,
    entity_type: 'source',
    entity_id: 's1',
    trust_score: score,
    confidence: 0.6,
    calibration_score: 0.7,
    evidence_count: 20,
    snapshot_at: `2026-03-0${i + 1}T12:00:00.000Z`,
  }));
  const client = fakeClient({
    hsin_source_trust: [
      { source_id: 's1', trust_score: 30, confidence: 0.6, calibration_score: 0.7, evidence_count: 20 },
    ],
    hsin_trust_history: priorHistory,
  });
  const r = await runTrustMonitoringStage(NOW, { client });
  assert.equal(r.driftDetected, 1);
  assert.equal(r.driftPersisted, 1);
  assert.ok(r.alerts >= 1);
  assert.ok(r.alertsByType.trust_collapse >= 1);
  assert.equal(client.store.hsin_recalibration_proposals.length, 1);
  // The proposal is pending — never auto-applied.
  assert.equal(client.store.hsin_recalibration_proposals[0].status, 'pending');
});

test('collapse raises a recalibration_required alert alongside the collapse alert', async () => {
  const priorHistory = [78, 80, 79, 81].map((score, i) => ({
    id: `h${i}`,
    entity_type: 'decision',
    entity_id: 'd1',
    trust_score: score,
    confidence: 0.6,
    calibration_score: 0.7,
    evidence_count: 20,
    snapshot_at: `2026-03-0${i + 1}T12:00:00.000Z`,
  }));
  const client = fakeClient({
    hsin_decision_trust: [
      { decision_run_id: 'd1', trust_score: 30, confidence: 0.6, calibration_score: 0.7, evidence_count: 20 },
    ],
    hsin_trust_history: priorHistory,
  });
  const r = await runTrustMonitoringStage(NOW, { client });
  assert.ok(r.alertsByType.recalibration_required >= 1);
});

test('stable history raises no drift, no proposal, no alert', async () => {
  const priorHistory = [60, 61, 60, 61].map((score, i) => ({
    id: `h${i}`,
    entity_type: 'narrative',
    entity_id: 'n1',
    trust_score: score,
    confidence: 0.6,
    calibration_score: 0.6,
    evidence_count: 20,
    snapshot_at: `2026-03-0${i + 1}T12:00:00.000Z`,
  }));
  const client = fakeClient({
    hsin_narrative_trust: [
      { narrative_id: 'n1', trust_score: 61, confidence: 0.6, calibration_score: 0.6, evidence_count: 20 },
    ],
    hsin_trust_history: priorHistory,
  });
  const r = await runTrustMonitoringStage(NOW, { client });
  assert.equal(r.driftDetected, 0);
  assert.equal(r.proposals, 0);
  assert.equal(r.alerts, 0);
});

test('never throws on a broken client', async () => {
  const broken = {
    from() {
      throw new Error('db down');
    },
  } as unknown as Parameters<typeof runTrustMonitoringStage>[1]['client'];
  const r = await runTrustMonitoringStage(NOW, { client: broken });
  // Snapshot step is fault-isolated → zero recorded, but the stage returns cleanly.
  assert.equal(r.mode, 'db');
  assert.equal(r.snapshotsRecorded, 0);
});
