import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkRouteNav, checkEnv, checkSubsystems, checkMigrations, checkErrorEvents, checkConversion, checkGeospatial, checkGeoIntegrity, checkRuntimeConfig, checkReadRouting, checkOperationsRuntime, checkDatabaseHealth, type RuntimeConfigInput, type ReadRoutingAuditInput, type OperationsRuntimeInput } from './checks';
import { sortIssues, readinessScore, summarizeAudit, recommendations } from './summary';
import { AUDIT_STATUSES, type AuditIssue } from './types';

const NOW = '2026-06-20T00:00:00.000Z';

// ---- route / nav / RBAC mismatch -------------------------------------------

test('checkRouteNav: consistent registries → PASS', () => {
  const out = checkRouteNav({
    navVisibility: { '/dashboard/x': ['reviewer'] }, allNavHrefs: ['/dashboard/x'],
    protectedRoutes: [{ pattern: '/dashboard/x', minRole: 'reviewer' }],
  }, NOW);
  assert.equal(out.find((i) => i.id === 'nav-invariant')?.status, 'PASS');
  assert.equal(out.find((i) => i.id === 'nav-rbac-gate')?.status, 'PASS');
});
test('checkRouteNav: nav key missing from ALL_NAV_HREFS → FAIL', () => {
  const out = checkRouteNav({ navVisibility: { '/dashboard/x': ['reviewer'] }, allNavHrefs: [], protectedRoutes: [{ pattern: '/dashboard/x', minRole: 'reviewer' }] }, NOW);
  assert.equal(out.find((i) => i.id === 'nav-invariant')?.status, 'FAIL');
});
test('checkRouteNav: nav-restricted but ungated → WARNING (security gap)', () => {
  const out = checkRouteNav({ navVisibility: { '/dashboard/x': ['reviewer'] }, allNavHrefs: ['/dashboard/x'], protectedRoutes: [] }, NOW);
  assert.equal(out.find((i) => i.id === 'nav-rbac-gate')?.status, 'WARNING');
});

// ---- env presence ----------------------------------------------------------

test('checkEnv: required missing → FAIL/CRITICAL; present → PASS; optional → NOT_CONFIGURED', () => {
  const out = checkEnv({ present: { NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true, NEXT_PUBLIC_APP_URL: false } }, NOW);
  assert.equal(out.find((i) => i.id === 'env-NEXT_PUBLIC_SUPABASE_URL')?.status, 'PASS');
  const appUrl = out.find((i) => i.id === 'env-NEXT_PUBLIC_APP_URL');
  assert.equal(appUrl?.status, 'FAIL'); assert.equal(appUrl?.severity, 'CRITICAL');
  assert.equal(out.find((i) => i.id === 'env-RESEND_API_KEY')?.status, 'NOT_CONFIGURED');
  assert.equal(out.find((i) => i.id === 'env-SUPABASE_SERVICE_ROLE_KEY')?.status, 'WARNING');
});
test('checkEnv: never exposes values (presence booleans only)', () => {
  const out = checkEnv({ present: { NEXT_PUBLIC_SUPABASE_URL: true } }, NOW);
  for (const i of out) assert.ok(!/=|secret|key=/i.test(i.explanation));
});

// ---- subsystem health mapping ----------------------------------------------

test('checkSubsystems: maps probe states deterministically', () => {
  const out = checkSubsystems([{ name: 'supabase', state: 'ok' }, { name: 'storage', state: 'down' }, { name: 'auth', state: 'unknown' }], NOW);
  assert.equal(out.find((i) => i.title.includes('supabase'))?.status, 'PASS');
  const storage = out.find((i) => i.title.includes('storage'));
  assert.equal(storage?.status, 'FAIL'); assert.equal(storage?.area, 'storage');
  assert.equal(out.find((i) => i.title.includes('auth'))?.status, 'NOT_OBSERVED');
});
test('checkSubsystems: no probes → NOT_OBSERVED', () => {
  assert.equal(checkSubsystems([], NOW)[0].status, 'NOT_OBSERVED');
});

// ---- migrations ------------------------------------------------------------

test('checkMigrations: ok → PASS; missing → FAIL; null/unverifiable → NOT_OBSERVED', () => {
  assert.equal(checkMigrations({ verifiable: true, ok: true, applied: 58, missing: 0, total: 58 }, NOW).status, 'PASS');
  assert.equal(checkMigrations({ verifiable: true, ok: false, applied: 50, missing: 8, total: 58 }, NOW).status, 'FAIL');
  assert.equal(checkMigrations(null, NOW).status, 'NOT_OBSERVED');
  assert.equal(checkMigrations({ verifiable: false, ok: false, applied: 0, missing: 0, total: 58 }, NOW).status, 'NOT_OBSERVED');
});

// ---- error events ----------------------------------------------------------

test('checkErrorEvents: 0 → PASS; >0 → WARNING; null → NOT_OBSERVED', () => {
  assert.equal(checkErrorEvents(0, NOW).status, 'PASS');
  assert.equal(checkErrorEvents(3, NOW).status, 'WARNING');
  assert.equal(checkErrorEvents(20, NOW).severity, 'HIGH');
  assert.equal(checkErrorEvents(null, NOW).status, 'NOT_OBSERVED');
});

// ---- conversion ------------------------------------------------------------

test('checkConversion: routes/apis present; placeholder backend → NOT_CONFIGURED', () => {
  const out = checkConversion({ betaRoute: true, demoRoute: true, betaApi: true, demoApi: true, formsBackendWired: false }, NOW);
  assert.equal(out.find((i) => i.id === 'conversion-routes')?.status, 'PASS');
  assert.equal(out.find((i) => i.id === 'conversion-backend')?.status, 'NOT_CONFIGURED');
});

// ---- geospatial health (Phase 73.3) ----------------------------------------

test('checkGeospatial: glyphs configured → PASS; not → FAIL', () => {
  const ok = checkGeospatial({ glyphsConfigured: true, layerCount: 7, expectedLayers: 7, readiness: { geoReady: 5, totalSources: 159, signalsInheritingGeo: 3, narrativesInheritingGeo: 1 } }, NOW);
  assert.equal(ok.find((i) => i.id === 'geo-glyphs')?.status, 'PASS');
  const bad = checkGeospatial({ glyphsConfigured: false, layerCount: 7, expectedLayers: 7, readiness: null }, NOW);
  assert.equal(bad.find((i) => i.id === 'geo-glyphs')?.status, 'FAIL');
});
test('checkGeospatial: geoReady>0 → PASS; 0 → WARNING; readiness null → NOT_OBSERVED', () => {
  assert.equal(checkGeospatial({ glyphsConfigured: true, layerCount: 7, expectedLayers: 7, readiness: { geoReady: 12, totalSources: 159, signalsInheritingGeo: 4, narrativesInheritingGeo: 2 } }, NOW).find((i) => i.id === 'geo-readiness')?.status, 'PASS');
  assert.equal(checkGeospatial({ glyphsConfigured: true, layerCount: 7, expectedLayers: 7, readiness: { geoReady: 0, totalSources: 159, signalsInheritingGeo: 0, narrativesInheritingGeo: 0 } }, NOW).find((i) => i.id === 'geo-readiness')?.status, 'WARNING');
  assert.equal(checkGeospatial({ glyphsConfigured: true, layerCount: 7, expectedLayers: 7, readiness: null }, NOW).find((i) => i.id === 'geo-readiness')?.status, 'NOT_OBSERVED');
});
test('checkGeospatial: runtime health is NOT_OBSERVED (client-side)', () => {
  assert.equal(checkGeospatial({ glyphsConfigured: true, layerCount: 7, expectedLayers: 7, readiness: null }, NOW).find((i) => i.id === 'geo-maplibre-runtime')?.status, 'NOT_OBSERVED');
});
test('checkGeoIntegrity: all Points → PASS; invalid → WARNING with counts; null → NOT_OBSERVED', () => {
  assert.equal(checkGeoIntegrity({ total: 10, point: 10, invalid: 0, byType: { Point: 10, INVALID: 0 } }, NOW).status, 'PASS');
  const w = checkGeoIntegrity({ total: 10, point: 8, invalid: 2, byType: { Point: 8, INVALID: 2 } }, NOW);
  assert.equal(w.status, 'WARNING'); assert.match(w.explanation, /2 of 10/);
  assert.equal(checkGeoIntegrity(null, NOW).status, 'NOT_OBSERVED');
});

// ---- runtime config (Phase 74.1) -------------------------------------------

function rc(over: Partial<RuntimeConfigInput> = {}): RuntimeConfigInput {
  return { source: 'edge-config', maintenanceBanner: false, betaSignupOpen: true, globalMapEnabled: true, sourceIngestEnabled: true, protectedReadMode: false, publicReadsSource: 'primary', dashboardReadsSource: 'primary', primaryDbHealth: 'healthy', ...over };
}
test('checkRuntimeConfig: all nominal → PASS; intentional disables are WARNING not FAIL', () => {
  const ok = checkRuntimeConfig(rc(), NOW);
  assert.ok(ok.every((i) => i.status === 'PASS'));
  const off = checkRuntimeConfig(rc({ globalMapEnabled: false, sourceIngestEnabled: false, betaSignupOpen: false, maintenanceBanner: true, protectedReadMode: true }), NOW);
  assert.equal(off.find((i) => i.id === 'runtime-global-map')?.status, 'WARNING');
  assert.equal(off.find((i) => i.id === 'runtime-source-ingest')?.status, 'WARNING');
  assert.ok(off.every((i) => i.status !== 'FAIL')); // intentional disables never FAIL
});
test('checkRuntimeConfig: edge config source maps to status', () => {
  assert.equal(checkRuntimeConfig(rc({ source: 'edge-config' }), NOW).find((i) => i.id === 'runtime-edge-config')?.status, 'PASS');
  assert.equal(checkRuntimeConfig(rc({ source: 'defaults' }), NOW).find((i) => i.id === 'runtime-edge-config')?.status, 'NOT_OBSERVED');
  assert.equal(checkRuntimeConfig(rc({ source: 'error-fallback' }), NOW).find((i) => i.id === 'runtime-edge-config')?.status, 'WARNING');
});
test('checkRuntimeConfig: non-primary read source warns; down DB fails', () => {
  assert.equal(checkRuntimeConfig(rc({ publicReadsSource: 'replica' }), NOW).find((i) => i.id === 'runtime-reads-public')?.status, 'WARNING');
  assert.equal(checkRuntimeConfig(rc({ primaryDbHealth: 'down' }), NOW).find((i) => i.id === 'runtime-db-health')?.status, 'FAIL');
});

// ---- read routing (Phase 74.2) ---------------------------------------------

function rr(over: Partial<ReadRoutingAuditInput> = {}): ReadRoutingAuditInput {
  return {
    public: { requestedBackend: 'primary', effectiveBackend: 'primary', fallbackReason: null },
    dashboard: { requestedBackend: 'primary', effectiveBackend: 'primary', fallbackReason: null },
    availability: { primary: true, replica: false, d1: false, cache: false }, ...over,
  };
}
test('checkReadRouting: primary selected + available → PASS; unavailable backends → NOT_OBSERVED', () => {
  const out = checkReadRouting(rr(), NOW);
  assert.equal(out.find((i) => i.id === 'read-public')?.status, 'PASS');
  assert.equal(out.find((i) => i.id === 'read-backend-primary')?.status, 'PASS');
  assert.equal(out.find((i) => i.id === 'read-backend-replica')?.status, 'NOT_OBSERVED');
  assert.ok(out.every((i) => i.status !== 'FAIL'));
});
test('checkReadRouting: non-primary requested but unavailable → WARNING (fell back)', () => {
  const out = checkReadRouting(rr({ public: { requestedBackend: 'replica', effectiveBackend: 'primary', fallbackReason: 'replica is unavailable' } }), NOW);
  assert.equal(out.find((i) => i.id === 'read-public')?.status, 'WARNING');
});
test('checkReadRouting: primary unavailable → FAIL', () => {
  const out = checkReadRouting(rr({ availability: { primary: false, replica: false, d1: false, cache: false } }), NOW);
  assert.equal(out.find((i) => i.id === 'read-backend-primary')?.status, 'FAIL');
  assert.equal(out.find((i) => i.id === 'read-public')?.status, 'FAIL');
});

// ---- database health (Phase 74.4) ------------------------------------------

test('checkDatabaseHealth: status maps healthy/degraded/down/unknown', () => {
  assert.equal(checkDatabaseHealth({ status: 'healthy', latencyMs: 40, probe: 'table_read' }, NOW).status, 'PASS');
  assert.equal(checkDatabaseHealth({ status: 'degraded', latencyMs: 3000, probe: 'table_read' }, NOW).status, 'WARNING');
  const down = checkDatabaseHealth({ status: 'down', latencyMs: null, probe: 'table_read' }, NOW);
  assert.equal(down.status, 'FAIL'); assert.equal(down.severity, 'CRITICAL');
  assert.equal(checkDatabaseHealth({ status: 'unknown', latencyMs: null, probe: 'unavailable' }, NOW).status, 'NOT_OBSERVED');
});

// ---- operations runtime (Phase 74.3) ---------------------------------------

function ops(over: Partial<OperationsRuntimeInput> = {}): OperationsRuntimeInput {
  return { source: 'edge-config', flagsValid: true, routingResolved: true, routingFellBack: false, availability: { primary: true, replica: false, d1: false, cache: false }, ...over };
}
test('checkOperationsRuntime: nominal → primary PASS, others NOT_OBSERVED, no FAIL', () => {
  const out = checkOperationsRuntime(ops(), NOW);
  assert.equal(out.find((i) => i.id === 'ops-edge-config')?.status, 'PASS');
  assert.equal(out.find((i) => i.id === 'ops-flags-valid')?.status, 'PASS');
  assert.equal(out.find((i) => i.id === 'ops-read-routing')?.status, 'PASS');
  assert.equal(out.find((i) => i.id === 'ops-backend-primary')?.status, 'PASS');
  assert.equal(out.find((i) => i.id === 'ops-backend-replica')?.status, 'NOT_OBSERVED');
  assert.equal(out.find((i) => i.id === 'ops-backend-d1')?.status, 'NOT_OBSERVED');
  assert.equal(out.find((i) => i.id === 'ops-backend-cache')?.status, 'NOT_OBSERVED');
  assert.ok(out.every((i) => i.status !== 'FAIL'));
});
test('checkOperationsRuntime: edge-config error → WARNING; defaults → NOT_OBSERVED', () => {
  assert.equal(checkOperationsRuntime(ops({ source: 'error-fallback' }), NOW).find((i) => i.id === 'ops-edge-config')?.status, 'WARNING');
  assert.equal(checkOperationsRuntime(ops({ source: 'defaults' }), NOW).find((i) => i.id === 'ops-edge-config')?.status, 'NOT_OBSERVED');
});
test('checkOperationsRuntime: invalid flags → FAIL; routing fallback → WARNING', () => {
  assert.equal(checkOperationsRuntime(ops({ flagsValid: false }), NOW).find((i) => i.id === 'ops-flags-valid')?.status, 'FAIL');
  assert.equal(checkOperationsRuntime(ops({ routingFellBack: true }), NOW).find((i) => i.id === 'ops-read-routing')?.status, 'WARNING');
});
test('checkOperationsRuntime: primary unavailable → FAIL on primary + routing', () => {
  const out = checkOperationsRuntime(ops({ availability: { primary: false, replica: false, d1: false, cache: false } }), NOW);
  assert.equal(out.find((i) => i.id === 'ops-backend-primary')?.status, 'FAIL');
  assert.equal(out.find((i) => i.id === 'ops-read-routing')?.status, 'FAIL');
});

// ---- summary / sort / score ------------------------------------------------

function mk(over: Partial<AuditIssue>): AuditIssue {
  return { id: 'x', title: 'X', status: 'PASS', severity: 'LOW', area: 'routing', explanation: '', recommendedFix: '', source: '', timestamp: NOW, ...over };
}

test('sortIssues: FAIL before WARNING before PASS; severity within status', () => {
  const sorted = sortIssues([mk({ status: 'PASS' }), mk({ status: 'WARNING', severity: 'LOW' }), mk({ status: 'FAIL', severity: 'HIGH' }), mk({ status: 'FAIL', severity: 'CRITICAL' })]);
  assert.deepEqual(sorted.map((i) => `${i.status}:${i.severity}`), ['FAIL:CRITICAL', 'FAIL:HIGH', 'WARNING:LOW', 'PASS:LOW']);
});
test('readinessScore: penalizes FAIL/WARNING only; NOT_* never penalize; clamped', () => {
  assert.equal(readinessScore([mk({ status: 'PASS' })]), 100);
  assert.equal(readinessScore([mk({ status: 'NOT_OBSERVED', severity: 'CRITICAL' }), mk({ status: 'NOT_CONFIGURED', severity: 'HIGH' })]), 100);
  assert.equal(readinessScore([mk({ status: 'FAIL', severity: 'CRITICAL' })]), 75);
  assert.equal(readinessScore([mk({ status: 'WARNING', severity: 'CRITICAL' })]), 87); // 100 - round(25/2)=13
  assert.equal(readinessScore(Array.from({ length: 10 }, () => mk({ status: 'FAIL', severity: 'CRITICAL' }))), 0); // clamped
});
test('summarizeAudit: counts + overall status + no fabrication on empty', () => {
  const empty = summarizeAudit([]);
  assert.equal(empty.total, 0); assert.equal(empty.overall, 'GREEN'); assert.equal(empty.readinessScore, 100);
  const s = summarizeAudit([mk({ status: 'PASS', area: 'routing' }), mk({ status: 'WARNING', area: 'forms', severity: 'MEDIUM' }), mk({ status: 'FAIL', area: 'environment', severity: 'CRITICAL' })]);
  assert.equal(s.overall, 'RED');
  assert.equal(s.byStatus.FAIL, 1); assert.equal(s.byStatus.WARNING, 1); assert.equal(s.byStatus.PASS, 1);
  assert.equal(s.bySeverity.CRITICAL, 1);
  assert.ok(s.byArea.find((a) => a.area === 'environment')?.problems === 1);
});
test('recommendations: worst-first fix list, problems only', () => {
  const recs = recommendations([mk({ status: 'PASS', recommendedFix: 'none' }), mk({ status: 'FAIL', severity: 'CRITICAL', title: 'DB', recommendedFix: 'fix db' })]);
  assert.equal(recs.length, 1); assert.match(recs[0], /DB: fix db/);
});
test('all statuses are part of the vocabulary', () => {
  assert.equal(AUDIT_STATUSES.length, 5);
});
