import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveTargetConnector } from './captureSignalsJob';

test('explicit connector wins', () => {
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', connector: 'rss' }), 'rss');
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', connector: 'public_page', sourceType: 'reddit' }), 'public_page');
});

test('routes by source type when no explicit connector (Phase 40)', () => {
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', sourceType: 'news' }), 'rss');
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', sourceType: 'reddit' }), 'rss');
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', sourceType: 'watchlist' }), 'public_page');
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', sourceType: 'website' }), 'public_page');
});

test('foundation / unknown types resolve to null (skipped, not crashed)', () => {
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', sourceType: 'api' }), null);
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', sourceType: 'manual' }), null);
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u', sourceType: 'bogus' }), null);
  assert.equal(resolveTargetConnector({ sourceId: 's', url: 'u' }), null);
});
