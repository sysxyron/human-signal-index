import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_NAV_HREFS,
  NAV_VISIBILITY,
  canSeeRoute,
  filterNavGroups,
  isNavItemVisible,
  isRestrictedRoute,
  ORG_MEMBER_ROUTES,
  ORG_CREATE_ROUTE,
  ROLE_LADDER,
  roleLabel,
  nextRole,
} from '../src/nav-roles';

// ---- invariants ------------------------------------------------------------

test('every restricted route is a real menu item; href list has no dupes', () => {
  for (const href of Object.keys(NAV_VISIBILITY)) {
    assert.ok(ALL_NAV_HREFS.includes(href), `${href} in NAV_VISIBILITY but not in ALL_NAV_HREFS`);
  }
  assert.equal(new Set(ALL_NAV_HREFS).size, ALL_NAV_HREFS.length, 'ALL_NAV_HREFS has duplicates');
});

test('admin sees every route; viewer sees far fewer', () => {
  const viewerCount = ALL_NAV_HREFS.filter((h) => canSeeRoute(h, 'viewer')).length;
  const adminCount = ALL_NAV_HREFS.filter((h) => canSeeRoute(h, 'admin')).length;
  assert.equal(adminCount, ALL_NAV_HREFS.length);
  assert.ok(viewerCount > 0 && viewerCount < adminCount);
});

test('admin sees every restricted route', () => {
  for (const href of Object.keys(NAV_VISIBILITY)) assert.equal(canSeeRoute(href, 'admin'), true, href);
});

// ---- viewer (Phase 41B.1 policy) -------------------------------------------

const VIEWER_VISIBLE = [
  '/dashboard', '/dashboard/sources', '/submit-a-signal',
  '/dashboard/missions', '/dashboard/badges', '/dashboard/leaderboard', '/dashboard/authority',
  '/dashboard/tester', '/dashboard/tester-onboarding', '/dashboard/profile', '/dashboard/apply-role',
];
const VIEWER_HIDDEN = [
  // intelligence / forecasting / collective / trust / worldforge / public reports
  '/dashboard/rhetoric-classifier', '/dashboard/risk-scoring', '/dashboard/traceability-engine',
  '/dashboard/alerts', '/dashboard/public-reports',
  '/dashboard/forecasts', '/dashboard/scenarios', '/dashboard/warnings',
  '/dashboard/consensus', '/dashboard/debates', '/dashboard/contributors',
  '/dashboard/outcomes', '/dashboard/trust', '/dashboard/calibration',
  '/dashboard/worldforge', '/dashboard/simulation', '/dashboard/worldforge/universes',
  // write / review / admin / beta-queue / submission-queue
  '/dashboard/signal-intake', '/dashboard/review', '/dashboard/signal-submission',
  '/dashboard/launch/issues', '/dashboard/admin/users', '/dashboard/settings', '/dashboard/security',
];

test('viewer SEES only the allowed read/contributor/beta/account menus', () => {
  for (const href of VIEWER_VISIBLE) assert.equal(canSeeRoute(href, 'viewer'), true, `viewer should see ${href}`);
});

test('viewer does NOT see analysis/forecast/collective/trust/worldforge/admin/queue menus', () => {
  for (const href of VIEWER_HIDDEN) assert.equal(canSeeRoute(href, 'viewer'), false, `viewer should NOT see ${href}`);
});

// ---- researcher ------------------------------------------------------------

test('researcher sees research surfaces but not reviewer/admin queues', () => {
  for (const href of ['/dashboard/forecasts', '/dashboard/worldforge', '/dashboard/trust', '/dashboard/consensus', '/dashboard/public-reports', '/dashboard/signal-intake', '/dashboard/evidence-vault', '/dashboard/investigations']) {
    assert.equal(canSeeRoute(href, 'researcher'), true, href);
  }
  for (const href of ['/dashboard/review', '/dashboard/signal-submission', '/dashboard/launch/issues', '/dashboard/admin/users', '/dashboard/settings']) {
    assert.equal(canSeeRoute(href, 'researcher'), false, href);
  }
});

// ---- reviewer --------------------------------------------------------------

test('reviewer sees review + submission queue + beta issues + operations', () => {
  for (const href of ['/dashboard/review', '/dashboard/signal-submission', '/dashboard/launch/issues', '/dashboard/operations', '/dashboard/governance', '/dashboard/forecasts']) {
    assert.equal(canSeeRoute(href, 'reviewer'), true, href);
  }
  for (const href of ['/dashboard/publishing', '/dashboard/admin/users', '/dashboard/settings']) {
    assert.equal(canSeeRoute(href, 'reviewer'), false, href);
  }
});

// ---- curator ---------------------------------------------------------------

test('curator sees publishing + worldforge + trust; not admin/security', () => {
  for (const href of ['/dashboard/publishing', '/dashboard/publishing/retractions', '/dashboard/worldforge', '/dashboard/trust', '/dashboard/launch/issues']) {
    assert.equal(canSeeRoute(href, 'curator'), true, href);
  }
  for (const href of ['/dashboard/admin/users', '/dashboard/security', '/dashboard/settings']) {
    assert.equal(canSeeRoute(href, 'curator'), false, href);
  }
});

// ---- null / unknown role ---------------------------------------------------

test('null role sees only unrestricted routes', () => {
  assert.equal(canSeeRoute('/dashboard', null), true);
  assert.equal(canSeeRoute('/dashboard/worldforge', null), false);
  assert.equal(canSeeRoute('/dashboard/admin/users', null), false);
});

// ---- organization membership gating (Phase 41B.1, B) -----------------------

const ORG_GROUPS = [
  {
    group: 'Organization',
    items: [
      { href: '/dashboard/org' },
      { href: '/dashboard/org/members' },
      { href: '/dashboard/org/billing' },
      { href: ORG_CREATE_ROUTE },
    ],
  },
];

test('org pages are hidden for non-members; only Create Organization shows', () => {
  const out = filterNavGroups(ORG_GROUPS, 'viewer', { orgMember: false, selfServeOrg: true });
  const hrefs = out.flatMap((g) => g.items.map((i) => i.href));
  assert.deepEqual(hrefs, [ORG_CREATE_ROUTE]);
  // member routes are all gated
  for (const r of ORG_MEMBER_ROUTES) assert.equal(isNavItemVisible(r, 'viewer', { orgMember: false }), false, r);
});

test('org members see org pages but not Create Organization', () => {
  const out = filterNavGroups(ORG_GROUPS, 'admin', { orgMember: true });
  const hrefs = out.flatMap((g) => g.items.map((i) => i.href));
  assert.ok(hrefs.includes('/dashboard/org'));
  assert.ok(hrefs.includes('/dashboard/org/billing'));
  assert.ok(!hrefs.includes(ORG_CREATE_ROUTE));
});

test('self-service disabled hides Create Organization for non-members', () => {
  assert.equal(isNavItemVisible(ORG_CREATE_ROUTE, 'viewer', { orgMember: false, selfServeOrg: false }), false);
});

// ---- filterNavGroups (role) ------------------------------------------------

const SAMPLE = [
  { group: 'Read', items: [{ href: '/dashboard' }, { href: '/dashboard/missions' }] },
  { group: 'Admin', items: [{ href: '/dashboard/admin/users' }, { href: '/dashboard/settings' }] },
  { group: 'Mixed', items: [{ href: '/dashboard/missions' }, { href: '/dashboard/worldforge' }] },
];

test('filterNavGroups hides items + drops empty groups for viewer', () => {
  const out = filterNavGroups(SAMPLE, 'viewer');
  const groups = out.map((g) => g.group);
  assert.ok(groups.includes('Read'));
  assert.ok(!groups.includes('Admin'));
  const mixed = out.find((g) => g.group === 'Mixed');
  assert.deepEqual(mixed?.items.map((i) => i.href), ['/dashboard/missions']); // worldforge hidden
});

test('filterNavGroups keeps everything for admin', () => {
  const out = filterNavGroups(SAMPLE, 'admin');
  assert.equal(out.reduce((n, g) => n + g.items.length, 0), 6);
});

test('isRestrictedRoute flags gated routes', () => {
  assert.equal(isRestrictedRoute('/dashboard/worldforge'), true);
  assert.equal(isRestrictedRoute('/dashboard'), false);
});

// ---- role ladder helpers (J/M) ---------------------------------------------

test('role ladder + labels + next role', () => {
  assert.deepEqual([...ROLE_LADDER], ['viewer', 'contributor', 'researcher', 'reviewer', 'curator', 'admin']);
  assert.equal(roleLabel('researcher'), 'Researcher');
  assert.equal(roleLabel(null), 'Viewer');
  assert.equal(nextRole('viewer'), 'contributor');
  assert.equal(nextRole('reviewer'), 'curator');
  assert.equal(nextRole('admin'), null);
});
