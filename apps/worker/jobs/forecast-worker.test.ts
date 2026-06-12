import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runForecastStage } from './forecast-worker';

const NOW = '2026-06-09T12:00:00.000Z';

function fakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const store: Record<string, Array<Record<string, unknown>>> = {
    hsin_forecast_outcomes: [],
    hsin_forecast_accuracy: [],
    hsin_scenarios: [],
    hsin_forecasts: [],
    hsin_early_warning_alerts: [],
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
        async insert(values: unknown) {
          store[table] = store[table] ?? [];
          store[table].push({ id: `${table}-${store[table].length}`, ...(values as Record<string, unknown>) });
          return { data: null, error: null };
        },
        update(values: unknown) {
          return { async eq(col: string, val: unknown) { for (const row of store[table] ?? []) if (row[col] === val) Object.assign(row, values as Record<string, unknown>); return { error: null }; } };
        },
      };
    },
  };
}

test('offline mode runs fixtures deterministically', async () => {
  const a = await runForecastStage(NOW, { client: null });
  const b = await runForecastStage(NOW, { client: null });
  assert.equal(a.mode, 'offline');
  assert.ok(a.warnings > 0);
  assert.deepEqual(a, b);
});

test('db mode with nothing is a clean no-op', async () => {
  const r = await runForecastStage(NOW, { client: fakeClient({}) });
  assert.equal(r.mode, 'db');
  assert.equal(r.outcomes, 0);
  assert.equal(r.reliabilityComputed, false);
});

test('db mode computes reliability from outcomes', async () => {
  const client = fakeClient({
    hsin_forecast_outcomes: [
      { forecast_id: 'f1', confidence: 0.9, success: 1 },
      { forecast_id: 'f2', confidence: 0.3, success: 0 },
    ],
  });
  const r = await runForecastStage(NOW, { client });
  assert.equal(r.outcomes, 2);
  assert.equal(r.reliabilityComputed, true);
  assert.equal(client.store.hsin_forecast_accuracy.length, 1);
});

test('db mode refreshes scenario likelihoods', async () => {
  const client = fakeClient({
    hsin_scenarios: [{ id: 's1', state: 'ACTIVE', drivers: { items: [{ label: 'x', weight: 1, presence: 0.9 }] }, likelihood: 0.1 }],
  });
  const r = await runForecastStage(NOW, { client });
  assert.equal(r.scenariosUpdated, 1);
  assert.ok(Math.abs(Number(client.store.hsin_scenarios[0].likelihood) - 0.9) < 1e-9);
});

test('db mode raises a forecast-risk warning', async () => {
  const client = fakeClient({
    hsin_forecasts: [{ id: 'f1', status: 'active', confidence: 0.9, reliability: 0.4 }],
  });
  const r = await runForecastStage(NOW, { client });
  assert.ok(r.warnings >= 1);
  assert.equal(client.store.hsin_early_warning_alerts.length, 1);
  assert.equal(client.store.hsin_early_warning_alerts[0].kind, 'forecast_risk');
});

test('aligned forecast raises no warning', async () => {
  const client = fakeClient({
    hsin_forecasts: [{ id: 'f1', status: 'active', confidence: 0.7, reliability: 0.65 }],
  });
  const r = await runForecastStage(NOW, { client });
  assert.equal(r.warnings, 0);
});

test('only active-state scenarios are refreshed', async () => {
  const client = fakeClient({
    hsin_scenarios: [{ id: 's1', state: 'ARCHIVED', drivers: { items: [] }, likelihood: 0.5 }, { id: 's2', state: 'ACTIVE', drivers: { items: [{ label: 'x', weight: 1, presence: 0.8 }] }, likelihood: 0.1 }],
  });
  const r = await runForecastStage(NOW, { client });
  assert.equal(r.scenariosUpdated, 1);
});

test('worker never auto-publishes a forecast (no forecast inserts)', async () => {
  const client = fakeClient({ hsin_forecasts: [{ id: 'f1', status: 'active', confidence: 0.5, reliability: 0.5 }] });
  const before = client.store.hsin_forecasts.length;
  await runForecastStage(NOW, { client });
  assert.equal(client.store.hsin_forecasts.length, before);
});

test('never throws on a broken client', async () => {
  const broken = { from() { throw new Error('db down'); } } as unknown as Parameters<typeof runForecastStage>[1]['client'];
  const r = await runForecastStage(NOW, { client: broken });
  assert.equal(r.mode, 'db');
  assert.equal(r.outcomes, 0);
});
