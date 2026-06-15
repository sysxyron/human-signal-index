import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contributorNetworkWorkerJob, makeContributorNetworkJob } from './contributor-network-worker';

const ctx = { config: {} as never, runAt: '2026-06-14T12:00:00.000Z' };

test('job has a name + cron schedule and never writes RBAC roles (description contract)', () => {
  assert.equal(contributorNetworkWorkerJob.name, 'contributorNetworkWorker');
  assert.match(contributorNetworkWorkerJob.schedule ?? '', /\*/);
  assert.match(contributorNetworkWorkerJob.description, /never promotes roles/i);
});

test('runs offline deterministically without throwing', async () => {
  const a = await makeContributorNetworkJob().run(ctx);
  const b = await makeContributorNetworkJob().run(ctx);
  assert.equal(a.ok, true);
  assert.equal(a.job, 'contributorNetworkWorker');
  assert.equal((a.summary as { mode: string }).mode, 'offline'); // no service-role env in test
  assert.deepEqual(a.summary, b.summary); // deterministic given the same runAt
});

test('offline summary reports leaderboards across views × periods', async () => {
  const r = await makeContributorNetworkJob().run(ctx);
  const s = r.summary as { leaderboardsWritten: number; statsUpserted: number };
  assert.ok(s.leaderboardsWritten >= 5); // at least one view × period batch
  assert.ok(s.statsUpserted > 0);
});

test('offline summary computes trust profiles (Phase 27)', async () => {
  const r = await makeContributorNetworkJob().run(ctx);
  const s = r.summary as { trustProfilesUpserted: number };
  assert.ok(s.trustProfilesUpserted > 0);
});

test('summary carries Phase-29 outcome-attribution counters', async () => {
  const r = await makeContributorNetworkJob().run(ctx);
  const s = r.summary as Record<string, number>;
  // offline → no DB writes, but the fields must exist (0) and the run must not throw.
  assert.equal(typeof s.outcomeEventsWritten, 'number');
  assert.equal(typeof s.attributionEdgesWritten, 'number');
  assert.equal(typeof s.entityImpactUpserted, 'number');
});

test('summary carries Phase-30 lineage counters', async () => {
  const r = await makeContributorNetworkJob().run(ctx);
  const s = r.summary as Record<string, number>;
  assert.equal(typeof s.lineageLinksBackfilled, 'number');
  assert.equal(typeof s.graphHealthScore, 'number');
});
