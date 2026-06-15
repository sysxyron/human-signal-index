import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SEED_PAGES, SEED_NAV, SEED_ROLE_CONTENT, SEED_MISSION_CONTENT, SEED_BADGE_CONTENT,
  SEED_ONBOARDING, SEED_EMAIL_TEMPLATES, selectMissing,
} from './seed-data';
import { validatePage } from '@hsi/cms-engine';

test('seed pages: unique slugs, valid + publish-ready blocks', () => {
  const slugs = SEED_PAGES.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate slugs');
  assert.ok(slugs.includes('home'));
  for (const p of SEED_PAGES) {
    const draft = { page: { id: p.slug, slug: p.slug, pageType: p.pageType, title: p.title, status: p.status, seo: p.seo }, blocks: p.blocks.map((b, i) => ({ id: `${p.slug}-${i}`, type: b.type, position: i, content: b.content })) };
    const v = validatePage(draft);
    assert.ok(v.ok, `${p.slug}: ${v.issues.map((x) => x.message).join(', ')}`);
  }
});

test('homepage is seeded as DRAFT (flagship page preserved until admin publishes)', () => {
  const home = SEED_PAGES.find((p) => p.slug === 'home');
  assert.equal(home?.status, 'draft');
  // content pages are published so they render from CMS immediately
  assert.equal(SEED_PAGES.find((p) => p.slug === 'trust')?.status, 'published');
});

test('navigation seeded for all three locations', () => {
  for (const loc of ['header', 'footer', 'dashboard_help']) {
    assert.ok(SEED_NAV.some((n) => n.location === loc), loc);
  }
});

test('role/mission/badge content derived from real sources', () => {
  assert.equal(SEED_ROLE_CONTENT.length, 5);
  assert.ok(SEED_MISSION_CONTENT.length > 0);
  assert.ok(SEED_BADGE_CONTENT.length >= 10);
  assert.ok(SEED_BADGE_CONTENT.every((b) => b.unlockRequirements.length > 0));
});

test('onboarding + email templates seeded with stable keys', () => {
  assert.ok(SEED_ONBOARDING.some((o) => o.key === 'purpose_welcome'));
  assert.ok(SEED_ONBOARDING.some((o) => o.key === 'tester_welcome'));
  const emailKeys = SEED_EMAIL_TEMPLATES.map((e) => e.key);
  for (const k of ['invite', 'role_approved', 'role_rejected', 'mission_assigned', 'beta_invite', 'feedback_request']) assert.ok(emailKeys.includes(k), k);
});

// ---- idempotency -----------------------------------------------------------
test('selectMissing: only inserts what is absent (idempotent reruns)', () => {
  const all = SEED_PAGES;
  const none = selectMissing(all, new Set(), (p) => p.slug);
  assert.equal(none.length, all.length); // empty DB → insert all
  const existing = new Set(all.map((p) => p.slug));
  assert.equal(selectMissing(all, existing, (p) => p.slug).length, 0); // all present → insert nothing
  const partial = new Set(['home', 'trust']);
  assert.equal(selectMissing(all, partial, (p) => p.slug).length, all.length - 2);
});

test('selectMissing works across content kinds', () => {
  assert.equal(selectMissing(SEED_NAV, new Set(), (n) => `${n.location}:${n.href}`).length, SEED_NAV.length);
  assert.equal(selectMissing(SEED_ROLE_CONTENT, new Set(SEED_ROLE_CONTENT.map((r) => r.role)), (r) => r.role).length, 0);
});
