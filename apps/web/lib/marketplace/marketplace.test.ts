import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCT_TYPES, ASSET_TYPES, PRODUCT_TYPE_LABEL, isProductType, isProductStatus, isAssetType, slugify, avgRating,
  type ProductType,
} from './types';
import { countAssets } from './persistence';
import type { ProductAsset } from './types';

test('8 product types, 9 asset types, all labeled', () => {
  assert.equal(PRODUCT_TYPES.length, 8);
  assert.equal(ASSET_TYPES.length, 9);
  for (const t of PRODUCT_TYPES) assert.ok(PRODUCT_TYPE_LABEL[t as ProductType]);
  for (const t of ['RESEARCH_REPORT', 'FORECAST_PACKAGE', 'WATCHLIST', 'SOURCE_COLLECTION', 'NARRATIVE_PACKAGE', 'EVIDENCE_COLLECTION', 'MONITORING_FEED', 'EXECUTIVE_BRIEF'] as const) {
    assert.ok(isProductType(t));
  }
});

test('type/status/asset guards', () => {
  assert.ok(isProductType('WATCHLIST'));
  assert.ok(!isProductType('NOPE'));
  assert.ok(isProductStatus('published'));
  assert.ok(!isProductStatus('live'));
  assert.ok(isAssetType('FORECAST'));
  assert.ok(!isAssetType('THING'));
});

test('slugify', () => {
  assert.equal(slugify('Q3 Election Forecast!'), 'q3-election-forecast');
  assert.equal(slugify('   '), 'product');
});

test('avgRating', () => {
  assert.equal(avgRating([5, 4, 3]), 4);
  assert.equal(avgRating([]), 0);
  assert.equal(avgRating([5, 4]), 4.5);
});

test('countAssets maps provenance families', () => {
  const assets: ProductAsset[] = [
    { assetType: 'SOURCE', assetId: '1', label: null },
    { assetType: 'EVIDENCE', assetId: '2', label: null },
    { assetType: 'GRAPH_NODE', assetId: '3', label: null },
    { assetType: 'NARRATIVE', assetId: '4', label: null },
    { assetType: 'FORECAST', assetId: '5', label: null },
    { assetType: 'PUBLICATION', assetId: '6', label: null },
    { assetType: 'CORRECTION', assetId: '7', label: null },
  ];
  const c = countAssets(assets);
  assert.equal(c.source, 1);
  assert.equal(c.evidence, 2); // EVIDENCE + GRAPH_NODE
  assert.equal(c.narrative, 1);
  assert.equal(c.forecast, 1);
  assert.equal(c.publication, 1);
  assert.equal(c.correction, 1);
});
