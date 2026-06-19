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
  publicHeaderState,
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

test('Phase 58.1 wired surfaces: nav visibility matches route gates', () => {
  // All six are real menu items now.
  for (const h of ['/dashboard/source-registry', '/dashboard/watchlists', '/dashboard/forecasting', '/dashboard/collaboration', '/dashboard/release-candidate', '/dashboard/beta-operations']) {
    assert.ok(ALL_NAV_HREFS.includes(h), `${h} should be a menu item`);
  }
  // source-registry = reviewer+ (matches PROTECTED_ROUTES reviewer gate)
  assert.equal(canSeeRoute('/dashboard/source-registry', 'researcher'), false);
  assert.equal(canSeeRoute('/dashboard/source-registry', 'reviewer'), true);
  // researcher+ surfaces
  for (const h of ['/dashboard/watchlists', '/dashboard/forecasting', '/dashboard/collaboration', '/dashboard/release-candidate', '/dashboard/my-work']) {
    assert.equal(canSeeRoute(h, 'viewer'), false, `${h} hidden from viewer`);
    assert.equal(canSeeRoute(h, 'researcher'), true, `${h} visible to researcher`);
  }
  // beta-operations = admin only
  assert.equal(canSeeRoute('/dashboard/beta-operations', 'reviewer'), false);
  assert.equal(canSeeRoute('/dashboard/beta-operations', 'admin'), true);
});

test('Phase 62 notifications is viewer+ (every signed-in role) and a real menu item', () => {
  assert.ok(ALL_NAV_HREFS.includes('/dashboard/notifications'));
  for (const r of ['viewer', 'researcher', 'reviewer', 'curator', 'admin'] as const) {
    assert.equal(canSeeRoute('/dashboard/notifications', r), true, `${r} should see notifications`);
  }
  // anonymous (no role) must not see it — it is a personal, owner-scoped surface.
  assert.equal(canSeeRoute('/dashboard/notifications', null), false);
});

test('Phase 67 forecast-validation is reviewer+ and a real menu item', () => {
  assert.ok(ALL_NAV_HREFS.includes('/dashboard/forecast-validation'));
  assert.equal(canSeeRoute('/dashboard/forecast-validation', 'researcher'), false);
  assert.equal(canSeeRoute('/dashboard/forecast-validation', 'reviewer'), true);
  assert.equal(canSeeRoute('/dashboard/forecast-validation', 'curator'), true);
  assert.equal(canSeeRoute('/dashboard/forecast-validation', 'admin'), true);
  // existing Phase 21 /dashboard/forecasts is preserved (researcher+)
  assert.equal(canSeeRoute('/dashboard/forecasts', 'researcher'), true);
});

test('Phase 66 agents is reviewer+ and a real menu item', () => {
  assert.ok(ALL_NAV_HREFS.includes('/dashboard/agents'));
  assert.equal(canSeeRoute('/dashboard/agents', 'researcher'), false);
  assert.equal(canSeeRoute('/dashboard/agents', 'reviewer'), true);
  assert.equal(canSeeRoute('/dashboard/agents', 'curator'), true);
  assert.equal(canSeeRoute('/dashboard/agents', 'admin'), true);
});

test('Phase 65 narratives is reviewer+ and a real menu item', () => {
  assert.ok(ALL_NAV_HREFS.includes('/dashboard/narratives'));
  assert.equal(canSeeRoute('/dashboard/narratives', 'researcher'), false);
  assert.equal(canSeeRoute('/dashboard/narratives', 'reviewer'), true);
  assert.equal(canSeeRoute('/dashboard/narratives', 'curator'), true);
  assert.equal(canSeeRoute('/dashboard/narratives', 'admin'), true);
});

test('Phase 64 evidence-graph is reviewer+ and a real menu item', () => {
  assert.ok(ALL_NAV_HREFS.includes('/dashboard/evidence-graph'));
  assert.equal(canSeeRoute('/dashboard/evidence-graph', 'researcher'), false);
  assert.equal(canSeeRoute('/dashboard/evidence-graph', 'reviewer'), true);
  assert.equal(canSeeRoute('/dashboard/evidence-graph', 'curator'), true);
  assert.equal(canSeeRoute('/dashboard/evidence-graph', 'admin'), true);
});

test('Phase 63 source-monitoring is reviewer+ and a real menu item', () => {
  assert.ok(ALL_NAV_HREFS.includes('/dashboard/source-monitoring'));
  assert.equal(canSeeRoute('/dashboard/source-monitoring', 'researcher'), false);
  assert.equal(canSeeRoute('/dashboard/source-monitoring', 'reviewer'), true);
  assert.equal(canSeeRoute('/dashboard/source-monitoring', 'curator'), true);
  assert.equal(canSeeRoute('/dashboard/source-monitoring', 'admin'), true);
});

test('Phase 61 source-reliability is reviewer+ and a real menu item', () => {
  assert.ok(ALL_NAV_HREFS.includes('/dashboard/source-reliability'));
  assert.equal(canSeeRoute('/dashboard/source-reliability', 'researcher'), false);
  assert.equal(canSeeRoute('/dashboard/source-reliability', 'reviewer'), true);
  assert.equal(canSeeRoute('/dashboard/source-reliability', 'curator'), true);
  assert.equal(canSeeRoute('/dashboard/source-reliability', 'admin'), true);
});

test('Phase 60 beta-launch console is admin-only and a real menu item', () => {
  assert.ok(ALL_NAV_HREFS.includes('/dashboard/beta-launch'));
  assert.equal(canSeeRoute('/dashboard/beta-launch', 'curator'), false);
  assert.equal(canSeeRoute('/dashboard/beta-launch', 'reviewer'), false);
  assert.equal(canSeeRoute('/dashboard/beta-launch', 'admin'), true);
});

// ---- viewer (Phase 41B.1 policy) -------------------------------------------

const VIEWER_VISIBLE = [
  '/dashboard', '/submit-a-signal',
  '/dashboard/missions', '/dashboard/badges', '/dashboard/leaderboard', '/dashboard/authority',
  '/dashboard/tester', '/dashboard/tester-onboarding', '/dashboard/profile', '/dashboard/apply-role',
];
const VIEWER_HIDDEN = [
  // Phase 41B.3 (C): Source Registry is researcher+ — must not appear for viewers.
  '/dashboard/sources',
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
  for (const href of ['/dashboard/sources', '/dashboard/forecasts', '/dashboard/worldforge', '/dashboard/trust', '/dashboard/consensus', '/dashboard/public-reports', '/dashboard/signal-intake', '/dashboard/evidence-vault', '/dashboard/investigations']) {
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

test('admin sees Source Registry; viewer does not (C)', () => {
  assert.equal(canSeeRoute('/dashboard/sources', 'admin'), true);
  assert.equal(canSeeRoute('/dashboard/sources', 'researcher'), true);
  assert.equal(canSeeRoute('/dashboard/sources', 'viewer'), false);
});

test('publicHeaderState: anon shows Sign in; authed hides it + shows Dashboard (A)', () => {
  const anon = publicHeaderState(false);
  assert.equal(anon.showSignIn, true);
  assert.equal(anon.dashboardLabel, 'Explore Dashboard');
  const authed = publicHeaderState(true);
  assert.equal(authed.showSignIn, false);
  assert.equal(authed.dashboardLabel, 'Dashboard');
});

test('role ladder + labels + next role', () => {
  assert.equal(roleLabel('researcher'), 'Researcher');
  assert.equal(roleLabel(null), 'Viewer');
  assert.equal(nextRole('viewer'), 'contributor');
  assert.equal(nextRole('reviewer'), 'curator');
});

test('public role ladder is Viewer→Curator and NEVER includes Admin (41B.3B)', () => {
  assert.deepEqual([...ROLE_LADDER], ['viewer', 'contributor', 'researcher', 'reviewer', 'curator']);
  assert.equal((ROLE_LADDER as readonly string[]).includes('admin'), false);
  // Curator is the top of the public ladder; there is no advancement beyond it.
  assert.equal(nextRole('curator'), null);
  // Admin is not on the ladder, so it offers no next step either.
  assert.equal(nextRole('admin'), null);
});
