import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  typeBucketOf, classifyFailure, detectProtection, computeHealthScore, scoreTier, backoffStage,
} from './source-reliability-classify';

// ---- type buckets ----------------------------------------------------------

test('typeBucketOf maps raw source types to reporting buckets', () => {
  assert.equal(typeBucketOf('rss_feed'), 'RSS');
  assert.equal(typeBucketOf('YouTube Channel'), 'YouTube');
  assert.equal(typeBucketOf('reddit'), 'Reddit');
  assert.equal(typeBucketOf('government_portal'), 'Government');
  assert.equal(typeBucketOf('arxiv'), 'Research');
  assert.equal(typeBucketOf('rest_api'), 'API');
  assert.equal(typeBucketOf('podcast'), 'Podcast');
  assert.equal(typeBucketOf('discussion_forum'), 'Forum');
  assert.equal(typeBucketOf('twitter'), 'Social');
  assert.equal(typeBucketOf('news_website'), 'Website');
  assert.equal(typeBucketOf(null), 'Other');
  assert.equal(typeBucketOf('something-weird'), 'Other');
});

// ---- failure classification -------------------------------------------------

test('classifyFailure recognises healthy + each failure family from free text', () => {
  assert.equal(classifyFailure('healthy', null, null).type, 'Healthy');
  assert.equal(classifyFailure('failing', 'HTTP 429 Too Many Requests', null).type, 'Rate Limited');
  assert.equal(classifyFailure('failing', null, 'Just a moment... cloudflare challenge').type, 'Cloudflare Protected');
  assert.equal(classifyFailure('failing', 'reCAPTCHA required', null).type, 'Cloudflare Protected');
  assert.equal(classifyFailure('failing', 'login required to view', null).type, 'Login Required');
  assert.equal(classifyFailure('failing', 'HTTP 403 Forbidden', null).type, 'Access Denied');
  assert.equal(classifyFailure('failing', null, 'request timed out').type, 'Timeout');
  assert.equal(classifyFailure('failing', 'ECONNREFUSED', null).type, 'Offline');
  assert.equal(classifyFailure('failing', 'invalid xml in feed', null).type, 'Parse Error');
  assert.equal(classifyFailure('failing', 'weird unknown thing', null).type, 'Manual Review');
});

// ---- protection detection ---------------------------------------------------

test('detectProtection identifies named vendors or returns null', () => {
  assert.equal(detectProtection('Akamai bot manager', null), 'Akamai');
  assert.equal(detectProtection(null, 'incapsula / imperva'), 'Imperva');
  assert.equal(detectProtection('datadome', null), 'DataDome');
  assert.equal(detectProtection('cf-ray header present', null), 'Cloudflare');
  assert.equal(detectProtection('hcaptcha', null), 'CAPTCHA');
  assert.equal(detectProtection('robots.txt disallow', null), 'Robots block');
  assert.equal(detectProtection('login wall', null), 'Login wall');
  assert.equal(detectProtection('plain timeout', null), null);
});

// ---- explainable health score ----------------------------------------------

test('computeHealthScore: perfect history → Excellent and explained', () => {
  const r = computeHealthScore({ total: 20, healthy: 20, parseErrors: 0, consecutiveFailures: 0, lastSuccessAgeDays: 0 });
  assert.equal(r.score, 100);
  assert.equal(r.tier, 'Excellent');
  assert.equal(r.status, 'HEALTHY');
  assert.ok(r.explanation.includes('success 100%'));
  assert.equal(r.factors.length, 4);
});

test('computeHealthScore: consecutive failures + staleness drag the score down', () => {
  const r = computeHealthScore({ total: 20, healthy: 5, parseErrors: 4, consecutiveFailures: 5, lastSuccessAgeDays: 40 });
  assert.ok(r.score < 60, `expected Failing band, got ${r.score}`);
  assert.equal(r.status, 'FAILED');
  assert.equal(r.tier, 'Failing');
});

test('computeHealthScore: no events → unknown/at-risk, never a fabricated 100', () => {
  const r = computeHealthScore({ total: 0, healthy: 0, parseErrors: 0, consecutiveFailures: 0, lastSuccessAgeDays: null });
  assert.equal(r.status, 'WARNING');
  assert.ok(r.score < 80);
});

test('scoreTier bands', () => {
  assert.equal(scoreTier(96), 'Excellent');
  assert.equal(scoreTier(85), 'Healthy');
  assert.equal(scoreTier(70), 'At Risk');
  assert.equal(scoreTier(40), 'Failing');
});

// ---- backoff visibility -----------------------------------------------------

test('backoffStage escalates with consecutive failures', () => {
  assert.equal(backoffStage(0).stage, 'None');
  assert.equal(backoffStage(1).stage, 'Immediate retry');
  assert.match(backoffStage(3).stage, /Exponential/);
  assert.equal(backoffStage(6).stage, 'Escalated failure');
});
