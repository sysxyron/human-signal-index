// =============================================================================
// HSI Phase 41B — beta-feedback bugfix tests (node:test via tsx). Pure modules.
// Covers: Zenodo/DOI acceptance (B), source-update field mapping incl.
// type/status/monitoring/config + disabled→active (D), and submission +
// attachment validation (E/F).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyReferenceUrl, isAcceptableReferenceUrl } from './reference-url';
import { buildSourceUpdate } from './source-update';
import { validateSubmission, validateAttachment, MAX_ATTACHMENT_BYTES } from './submission-validate';

// ---- B. DOI / Zenodo / academic reference acceptance ------------------------

test('accepts doi.org, Zenodo record + DOI URLs, and arXiv', () => {
  const doi = classifyReferenceUrl('https://doi.org/10.5281/zenodo.123456');
  assert.equal(doi.ok, true);
  assert.equal(doi.kind, 'doi');
  assert.equal(doi.doi, '10.5281/zenodo.123456');

  const rec = classifyReferenceUrl('https://zenodo.org/records/7891011');
  assert.equal(rec.ok, true);
  assert.equal(rec.kind, 'zenodo');

  const zdoi = classifyReferenceUrl('https://zenodo.org/doi/10.5281/zenodo.7891011');
  assert.equal(zdoi.ok, true);
  assert.equal(zdoi.kind, 'zenodo');
  assert.equal(zdoi.doi, '10.5281/zenodo.7891011');

  assert.equal(classifyReferenceUrl('https://arxiv.org/abs/2401.01234').kind, 'arxiv');
  // Generic public web link is still accepted.
  assert.equal(isAcceptableReferenceUrl('https://example.org/article'), true);
});

test('rejects non-http, credentialed, and auth-gated URLs', () => {
  assert.equal(isAcceptableReferenceUrl(''), false);
  assert.equal(isAcceptableReferenceUrl('not a url'), false);
  assert.equal(isAcceptableReferenceUrl('ftp://example.org/x'), false);
  assert.equal(isAcceptableReferenceUrl('https://user:pass@example.org/'), false);
  assert.equal(isAcceptableReferenceUrl('https://example.org/login?token=abc'), false);
});

// ---- D. Source update field mapping ----------------------------------------

test('buildSourceUpdate maps every editable field incl. source_type', () => {
  const u = buildSourceUpdate({
    name: 'New name',
    sourceType: 'watchlist',
    homepageUrl: 'https://x.org',
    rssUrl: 'https://x.org/feed',
    status: 'active',
    monitoringEnabled: true,
    riskLevel: 4,
    config: { captureUrl: 'https://x.org' },
  });
  assert.equal(u.name, 'New name');
  assert.equal(u.source_type, 'watchlist');
  assert.equal(u.homepage_url, 'https://x.org');
  assert.equal(u.rss_url, 'https://x.org/feed');
  assert.equal(u.status, 'active');
  assert.equal(u.monitoring_enabled, true);
  assert.equal(u.risk_level, 4);
  assert.deepEqual(u.config, { captureUrl: 'https://x.org' });
  assert.ok(typeof u.updated_at === 'string');
});

test('buildSourceUpdate supports a disabled → active reactivation and partial updates', () => {
  const reactivate = buildSourceUpdate({ status: 'active', monitoringEnabled: true });
  assert.equal(reactivate.status, 'active');
  assert.equal(reactivate.monitoring_enabled, true);
  assert.equal('name' in reactivate, false); // only provided fields are written

  // Only a type change.
  const typeOnly = buildSourceUpdate({ sourceType: 'rss' });
  assert.equal(typeOnly.source_type, 'rss');
  assert.equal('status' in typeOnly, false);
});

// ---- E / F. Submission + attachment validation -----------------------------

test('validateSubmission requires an observation and accepts an optional Zenodo URL', () => {
  assert.equal(validateSubmission({ observation: 'too short' }).ok, false);
  const ok = validateSubmission({ observation: 'A clearly described public narrative worth review.', sourceUrl: 'https://zenodo.org/records/42' });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.source_url, 'https://zenodo.org/records/42');
    assert.equal(ok.value.observation.length >= 10, true);
  }
  // Invalid URL rejected with the sourceUrl field flagged.
  const bad = validateSubmission({ observation: 'A valid length observation here.', sourceUrl: 'javascript:alert(1)' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.field, 'sourceUrl');
  // URL is optional.
  assert.equal(validateSubmission({ observation: 'A valid length observation here.' }).ok, true);
});

test('validateAttachment enforces type + size', () => {
  assert.equal(validateAttachment({ name: 'shot.png', type: 'image/png', size: 1000 }).ok, true);
  assert.equal(validateAttachment({ name: 'doc.pdf', type: 'application/pdf', size: 1000 }).ok, true);
  assert.equal(validateAttachment({ name: 'evil.exe', type: 'application/octet-stream', size: 1000 }).ok, false);
  assert.equal(validateAttachment({ name: 'big.png', type: 'image/png', size: MAX_ATTACHMENT_BYTES + 1 }).ok, false);
  assert.equal(validateAttachment({ name: 'empty.png', type: 'image/png', size: 0 }).ok, false);
});
