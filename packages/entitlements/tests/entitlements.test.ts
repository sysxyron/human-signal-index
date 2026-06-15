import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLAN_DEFS, FEATURE_KEYS, DEFAULT_ENTITLEMENTS, isPlanSlug, planDef, defaultEntitlements } from '../src/plans';
import { hasFeature, getLimit, requireFeature, withinLimit, remaining } from '../src/access';
import { evaluateUsage, anyLimitExceeded, LIMITED_USAGE } from '../src/usage';

test('4 plans (community→government) with ascending tiers', () => {
  assert.deepEqual(PLAN_DEFS.map((p) => p.slug), ['community', 'professional', 'enterprise', 'government']);
  for (let i = 1; i < PLAN_DEFS.length; i++) assert.ok(PLAN_DEFS[i].tier > PLAN_DEFS[i - 1].tier);
  assert.ok(isPlanSlug('enterprise'));
  assert.ok(!isPlanSlug('startup'));
  assert.equal(planDef('community')?.name, 'Community');
});

test('every plan declares an entitlement for every feature key', () => {
  for (const p of PLAN_DEFS) {
    const ents = DEFAULT_ENTITLEMENTS[p.slug];
    for (const k of FEATURE_KEYS) assert.ok(ents.some((e) => e.featureKey === k), `${p.slug} missing ${k}`);
  }
});

test('community: branding + teams on; premium features off; high limits (no blocking)', () => {
  const c = defaultEntitlements('community');
  assert.ok(hasFeature(c, 'organization_branding'));
  assert.ok(hasFeature(c, 'team_workspaces'));
  assert.ok(!hasFeature(c, 'white_label'));
  assert.ok(!hasFeature(c, 'advanced_analytics'));
  assert.ok((getLimit(c, 'investigations_limit') ?? 0) >= 10000); // high → framework only
});

test('enterprise/government unlock premium features + unlimited', () => {
  for (const slug of ['enterprise', 'government'] as const) {
    const e = defaultEntitlements(slug);
    assert.ok(hasFeature(e, 'white_label'));
    assert.ok(hasFeature(e, 'custom_domains'));
    assert.ok(hasFeature(e, 'ai_agents'));
    assert.equal(getLimit(e, 'investigations_limit'), null); // unlimited
  }
});

test('professional sits between community and enterprise', () => {
  const p = defaultEntitlements('professional');
  assert.ok(hasFeature(p, 'advanced_analytics'));
  assert.ok(hasFeature(p, 'api_access'));
  assert.ok(!hasFeature(p, 'white_label'));
});

test('requireFeature gates with a reason; never throws', () => {
  const c = defaultEntitlements('community');
  assert.equal(requireFeature(c, 'organization_branding').ok, true);
  const denied = requireFeature(c, 'white_label');
  assert.equal(denied.ok, false);
  if (!denied.ok) { assert.equal(denied.featureKey, 'white_label'); assert.ok(denied.reason.length > 0); }
});

test('withinLimit + remaining: unlimited always true', () => {
  const e = defaultEntitlements('enterprise');
  assert.ok(withinLimit(e, 'investigations_limit', 999999));
  assert.equal(remaining(e, 'investigations_limit', 5), Infinity);
  const c = defaultEntitlements('community');
  assert.ok(withinLimit(c, 'investigations_limit', 9999));
  assert.ok(!withinLimit(c, 'investigations_limit', 10000)); // at cap
  assert.equal(remaining(c, 'investigations_limit', 9990), 10);
});

test('hasFeature is false for an empty/unknown entitlement set', () => {
  assert.equal(hasFeature([], 'api_access'), false);
  assert.equal(getLimit([], 'investigations_limit'), null);
});

// ---- usage evaluation (Deliverable D/F) -------------------------------------

test('evaluateUsage: community high limits → all within, fractions sane', () => {
  const c = defaultEntitlements('community');
  const rows = evaluateUsage(c, { investigations: 12, publications: 6, contributors: 24 });
  assert.equal(rows.length, LIMITED_USAGE.length);
  assert.ok(rows.every((r) => r.withinLimit));
  const inv = rows.find((r) => r.key === 'investigations_limit')!;
  assert.equal(inv.used, 12);
  assert.ok(inv.fractionUsed > 0 && inv.fractionUsed < 0.01); // 12 / 10000
  assert.equal(anyLimitExceeded(c, { investigations: 12, publications: 6, contributors: 24 }), false);
});

test('evaluateUsage: enterprise unlimited → remaining Infinity, fraction 0', () => {
  const e = defaultEntitlements('enterprise');
  const rows = evaluateUsage(e, { investigations: 999999, publications: 1, contributors: 1 });
  const inv = rows.find((r) => r.key === 'investigations_limit')!;
  assert.equal(inv.limit, null);
  assert.equal(inv.remaining, Infinity);
  assert.equal(inv.fractionUsed, 0);
  assert.ok(inv.withinLimit);
});

test('evaluateUsage: at/over cap is flagged (framework signal, not enforced)', () => {
  // a tight custom entitlement set: investigations capped at 10
  const ents = [{ featureKey: 'investigations_limit' as const, enabled: true, limitValue: 10 }];
  const at = evaluateUsage(ents, { investigations: 10, publications: 0, contributors: 0 });
  const inv = at.find((r) => r.key === 'investigations_limit')!;
  assert.equal(inv.withinLimit, false); // 10 >= 10
  assert.equal(inv.remaining, 0);
  assert.equal(inv.fractionUsed, 1);
  assert.equal(anyLimitExceeded(ents, { investigations: 10, publications: 0, contributors: 0 }), true);
  assert.equal(anyLimitExceeded(ents, { investigations: 9, publications: 0, contributors: 0 }), false);
});

test('evaluateUsage: negative/missing counters floor at 0', () => {
  const c = defaultEntitlements('community');
  const rows = evaluateUsage(c, { investigations: -5, publications: 0, contributors: 0 });
  assert.ok(rows.every((r) => r.used >= 0));
});
