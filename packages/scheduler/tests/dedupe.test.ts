import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dedupeKey,
  InMemoryDedupeStore,
  isDuplicate,
} from '../src/dedupe';

const NOW1 = '2026-06-06T10:00:00.000Z';
const NOW2 = '2026-06-06T10:05:00.000Z';

test('dedupeKey: stable and incorporates url', () => {
  assert.equal(dedupeKey('s1', 'h1'), 's1::h1::-');
  assert.equal(dedupeKey('s1', 'h1', 'https://x'), 's1::h1::https://x');
  // stability
  assert.equal(dedupeKey('s1', 'h1', 'https://x'), dedupeKey('s1', 'h1', 'https://x'));
  // different url -> different key
  assert.notEqual(dedupeKey('s1', 'h1', 'https://x'), dedupeKey('s1', 'h1', 'https://y'));
});

test('isDuplicate: first not dup, second dup', async () => {
  const store = new InMemoryDedupeStore();
  const first = await isDuplicate(store, 's1', 'h1', undefined, NOW1, 'sig-1');
  assert.equal(first.duplicate, false);
  assert.equal(first.firstSeenAt, NOW1);

  const second = await isDuplicate(store, 's1', 'h1', undefined, NOW2);
  assert.equal(second.duplicate, true);
  assert.equal(second.firstSeenAt, NOW1);
  assert.equal(second.signalId, 'sig-1');

  assert.equal(store.size(), 1);
});

test('isDuplicate: distinct content -> separate, both first not dup', async () => {
  const store = new InMemoryDedupeStore();
  const a = await isDuplicate(store, 's1', 'hA', undefined, NOW1);
  const b = await isDuplicate(store, 's1', 'hB', undefined, NOW1);
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, false);
  assert.equal(store.size(), 2);
});

test('remember updates lastSeenAt', async () => {
  const store = new InMemoryDedupeStore();
  await store.remember('k', NOW1, 'sig');
  await store.remember('k', NOW2);
  const rec = await store.seen('k');
  assert.equal(rec?.firstSeenAt, NOW1);
  assert.equal(rec?.lastSeenAt, NOW2);
  assert.equal(rec?.signalId, 'sig');
});
