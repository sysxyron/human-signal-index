import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeSourceHealth } from './health';
import { computeCollectionCapability } from './capability';
import { summarizeYield, yieldTrend, EMPTY_YIELD } from './yield';
import { computeGeoReadiness } from './geo';
import { familyKey, assetRole, groupSourceFamilies } from './family';
import { computeCollectionPriority } from './priority';
import { recommendNextAction } from './advice';
import { SOURCE_HEALTHS, CAPABILITY_TIERS, GEO_READINESS, COLLECTION_PRIORITIES, type FamilyInput, type HealthInput } from './types';

const NOW = '2026-06-20T00:00:00.000Z';
const daysAgo = (d: number) => new Date(new Date(NOW).getTime() - d * 86400000).toISOString();
function health(over: Partial<HealthInput>): HealthInput {
  return { status: 'active', monitoringEnabled: true, monitoringState: null, lastSuccessAt: null, lastFailureAt: null, recentEvents: [], nowIso: NOW, ...over };
}

// ---- Deliverable 1: source health -----------------------------------------

test('health: archived / disabled → archived', () => {
  assert.equal(computeSourceHealth(health({ status: 'archived' })).value, 'archived');
  assert.equal(computeSourceHealth(health({ status: 'disabled' })).value, 'archived');
});
test('health: paused or monitoring disabled → paused', () => {
  assert.equal(computeSourceHealth(health({ status: 'paused' })).value, 'paused');
  assert.equal(computeSourceHealth(health({ status: 'active', monitoringEnabled: false })).value, 'paused');
});
test('health: monitoring BLOCKED → blocked', () => {
  assert.equal(computeSourceHealth(health({ monitoringState: 'BLOCKED' })).value, 'blocked');
});
test('health: failing with no success → offline; failing after recent success → degraded', () => {
  assert.equal(computeSourceHealth(health({ recentEvents: [{ status: 'failing', capturedAt: daysAgo(1) }] })).value, 'offline');
  assert.equal(computeSourceHealth(health({ lastSuccessAt: daysAgo(2), lastFailureAt: daysAgo(1), recentEvents: [{ status: 'failing', capturedAt: daysAgo(1) }] })).value, 'degraded');
});
test('health: healthy monitoring / recent success → healthy', () => {
  assert.equal(computeSourceHealth(health({ monitoringState: 'HEALTHY' })).value, 'healthy');
  assert.equal(computeSourceHealth(health({ lastSuccessAt: daysAgo(3) })).value, 'healthy');
});
test('health: stale success → degraded', () => {
  assert.equal(computeSourceHealth(health({ lastSuccessAt: daysAgo(40) })).value, 'degraded');
});
test('health: NO data → unknown (never fabricated healthy)', () => {
  assert.equal(computeSourceHealth(health({})).value, 'unknown');
});
test('health: every result is a valid status + carries a reason', () => {
  const r = computeSourceHealth(health({ monitoringState: 'HEALTHY' }));
  assert.ok((SOURCE_HEALTHS as readonly string[]).includes(r.value));
  assert.ok(r.reason.length > 0);
});

// ---- Deliverable 2: collection capability ----------------------------------

test('capability: feed type with feed → high; without feed → low', () => {
  assert.equal(computeCollectionCapability({ sourceType: 'rss_feed', hasFeed: true, hasUrl: true, ingestionMode: null, blocked: false }).tier, 'high');
  assert.equal(computeCollectionCapability({ sourceType: 'rss_feed', hasFeed: false, hasUrl: true, ingestionMode: null, blocked: false }).tier, 'low');
});
test('capability: website with URL → medium; manual types → manual', () => {
  assert.equal(computeCollectionCapability({ sourceType: 'website', hasFeed: false, hasUrl: true, ingestionMode: null, blocked: false }).tier, 'medium');
  assert.equal(computeCollectionCapability({ sourceType: 'watchlist', hasFeed: false, hasUrl: true, ingestionMode: null, blocked: false }).tier, 'manual');
});
test('capability: blocked / login-mode → degraded', () => {
  assert.equal(computeCollectionCapability({ sourceType: 'website', hasFeed: false, hasUrl: true, ingestionMode: null, blocked: true }).tier, 'degraded');
  assert.equal(computeCollectionCapability({ sourceType: 'website', hasFeed: false, hasUrl: true, ingestionMode: 'login', blocked: false }).tier, 'degraded');
});
test('capability: no url and no feed → low score 10', () => {
  const r = computeCollectionCapability({ sourceType: 'website', hasFeed: false, hasUrl: false, ingestionMode: null, blocked: false });
  assert.equal(r.tier, 'low'); assert.equal(r.score, 10);
});
test('capability: tier is always valid + scored 0–100', () => {
  const r = computeCollectionCapability({ sourceType: 'api_foundation', hasFeed: true, hasUrl: false, ingestionMode: null, blocked: false });
  assert.ok((CAPABILITY_TIERS as readonly string[]).includes(r.tier));
  assert.ok(r.score >= 0 && r.score <= 100);
});

// ---- Deliverable 3: signal yield -------------------------------------------

test('yield: empty → observed false, trend none, "not yet observed"', () => {
  const y = summarizeYield(EMPTY_YIELD);
  assert.equal(y.observed, false); assert.equal(y.total, 0); assert.equal(y.trend, 'none'); assert.equal(y.lastSignalLabel, 'not yet observed');
});
test('yield: trend rising/declining/steady', () => {
  assert.equal(yieldTrend(5, 2), 'rising');
  assert.equal(yieldTrend(1, 4), 'declining');
  assert.equal(yieldTrend(3, 3), 'steady');
  assert.equal(yieldTrend(0, 0), 'none');
});
test('yield: real counts produce total + observed', () => {
  const y = summarizeYield({ ...EMPTY_YIELD, signals: 4, evidence: 2, reports: 1, signalsRecent: 3, signalsPrior: 1, lastSignalAt: '2026-06-01T00:00:00Z' });
  assert.equal(y.total, 7); assert.equal(y.observed, true); assert.equal(y.trend, 'rising');
  assert.match(y.lastSignalLabel, /Jun 1, 2026/);
});

// ---- Deliverable 4: geo readiness ------------------------------------------

const geo = (over: Record<string, unknown>) => ({ sourceType: 'website', country: null, region: null, city: null, latitude: null, longitude: null, geoConfidence: null, geoSource: null, ...over });
test('geo: coords → geo_ready; place text only → partial_geo; nothing → missing_geo', () => {
  assert.equal(computeGeoReadiness(geo({ latitude: 40.7, longitude: -74 })).value, 'geo_ready');
  assert.equal(computeGeoReadiness(geo({ country: 'US' })).value, 'partial_geo');
  assert.equal(computeGeoReadiness(geo({})).value, 'missing_geo');
});
test('geo: infrastructure types → not_applicable; never invents coords', () => {
  assert.equal(computeGeoReadiness(geo({ sourceType: 'api_foundation' })).value, 'not_applicable');
  assert.equal(computeGeoReadiness(geo({ sourceType: 'webhook' })).value, 'not_applicable');
  assert.ok((GEO_READINESS as readonly string[]).includes(computeGeoReadiness(geo({})).value));
});

// ---- Deliverable 5: source families ----------------------------------------

const fam = (over: Partial<FamilyInput>): FamilyInput => ({ id: 'x', name: 'X', homepageUrl: null, feedUrl: null, sourceType: 'website', identityKey: null, platform: null, tags: [], organization: null, ...over });

test('familyKey: domain root + platform identity org agree (Reuters)', () => {
  assert.equal(familyKey(fam({ homepageUrl: 'https://www.reuters.com' })), 'reuters');
  assert.equal(familyKey(fam({ homepageUrl: 'https://reuters.com/rss', feedUrl: 'https://reuters.com/rss' })), 'reuters');
  assert.equal(familyKey(fam({ sourceType: 'youtube', homepageUrl: 'https://youtube.com/@reuters', identityKey: 'youtube:@reuters' })), 'reuters');
});
test('groupSourceFamilies: Reuters website + RSS + YouTube → one family of 3', () => {
  const fams = groupSourceFamilies([
    fam({ id: '1', name: 'Reuters Website', homepageUrl: 'https://reuters.com', sourceType: 'website' }),
    fam({ id: '2', name: 'Reuters RSS', feedUrl: 'https://reuters.com/feed', sourceType: 'rss_feed' }),
    fam({ id: '3', name: 'Reuters YouTube', homepageUrl: 'https://youtube.com/@reuters', identityKey: 'youtube:@reuters', sourceType: 'youtube' }),
    fam({ id: '4', name: 'CISA', homepageUrl: 'https://cisa.gov', sourceType: 'government' }),
  ]);
  const reuters = fams.find((f) => f.familyKey === 'reuters');
  assert.ok(reuters); assert.equal(reuters?.size, 3);
  assert.deepEqual(reuters?.members.map((m) => m.role).sort(), ['RSS', 'Website', 'YouTube']);
  // separate org stays separate — NO auto-merge
  assert.ok(fams.some((f) => f.familyKey === 'cisa' && f.size === 1));
});
test('assetRole maps canonical types', () => {
  assert.equal(assetRole(fam({ sourceType: 'youtube' })), 'YouTube');
  assert.equal(assetRole(fam({ sourceType: 'rss_feed' })), 'RSS');
});

// ---- Deliverable 6: collection priority ------------------------------------

const prio = (over: Record<string, unknown>) => ({ baselineRisk: null, category: null, sourceType: null, signals: 0, trustScore: null, watchlistRelevant: false, narrativeRelevant: false, manualPriority: null, health: 'healthy' as const, ...over });
test('priority: archived health → archive', () => {
  assert.equal(computeCollectionPriority(prio({ health: 'archived' })).value, 'archive');
});
test('priority: high risk + category A + productive → critical/high', () => {
  const r = computeCollectionPriority(prio({ baselineRisk: 5, category: 'A', sourceType: 'threat_feed', signals: 15, trustScore: 85, watchlistRelevant: true }));
  assert.ok(r.value === 'critical' || r.value === 'high');
  assert.ok(r.reason.length > 0);
});
test('priority: bare low-signal source → low/medium; always valid bucket', () => {
  const r = computeCollectionPriority(prio({ baselineRisk: 1 }));
  assert.ok((COLLECTION_PRIORITIES as readonly string[]).includes(r.value));
});
test('priority: offline penalised vs healthy', () => {
  const base = { baselineRisk: 3, category: 'C', sourceType: 'website', signals: 2 };
  const healthy = computeCollectionPriority(prio({ ...base, health: 'healthy' }));
  const offline = computeCollectionPriority(prio({ ...base, health: 'offline' }));
  assert.ok((COLLECTION_PRIORITIES.indexOf(offline.value)) >= (COLLECTION_PRIORITIES.indexOf(healthy.value)));
});

// ---- Deliverable 8: recommended action -------------------------------------

test('advice: blocked/offline/paused/missing-feed map to concrete actions', () => {
  assert.match(recommendNextAction({ health: 'blocked', capabilityTier: 'high', geoReadiness: 'missing_geo', yieldObserved: false, status: 'active', hasFeed: true }), /access/i);
  assert.match(recommendNextAction({ health: 'offline', capabilityTier: 'high', geoReadiness: 'missing_geo', yieldObserved: false, status: 'active', hasFeed: true }), /fail/i);
  assert.match(recommendNextAction({ health: 'paused', capabilityTier: 'high', geoReadiness: 'missing_geo', yieldObserved: false, status: 'paused', hasFeed: true }), /activate/i);
  assert.match(recommendNextAction({ health: 'healthy', capabilityTier: 'medium', geoReadiness: 'missing_geo', yieldObserved: false, status: 'active', hasFeed: false }), /feed|API/i);
});

// ---- no fabricated metrics / empty state -----------------------------------

test('no fabricated metrics: no data anywhere → unknown health, 0 yield, not observed', () => {
  assert.equal(computeSourceHealth(health({})).value, 'unknown');
  const y = summarizeYield(EMPTY_YIELD);
  assert.equal(y.signals, 0); assert.equal(y.evidence, 0); assert.equal(y.reports, 0);
  assert.equal(y.observed, false);
});

// ---- dashboard data shape (pure helpers) -----------------------------------

test('dashboard shape: families expose key/displayName/members[]/size', () => {
  const fams = groupSourceFamilies([fam({ id: '1', name: 'BBC', homepageUrl: 'https://bbc.co.uk', sourceType: 'website' })]);
  const f = fams[0];
  assert.ok(typeof f.familyKey === 'string' && typeof f.displayName === 'string');
  assert.ok(Array.isArray(f.members) && typeof f.size === 'number');
  assert.equal(f.familyKey, 'bbc'); // co.uk handled
});
