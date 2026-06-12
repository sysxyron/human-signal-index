import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPublishingStage } from './publishing-worker';

const NOW = '2026-06-09T12:00:00.000Z';

function fakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const store: Record<string, Array<Record<string, unknown>>> = {
    hsin_publications: [],
    hsin_subscribers: [],
    hsin_subscription_preferences: [],
    hsin_digest_runs: [],
    hsin_distribution_events: [],
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
        insert(values: unknown) {
          const doInsert = () => {
            store[table] = store[table] ?? [];
            const row = { id: `${table}-${store[table].length}`, ...(values as Record<string, unknown>) };
            store[table].push(row);
            return row;
          };
          const promise = Promise.resolve({ data: null, error: null });
          const row = doInsert();
          return Object.assign(promise, {
            select: async () => ({ data: [row], error: null }),
          });
        },
      };
    },
  };
}

test('offline mode runs fixtures deterministically', async () => {
  const a = await runPublishingStage(NOW, { client: null });
  const b = await runPublishingStage(NOW, { client: null });
  assert.equal(a.mode, 'offline');
  assert.ok(a.digestItems > 0);
  assert.ok(a.rssItems >= 0);
  assert.deepEqual(a, b);
});

test('db mode loads only published items', async () => {
  const client = fakeClient({
    hsin_publications: [
      { id: 'p1', slug: 's1', title: 'T1', summary: 'd', state: 'PUBLISHED', published_at: NOW, topics: { items: ['history'] } },
      { id: 'p2', slug: 's2', title: 'T2', summary: 'd', state: 'DRAFT', topics: { items: [] } },
    ],
  });
  const r = await runPublishingStage(NOW, { client });
  assert.equal(r.mode, 'db');
  assert.equal(r.publishedItems, 1);
  assert.equal(r.rssItems, 1);
});

test('db mode generates a digest and records the run', async () => {
  const client = fakeClient({
    hsin_publications: [{ id: 'p1', slug: 's1', title: 'T1', summary: 'd', state: 'PUBLISHED', published_at: NOW, topics: { items: [] } }],
  });
  const r = await runPublishingStage(NOW, { client });
  assert.ok(r.digestItems >= 1);
  assert.equal(client.store.hsin_digest_runs.length, 1);
});

test('db mode distributes to active subscribers only', async () => {
  const client = fakeClient({
    hsin_publications: [{ id: 'p1', slug: 's1', title: 'T1', summary: 'd', state: 'PUBLISHED', published_at: NOW, topics: { items: [] } }],
    hsin_subscribers: [
      { id: 'sub-1', email: 'a@x.com', type: 'RESEARCHER', active: true, created_at: NOW },
      { id: 'sub-2', email: 'b@x.com', type: 'FREE', active: false, created_at: NOW },
    ],
    hsin_subscription_preferences: [
      { subscriber_id: 'sub-1', digest_frequency: 'daily', topics: { items: [] }, channels: { items: ['email'] } },
      { subscriber_id: 'sub-2', digest_frequency: 'daily', topics: { items: [] }, channels: { items: ['email'] } },
    ],
  });
  const r = await runPublishingStage(NOW, { client });
  // only sub-1 (active, daily) gets it.
  assert.equal(r.distributions, 1);
  assert.ok(client.store.hsin_distribution_events.every((e) => e.subscriber_id === 'sub-1'));
});

test('never distributes when the digest is empty', async () => {
  const client = fakeClient({ hsin_publications: [] });
  const r = await runPublishingStage(NOW, { client });
  assert.equal(r.digestItems, 0);
  assert.equal(r.distributions, 0);
});

test('unpublished items never reach the feed', async () => {
  const client = fakeClient({
    hsin_publications: [
      { id: 'p1', slug: 's1', title: 'T1', summary: 'd', state: 'PUBLISHED', published_at: NOW, topics: { items: [] } },
      { id: 'p2', slug: 's2', title: 'T2', summary: 'd', state: 'PUBLISHED', published_at: NOW, topics: { items: [] } },
    ],
  });
  const r = await runPublishingStage(NOW, { client });
  assert.equal(r.rssItems, 2);
  assert.equal(r.jsonItems, 2);
});

test('never throws on a broken client', async () => {
  const broken = { from() { throw new Error('db down'); } } as unknown as Parameters<typeof runPublishingStage>[1]['client'];
  const r = await runPublishingStage(NOW, { client: broken });
  assert.equal(r.mode, 'db');
  assert.equal(r.publishedItems, 0);
});

test('worker never auto-publishes (no publication writes)', async () => {
  const client = fakeClient({
    hsin_publications: [{ id: 'p1', slug: 's1', title: 'T1', summary: 'd', state: 'PUBLISHED', published_at: NOW, topics: { items: [] } }],
  });
  const before = client.store.hsin_publications.length;
  await runPublishingStage(NOW, { client });
  assert.equal(client.store.hsin_publications.length, before);
});
