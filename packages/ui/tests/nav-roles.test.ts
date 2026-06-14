import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALL_NAV_HREFS, NAV_VISIBILITY, canSeeRoute, filterNavGroups, isRestrictedRoute } from '../src/nav-roles';

test('every restricted route is a real menu item; href list has no dupes', () => {
  for (const href of Object.keys(NAV_VISIBILITY)) {
    assert.ok(ALL_NAV_HREFS.includes(href), `${href} in NAV_VISIBILITY but not in ALL_NAV_HREFS`);
  }
  assert.equal(new Set(ALL_NAV_HREFS).size, ALL_NAV_HREFS.length, 'ALL_NAV_HREFS has duplicates');
});

test('viewer sees fewer menus than admin; admin sees all', () => {
  const viewerCount = ALL_NAV_HREFS.filter((h) => canSeeRoute(h, 'viewer')).length;
  const adminCount = ALL_NAV_HREFS.filter((h) => canSeeRoute(h, 'admin')).length;
  assert.equal(adminCount, ALL_NAV_HREFS.length);
  assert.ok(viewerCount < adminCount);
  assert.ok(viewerCount > 0);
});

// ---- canSeeRoute: admin sees everything -----------------------------------
test('admin sees every route', () => {
  for (const href of Object.keys(NAV_VISIBILITY)) assert.equal(canSeeRoute(href, 'admin'), true, href);
  assert.equal(canSeeRoute('/dashboard', 'admin'), true);
  assert.equal(canSeeRoute('/dashboard/admin/users', 'admin'), true);
});

// ---- viewer: only unrestricted (read-only) menus --------------------------
test('viewer sees unrestricted read menus', () => {
  for (const href of ['/dashboard', '/dashboard/public-reports', '/dashboard/forecasts', '/dashboard/trust', '/dashboard/worldforge', '/dashboard/profile', '/dashboard/launch/issues']) {
    assert.equal(canSeeRoute(href, 'viewer'), true, href);
  }
});

test('viewer does NOT see write/admin/operations menus', () => {
  for (const href of ['/dashboard/signal-intake', '/dashboard/review', '/dashboard/source-registry', '/dashboard/publishing', '/dashboard/admin/users', '/dashboard/settings', '/dashboard/security', '/dashboard/launch', '/dashboard/my-work', '/dashboard/executive']) {
    assert.equal(canSeeRoute(href, 'viewer'), false, href);
  }
});

// ---- researcher ------------------------------------------------------------
test('researcher sees research/intake/evidence/investigation/work', () => {
  for (const href of ['/dashboard/signal-intake', '/dashboard/evidence-vault', '/dashboard/investigations', '/dashboard/my-work', '/dashboard/decisions/explorer']) {
    assert.equal(canSeeRoute(href, 'researcher'), true, href);
  }
});
test('researcher does NOT see review-queue/publishing/admin', () => {
  for (const href of ['/dashboard/review', '/dashboard/publishing', '/dashboard/admin/users', '/dashboard/settings']) {
    assert.equal(canSeeRoute(href, 'researcher'), false, href);
  }
});

// ---- reviewer --------------------------------------------------------------
test('reviewer sees review/source/operations/governance/publishing-review', () => {
  for (const href of ['/dashboard/review', '/dashboard/source-registry', '/dashboard/operations', '/dashboard/governance', '/dashboard/publishing/review']) {
    assert.equal(canSeeRoute(href, 'reviewer'), true, href);
  }
});
test('reviewer does NOT see publish/retractions/admin', () => {
  for (const href of ['/dashboard/publishing', '/dashboard/publishing/retractions', '/dashboard/admin/users', '/dashboard/settings']) {
    assert.equal(canSeeRoute(href, 'reviewer'), false, href);
  }
});

// ---- curator ---------------------------------------------------------------
test('curator sees publishing/reports/governance', () => {
  for (const href of ['/dashboard/publishing', '/dashboard/publishing/review', '/dashboard/publishing/retractions', '/dashboard/governance', '/dashboard/exec-governance']) {
    assert.equal(canSeeRoute(href, 'curator'), true, href);
  }
});
test('curator does NOT see admin/security/settings', () => {
  for (const href of ['/dashboard/admin/users', '/dashboard/security', '/dashboard/settings']) {
    assert.equal(canSeeRoute(href, 'curator'), false, href);
  }
});

// ---- admin-only menus ------------------------------------------------------
test('admin menus are admin-only', () => {
  for (const href of ['/dashboard/admin/users', '/dashboard/admin/teams', '/dashboard/admin/testers', '/dashboard/admin/access-logs', '/dashboard/launch', '/dashboard/security', '/dashboard/security-monitor', '/dashboard/settings']) {
    for (const r of ['viewer', 'researcher', 'reviewer', 'curator']) assert.equal(canSeeRoute(href, r), false, `${r} ${href}`);
    assert.equal(canSeeRoute(href, 'admin'), true, href);
  }
});

// ---- null / unknown role ---------------------------------------------------
test('null role sees only unrestricted routes', () => {
  assert.equal(canSeeRoute('/dashboard/public-reports', null), true);
  assert.equal(canSeeRoute('/dashboard/admin/users', null), false);
  assert.equal(canSeeRoute('/dashboard/review', null), false);
});

// ---- filterNavGroups -------------------------------------------------------
const SAMPLE = [
  { group: 'Read', items: [{ href: '/dashboard' }, { href: '/dashboard/public-reports' }] },
  { group: 'Admin', items: [{ href: '/dashboard/admin/users' }, { href: '/dashboard/settings' }] },
  { group: 'Mixed', items: [{ href: '/dashboard/forecasts' }, { href: '/dashboard/review' }] },
];

test('filterNavGroups hides items + drops empty groups for viewer', () => {
  const out = filterNavGroups(SAMPLE, 'viewer');
  const groups = out.map((g) => g.group);
  assert.ok(groups.includes('Read'));
  assert.ok(!groups.includes('Admin')); // both items hidden → group dropped
  const mixed = out.find((g) => g.group === 'Mixed');
  assert.deepEqual(mixed?.items.map((i) => i.href), ['/dashboard/forecasts']); // review hidden
});

test('filterNavGroups keeps everything for admin', () => {
  const out = filterNavGroups(SAMPLE, 'admin');
  assert.equal(out.length, 3);
  assert.equal(out.reduce((n, g) => n + g.items.length, 0), 6);
});

test('isRestrictedRoute flags gated routes', () => {
  assert.equal(isRestrictedRoute('/dashboard/admin/users'), true);
  assert.equal(isRestrictedRoute('/dashboard'), false);
});
