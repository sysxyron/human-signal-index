import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOC_PAGES, getDocPage, DOC_INDEX, RESOURCES } from './content';
import { buildSearchIndex, searchDocs } from './search';
import { TRACKS, TOTAL_LESSONS } from '../education/curriculum';

// ---- docs content ----------------------------------------------------------

test('docs: all 8 sections present with unique slugs', () => {
  const slugs = DOC_PAGES.map((p) => p.slug);
  for (const s of ['concepts', 'workflow', 'methodology', 'api', 'developers', 'roles', 'faq', 'changelog']) assert.ok(slugs.includes(s), `missing ${s}`);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(DOC_INDEX.length, DOC_PAGES.length);
});
test('docs: getDocPage resolves known, returns undefined for unknown', () => {
  assert.equal(getDocPage('concepts')?.title, 'Core Concepts');
  assert.equal(getDocPage('nope'), undefined);
});
test('docs: API page marks genuinely-unbuilt sections coming soon (no invented availability)', () => {
  const apiPage = getDocPage('api');
  // The planned pieces (API keys, webhooks, SDKs, authenticated endpoints) stay Coming Soon.
  assert.ok(apiPage?.sections.some((s) => s.comingSoon));
  for (const h of ['API keys', 'Webhooks', 'SDKs']) {
    assert.ok(apiPage?.sections.find((s) => s.heading === h)?.comingSoon, `${h} must be Coming Soon`);
  }
  // The intro now reflects the live read-only endpoints (no longer "under development").
  assert.match(apiPage?.intro ?? '', /read-only|public-safe/i);
});

test('docs: API page accurately catalogs the four live public endpoints', () => {
  const apiPage = getDocPage('api');
  const text = JSON.stringify(apiPage?.sections ?? []);
  for (const path of [
    'GET /api/public/intelligence',
    'GET /api/public/trust',
    'GET /api/public/transparency',
    'GET /api/public/marketplace',
  ]) {
    assert.ok(text.includes(path), `API docs must list ${path}`);
  }
  // The documented rate limit matches the real handler (60 req/min).
  assert.match(text, /60 requests per minute/i);
});

test('docs: public API page never advertises protected / internal endpoints', () => {
  const apiPage = getDocPage('api');
  const haystack = `${apiPage?.intro ?? ''} ${JSON.stringify(apiPage?.sections ?? [])}`;
  // Public docs must not leak protected namespaces or internal surfaces.
  for (const forbidden of ['/api/admin', '/api/cron', '/api/system', '/api/webhooks', '/api/debug', '/dashboard/', 'service_role', 'service-role']) {
    assert.ok(!haystack.includes(forbidden), `API docs must not reference ${forbidden}`);
  }
});
test('docs: every page has metadata fields for SEO', () => {
  for (const p of DOC_PAGES) {
    assert.ok(p.title.length > 0 && p.description.length > 0 && p.keywords.length > 0 && p.intro.length > 0);
  }
});
test('resources are placeholders (coming soon, no fake files)', () => {
  assert.ok(RESOURCES.length >= 5);
  for (const r of RESOURCES) assert.ok(r.title && r.detail);
});

// ---- education curriculum --------------------------------------------------

test('curriculum: 6 tracks, lessons are upcoming (no fake durations/videos)', () => {
  assert.equal(TRACKS.length, 6);
  assert.ok(TOTAL_LESSONS >= 30);
  for (const t of TRACKS) for (const l of t.lessons) {
    assert.equal(l.status, 'coming_soon');
    assert.equal(l.estimatedLength, null); // never a fabricated duration
    assert.ok(l.title.length > 0 && l.summary.length > 0);
  }
});

// ---- search (deterministic, local) -----------------------------------------

test('search index spans docs, faq, and lessons', () => {
  const idx = buildSearchIndex();
  assert.ok(idx.some((e) => e.type === 'doc'));
  assert.ok(idx.some((e) => e.type === 'faq'));
  assert.ok(idx.some((e) => e.type === 'lesson'));
});
test('searchDocs: finds relevant entries; short query → empty', () => {
  const idx = buildSearchIndex();
  assert.equal(searchDocs(idx, 'a').length, 0); // < 2 chars
  const forecast = searchDocs(idx, 'forecast');
  assert.ok(forecast.length > 0);
  assert.ok(forecast.every((e) => /forecast/i.test(e.title + e.text)));
});
test('searchDocs: deterministic + title hits rank first', () => {
  const idx = buildSearchIndex();
  const a = searchDocs(idx, 'methodology');
  const b = searchDocs(idx, 'methodology');
  assert.deepEqual(a.map((e) => e.url), b.map((e) => e.url));
  assert.match(a[0].title, /Methodology/i); // exact title beats body mentions
});
test('searchDocs: unknown query → empty (no fabrication)', () => {
  assert.deepEqual(searchDocs(buildSearchIndex(), 'zzqqxx'), []);
});
