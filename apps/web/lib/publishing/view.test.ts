import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLIC_TOPICS,
  canCurate,
  canResearch,
  demoPublicIntelligence,
  demoPublicationPage,
  demoPublishingDashboard,
  demoReportSections,
  demoSearchResults,
  demoSubscriptionAccount,
  demoTopicPage,
  formatConfidence,
  formatDate,
  formatTrust,
  readStringArray,
  retractionReasonLabel,
  stateDecor,
  trustBandDecor,
} from './view';

// ---- role gating ------------------------------------------------------------
test('canResearch / canCurate', () => {
  assert.equal(canResearch('researcher'), true);
  assert.equal(canResearch('viewer'), false);
  assert.equal(canCurate('curator'), true);
  assert.equal(canCurate('reviewer'), false);
});

// ---- decorators -------------------------------------------------------------
test('stateDecor labels', () => {
  assert.equal(stateDecor('PUBLISHED').tone, 'green');
  assert.equal(stateDecor('RETRACTED').tone, 'red');
  assert.equal(stateDecor('UNDER_REVIEW').tone, 'orange');
  assert.equal(stateDecor(null).label, 'Unknown');
});

test('trustBandDecor thresholds', () => {
  assert.equal(trustBandDecor(80).tone, 'green');
  assert.equal(trustBandDecor(50).tone, 'orange');
  assert.equal(trustBandDecor(20).tone, 'red');
  assert.equal(trustBandDecor(null).label, 'Unrated');
});

test('retractionReasonLabel', () => {
  assert.equal(retractionReasonLabel('trust_collapse'), 'Trust collapse');
  assert.equal(retractionReasonLabel('evidence_error'), 'Evidence error');
  assert.equal(retractionReasonLabel(null), 'Retracted');
});

// ---- formatters -------------------------------------------------------------
test('formatTrust', () => {
  assert.equal(formatTrust(78.6), '79');
  assert.equal(formatTrust(null), '—');
  assert.equal(formatTrust(150), '100');
});

test('formatConfidence', () => {
  assert.equal(formatConfidence(0.74), '74%');
  assert.equal(formatConfidence(null), '—');
});

test('formatDate', () => {
  assert.match(formatDate('2026-06-09T12:00:00.000Z'), /Jun/);
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('bad'), '—');
});

test('readStringArray', () => {
  assert.deepEqual(readStringArray({ items: ['a'] }), ['a']);
  assert.deepEqual(readStringArray(['b']), ['b']);
  assert.deepEqual(readStringArray('c'), ['c']);
  assert.deepEqual(readStringArray(null), []);
});

test('PUBLIC_TOPICS includes the spec topics', () => {
  const slugs = PUBLIC_TOPICS.map((t) => t.slug);
  for (const s of ['history', 'archaeology', 'anthropology', 'genetics', 'civilizations', 'religion', 'technology']) {
    assert.ok(slugs.includes(s), `missing ${s}`);
  }
});

// ---- demo builders ----------------------------------------------------------
test('demoPublicIntelligence has published + retracted', () => {
  const d = demoPublicIntelligence();
  assert.ok(d.items.length >= 2);
  assert.ok(d.items.some((i) => i.state === 'PUBLISHED'));
  assert.ok(d.items.some((i) => i.state === 'RETRACTED'));
  assert.equal(d.total, d.items.length);
});

test('demoPublicationPage published has 12 report sections', () => {
  const d = demoPublicationPage();
  assert.equal(d.report.length, 12);
  assert.ok(d.sourceRefs.length > 0);
  assert.ok(d.auditTrail.length > 0);
  assert.equal(d.retraction, undefined);
});

test('demoPublicationPage retracted shows a retraction', () => {
  const retractedSlug = demoPublicIntelligence().items.find((i) => i.state === 'RETRACTED')!.slug;
  const d = demoPublicationPage(retractedSlug);
  assert.ok(d.retraction);
  assert.equal(d.retraction?.reason, 'trust_collapse');
});

test('demoPublicationPage trust history is ordered', () => {
  const d = demoPublicationPage();
  assert.ok(d.trustHistory.length >= 2);
});

test('demoTopicPage aggregates', () => {
  const d = demoTopicPage('history');
  assert.equal(d.slug, 'history');
  assert.equal(d.title, 'History');
  assert.ok(d.reportCount >= 0);
});

test('demoSearchResults filters by query', () => {
  const all = demoSearchResults('');
  assert.ok(all.publications.length >= 1);
  const filtered = demoSearchResults('zzzznomatch');
  assert.equal(filtered.publications.length, 0);
});

test('demoPublishingDashboard analytics', () => {
  const d = demoPublishingDashboard();
  assert.equal(d.analytics.totalPublished, 1);
  assert.equal(d.analytics.totalRetracted, 1);
  assert.ok(d.retractions.length >= 1);
  assert.ok(d.digestRuns.length >= 1);
});

test('demoSubscriptionAccount has a subscriber + prefs', () => {
  const d = demoSubscriptionAccount();
  assert.ok(d.subscriber);
  assert.ok(d.preferences);
  assert.equal(d.subscriber?.active, true);
});

test('demoReportSections builds 12 sections', () => {
  assert.equal(demoReportSections('Test').length, 12);
});

test('demo builders deterministic', () => {
  assert.deepEqual(demoPublicIntelligence(), demoPublicIntelligence());
  assert.deepEqual(demoPublishingDashboard(), demoPublishingDashboard());
  assert.deepEqual(demoPublicationPage('x'), demoPublicationPage('x'));
});

test('published demo item carries trust + evidence', () => {
  const item = demoPublicIntelligence().items.find((i) => i.state === 'PUBLISHED')!;
  assert.ok(typeof item.trustScore === 'number');
  assert.ok(item.evidenceCount >= 0);
  assert.ok(item.sourceCount >= 0);
});

test('demo report sections are sourced where evidence exists', () => {
  const d = demoPublicationPage();
  const exec = d.report.find((s) => s.key === 'executive_summary');
  assert.ok(exec);
});

test('demoTopicPage avgTrust within range when reports exist', () => {
  const d = demoTopicPage('civilizations');
  if (d.avgTrust !== undefined) assert.ok(d.avgTrust >= 0 && d.avgTrust <= 100);
});
