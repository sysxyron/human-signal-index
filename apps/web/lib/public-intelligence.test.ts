import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketOf,
  riskForBucket,
  toneForBucket,
  colorForBucket,
  normalizeCategoryActivity,
  distributeNodes,
  riskTier,
  colorForRiskTier,
  CATEGORY_BUCKETS,
  RISK_TIERS,
} from './public-intelligence-mapping';
import { rateLimit, __resetRateLimit, clientKeyFromHeaders } from './rate-limit';

// ---- category mapping -------------------------------------------------------

test('bucketOf maps internal categories to the six public buckets', () => {
  assert.equal(bucketOf('recruitment'), 'Recruitment');
  assert.equal(bucketOf('misinformation'), 'Misinformation');
  assert.equal(bucketOf('disinformation'), 'Misinformation');
  assert.equal(bucketOf('propaganda'), 'Propaganda');
  assert.equal(bucketOf('extremism'), 'Extremism');
  assert.equal(bucketOf('radicalization'), 'Extremism');
  assert.equal(bucketOf('ideology'), 'Influence');
  assert.equal(bucketOf('coordination'), 'Influence');
  assert.equal(bucketOf('technology'), 'Other');
  assert.equal(bucketOf(''), 'Other');
  assert.equal(bucketOf(null), 'Other');
  assert.equal(bucketOf(undefined), 'Other');
});

test('riskForBucket is severity-ordered 1..5', () => {
  assert.equal(riskForBucket('Extremism'), 5);
  assert.equal(riskForBucket('Recruitment'), 4);
  assert.equal(riskForBucket('Propaganda'), 4);
  assert.equal(riskForBucket('Misinformation'), 3);
  assert.equal(riskForBucket('Influence'), 3);
  assert.equal(riskForBucket('Other'), 2);
});

test('toneForBucket + colorForBucket return values for every bucket', () => {
  for (const b of CATEGORY_BUCKETS) {
    assert.ok(typeof toneForBucket(b) === 'string');
    assert.match(colorForBucket(b), /^#[0-9A-Fa-f]{6}$/);
  }
});

test('normalizeCategoryActivity tallies into all six buckets in fixed order', () => {
  const out = normalizeCategoryActivity(['recruitment', 'recruitment', 'propaganda', 'weird-custom']);
  assert.equal(out.length, 6);
  assert.deepEqual(out.map((o) => o.category), [...CATEGORY_BUCKETS]);
  const byName = Object.fromEntries(out.map((o) => [o.category, o.count]));
  assert.equal(byName.Recruitment, 2);
  assert.equal(byName.Propaganda, 1);
  assert.equal(byName.Other, 1);
  assert.equal(byName.Influence, 0);
});

test('normalizeCategoryActivity returns [] for empty input', () => {
  assert.deepEqual(normalizeCategoryActivity([]), []);
});

test('distributeNodes returns exactly n buckets, weighted by frequency', () => {
  const activity = normalizeCategoryActivity([
    ...Array(8).fill('extremism'),
    ...Array(2).fill('propaganda'),
  ]);
  const nodes = distributeNodes(14, activity);
  assert.equal(nodes.length, 14);
  const ext = nodes.filter((b) => b === 'Extremism').length;
  const prop = nodes.filter((b) => b === 'Propaganda').length;
  assert.ok(ext > prop, 'more frequent category gets more nodes');
  assert.ok(nodes.every((b) => b === 'Extremism' || b === 'Propaganda'));
});

test('distributeNodes falls back to an even spread with no activity', () => {
  const nodes = distributeNodes(12, []);
  assert.equal(nodes.length, 12);
  // even spread touches multiple buckets
  assert.ok(new Set(nodes).size >= 2);
});

test('riskTier maps 1–5 levels to the four public tiers', () => {
  assert.equal(riskTier(5), 'Critical');
  assert.equal(riskTier(4), 'High');
  assert.equal(riskTier(3), 'Moderate');
  assert.equal(riskTier(2), 'Low');
  assert.equal(riskTier(1), 'Low');
});

test('colorForRiskTier returns a hex for every tier', () => {
  for (const t of RISK_TIERS) assert.match(colorForRiskTier(t), /^#[0-9A-Fa-f]{6}$/);
});

// ---- rate limiter -----------------------------------------------------------

test('rateLimit allows up to the limit then blocks within the window', () => {
  __resetRateLimit();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const r = rateLimit('k', { limit: 3, windowMs: 1000, now });
    assert.equal(r.allowed, true);
  }
  const blocked = rateLimit('k', { limit: 3, windowMs: 1000, now });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
});

test('rateLimit resets after the window elapses', () => {
  __resetRateLimit();
  const r1 = rateLimit('k', { limit: 1, windowMs: 1000, now: 0 });
  assert.equal(r1.allowed, true);
  const r2 = rateLimit('k', { limit: 1, windowMs: 1000, now: 500 });
  assert.equal(r2.allowed, false);
  const r3 = rateLimit('k', { limit: 1, windowMs: 1000, now: 1500 });
  assert.equal(r3.allowed, true);
});

test('rateLimit isolates distinct keys', () => {
  __resetRateLimit();
  assert.equal(rateLimit('a', { limit: 1, now: 0 }).allowed, true);
  assert.equal(rateLimit('b', { limit: 1, now: 0 }).allowed, true);
  assert.equal(rateLimit('a', { limit: 1, now: 0 }).allowed, false);
});

test('clientKeyFromHeaders prefers x-forwarded-for first hop', () => {
  const h = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
  assert.equal(clientKeyFromHeaders(h), '203.0.113.9');
  assert.equal(clientKeyFromHeaders(new Headers({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2');
  assert.equal(clientKeyFromHeaders(new Headers()), 'anonymous');
});
