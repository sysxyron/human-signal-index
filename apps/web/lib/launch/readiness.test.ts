import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeReadiness, type ReadinessInput } from './readiness';

function input(o: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    appUrlConfigured: true,
    supabaseConfigured: true,
    supabaseReachable: true,
    authReachable: true,
    storageReachable: true,
    serviceRoleConfigured: true,
    requiredEnvMissing: [],
    migration: { ok: true, missing: 0, outOfOrder: 0, failed: 0, verifiable: true },
    rbac: { resolverOk: true, resolvedRole: 'admin' },
    testerCount: 3,
    openBlockers: 0,
    debugEndpointHardened: true,
    ...o,
  };
}

test('fully healthy → GREEN, score 100, READY', () => {
  const r = computeReadiness(input());
  assert.equal(r.overall, 'GREEN');
  assert.equal(r.score, 100);
  assert.equal(r.recommendation, 'READY');
  assert.equal(r.blockers.length, 0);
  for (const a of Object.values(r.areas)) assert.equal(a, 'GREEN');
});

test('missing supabase → RED blocker, NOT READY', () => {
  const r = computeReadiness(input({ supabaseConfigured: false, supabaseReachable: null }));
  assert.equal(r.overall, 'RED');
  assert.equal(r.recommendation, 'NOT READY');
  assert.ok(r.blockers.some((b) => b.key === 'supabase_configured'));
  assert.equal(r.areas.production, 'RED');
});

test('missing required env → RED deployment blocker', () => {
  const r = computeReadiness(input({ requiredEnvMissing: ['NEXT_PUBLIC_APP_URL'] }));
  assert.equal(r.areas.deployment, 'RED');
  assert.ok(r.blockers.some((b) => b.key === 'required_env'));
  assert.equal(r.recommendation, 'NOT READY');
});

test('migration missing → RED migration blocker', () => {
  const r = computeReadiness(input({ migration: { ok: false, missing: 2, outOfOrder: 0, failed: 0, verifiable: true } }));
  assert.equal(r.areas.migration, 'RED');
  assert.ok(r.blockers.some((b) => b.key === 'migrations'));
});

test('migration unverifiable → YELLOW, not a blocker', () => {
  const r = computeReadiness(input({ migration: { ok: false, missing: 0, outOfOrder: 0, failed: 0, verifiable: false } }));
  assert.equal(r.areas.migration, 'YELLOW');
  assert.ok(!r.blockers.some((b) => b.key === 'migrations'));
});

test('rbac resolver broken → RED role blocker', () => {
  const r = computeReadiness(input({ rbac: { resolverOk: false, resolvedRole: null } }));
  assert.equal(r.areas.role, 'RED');
  assert.ok(r.blockers.some((b) => b.key === 'rbac_resolver'));
});

test('open blockers → RED deployment blocker', () => {
  const r = computeReadiness(input({ openBlockers: 2 }));
  assert.ok(r.blockers.some((b) => b.key === 'open_blockers'));
  assert.equal(r.recommendation, 'NOT READY');
});

test('debug endpoint not hardened → RED security blocker', () => {
  const r = computeReadiness(input({ debugEndpointHardened: false }));
  assert.equal(r.areas.security, 'RED');
  assert.ok(r.blockers.some((b) => b.key === 'debug_endpoint'));
});

test('service role missing → YELLOW deployment, still READY (no blocker, score high)', () => {
  const r = computeReadiness(input({ serviceRoleConfigured: false }));
  assert.equal(r.areas.deployment, 'YELLOW');
  assert.equal(r.blockers.length, 0);
  assert.equal(r.overall, 'YELLOW');
  // Beta policy: READY requires no blockers + score >= 80 (YELLOW areas allowed).
  assert.equal(r.recommendation, 'READY');
});

test('unknown connectivity/testers → YELLOW, no blocker', () => {
  const r = computeReadiness(input({ supabaseReachable: null, authReachable: null, storageReachable: null, testerCount: null }));
  assert.equal(r.blockers.length, 0);
  assert.equal(r.areas.production, 'YELLOW');
  assert.equal(r.areas.tester, 'YELLOW');
});

test('zero testers → YELLOW tester area', () => {
  const r = computeReadiness(input({ testerCount: 0 }));
  assert.equal(r.areas.tester, 'YELLOW');
});

test('score reflects yellow as half credit', () => {
  // one yellow check out of N → score < 100 but > 0
  const r = computeReadiness(input({ serviceRoleConfigured: false }));
  assert.ok(r.score < 100 && r.score >= 90);
});

test('every check maps to a known area', () => {
  const r = computeReadiness(input());
  const areas = new Set(['production', 'migration', 'role', 'tester', 'deployment', 'security']);
  for (const c of r.checks) assert.ok(areas.has(c.area), `unknown area ${c.area}`);
});

test('deterministic', () => {
  assert.deepEqual(computeReadiness(input()), computeReadiness(input()));
});
