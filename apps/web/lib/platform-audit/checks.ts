// =============================================================================
// HSI Phase 73.2 — Deterministic audit checks (PURE). Each function turns REAL
// inputs (handed in by the DAL) into AuditIssue[]. No I/O, no fabrication; a
// check that cannot be evaluated returns NOT_OBSERVED / NOT_CONFIGURED.
// =============================================================================

import type { AuditIssue, AuditSeverity, AuditStatus, AuditArea } from './types';

function issue(i: Omit<AuditIssue, 'timestamp'>, nowIso: string): AuditIssue { return { ...i, timestamp: nowIso }; }

// ---- routing / RBAC consistency (pure code introspection) ------------------

export interface NavInputs {
  navVisibility: Record<string, string[]>;
  allNavHrefs: string[];
  protectedRoutes: { pattern: string; minRole: string }[];
}

/** Nav-restricted routes must (a) be real menu items and (b) be gated by
 *  middleware. A nav-hidden route with no PROTECTED_ROUTES gate is a real
 *  security gap (hidden in UI but reachable). */
export function checkRouteNav(input: NavInputs, nowIso: string): AuditIssue[] {
  const out: AuditIssue[] = [];
  const navKeys = Object.keys(input.navVisibility);

  const orphanNav = navKeys.filter((k) => !input.allNavHrefs.includes(k));
  out.push(issue({
    id: 'nav-invariant', title: 'Restricted nav routes are real menu items', area: 'routing',
    status: orphanNav.length === 0 ? 'PASS' : 'FAIL', severity: 'HIGH',
    explanation: orphanNav.length === 0 ? 'Every NAV_VISIBILITY key is present in ALL_NAV_HREFS.' : `Not in ALL_NAV_HREFS: ${orphanNav.join(', ')}.`,
    recommendedFix: orphanNav.length === 0 ? 'None.' : 'Add the route to ALL_NAV_HREFS or remove it from NAV_VISIBILITY.',
    source: 'nav-roles: NAV_VISIBILITY ⊆ ALL_NAV_HREFS',
  }, nowIso));

  const ungated = navKeys.filter((k) => !input.protectedRoutes.some((p) => k === p.pattern || k.startsWith(`${p.pattern}/`) || k.startsWith(p.pattern)));
  out.push(issue({
    id: 'nav-rbac-gate', title: 'Restricted nav routes are middleware-gated', area: 'rbac',
    status: ungated.length === 0 ? 'PASS' : 'WARNING', severity: 'HIGH',
    explanation: ungated.length === 0 ? 'Every restricted nav route has a matching PROTECTED_ROUTES prefix.' : `Hidden in nav but no middleware gate: ${ungated.join(', ')}.`,
    recommendedFix: ungated.length === 0 ? 'None.' : 'Add a PROTECTED_ROUTES entry so the route is enforced server-side, not just hidden.',
    source: 'rbac-audit: PROTECTED_ROUTES vs NAV_VISIBILITY',
  }, nowIso));

  return out;
}

// ---- environment variables (presence only, never values) -------------------

export interface EnvInputs { present: Record<string, boolean> }
const REQUIRED_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_APP_URL'];
const RECOMMENDED_ENV = ['SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'];
const OPTIONAL_ENV = ['RESEND_API_KEY'];

export function checkEnv(input: EnvInputs, nowIso: string): AuditIssue[] {
  const mk = (name: string, tier: 'required' | 'recommended' | 'optional'): AuditIssue => {
    const ok = input.present[name] === true;
    let status: AuditStatus; let severity: AuditSeverity; let fix: string;
    if (ok) { status = 'PASS'; severity = 'LOW'; fix = 'None.'; }
    else if (tier === 'required') { status = 'FAIL'; severity = 'CRITICAL'; fix = `Set ${name} in the environment.`; }
    else if (tier === 'recommended') { status = 'WARNING'; severity = 'MEDIUM'; fix = `Set ${name} for full functionality (e.g. cached public reads / cron auth).`; }
    else { status = 'NOT_CONFIGURED'; severity = 'LOW'; fix = `Optional: set ${name} when the feature is wired.`; }
    return issue({ id: `env-${name}`, title: `Env: ${name}`, status, severity, area: 'environment', explanation: ok ? 'Present.' : `Not set (${tier}).`, recommendedFix: fix, source: 'process.env presence' }, nowIso);
  };
  return [
    ...REQUIRED_ENV.map((n) => mk(n, 'required')),
    ...RECOMMENDED_ENV.map((n) => mk(n, 'recommended')),
    ...OPTIONAL_ENV.map((n) => mk(n, 'optional')),
  ];
}

// ---- subsystem health (map probe states) -----------------------------------

export interface SubsystemInput { name: string; state: string; detail?: string }
const STATE_MAP: Record<string, { status: AuditStatus; severity: AuditSeverity }> = {
  ok: { status: 'PASS', severity: 'LOW' }, degraded: { status: 'WARNING', severity: 'MEDIUM' },
  down: { status: 'FAIL', severity: 'CRITICAL' }, unconfigured: { status: 'NOT_CONFIGURED', severity: 'LOW' },
  unknown: { status: 'NOT_OBSERVED', severity: 'LOW' },
};
export function checkSubsystems(subsystems: SubsystemInput[], nowIso: string): AuditIssue[] {
  if (subsystems.length === 0) return [issue({ id: 'infra-health', title: 'Infrastructure health probes', status: 'NOT_OBSERVED', severity: 'MEDIUM', area: 'infrastructure', explanation: 'No health probes returned.', recommendedFix: 'Check the health endpoints / probes.', source: 'lib/infra/probes' }, nowIso)];
  const areaOf = (name: string): AuditArea => /storage/i.test(name) ? 'storage' : /supabase|auth|rest|db|database/i.test(name) ? 'supabase' : 'infrastructure';
  return subsystems.map((s) => {
    const m = STATE_MAP[s.state.toLowerCase()] ?? { status: 'NOT_OBSERVED' as AuditStatus, severity: 'LOW' as AuditSeverity };
    return issue({ id: `subsystem-${s.name}`, title: `Subsystem: ${s.name}`, status: m.status, severity: m.severity, area: areaOf(s.name), explanation: s.detail ?? `State: ${s.state}.`, recommendedFix: m.status === 'PASS' ? 'None.' : `Investigate ${s.name}.`, source: 'lib/infra/probes' }, nowIso);
  });
}

// ---- migration status ------------------------------------------------------

export interface MigrationInput { verifiable: boolean; ok: boolean; applied: number; missing: number; total: number }
export function checkMigrations(m: MigrationInput | null, nowIso: string): AuditIssue {
  if (!m) return issue({ id: 'migrations', title: 'Database migrations', status: 'NOT_OBSERVED', severity: 'MEDIUM', area: 'migrations', explanation: 'Migration status could not be read (not admin / not configured / offline).', recommendedFix: 'Verify Supabase access and re-run.', source: 'lib/launch migration audit' }, nowIso);
  if (!m.verifiable) return issue({ id: 'migrations', title: 'Database migrations', status: 'NOT_OBSERVED', severity: 'MEDIUM', area: 'migrations', explanation: 'Applied set could not be determined.', recommendedFix: 'Grant read on the migrations table or check connectivity.', source: 'lib/launch migration audit' }, nowIso);
  const status: AuditStatus = m.missing === 0 && m.ok ? 'PASS' : 'FAIL';
  return issue({ id: 'migrations', title: 'Database migrations', status, severity: status === 'PASS' ? 'LOW' : 'HIGH', area: 'migrations', explanation: `${m.applied}/${m.total} applied, ${m.missing} missing.`, recommendedFix: status === 'PASS' ? 'None.' : 'Apply the missing migrations to the target database.', source: 'lib/launch migration audit' }, nowIso);
}

// ---- recent error events ---------------------------------------------------

export function checkErrorEvents(recentErrorCount: number | null, nowIso: string): AuditIssue {
  if (recentErrorCount == null) return issue({ id: 'error-events', title: 'Recent error events', status: 'NOT_OBSERVED', severity: 'LOW', area: 'infrastructure', explanation: 'Event log could not be read.', recommendedFix: 'Check the infra_events table access.', source: 'lib/infra events' }, nowIso);
  const status: AuditStatus = recentErrorCount === 0 ? 'PASS' : 'WARNING';
  return issue({ id: 'error-events', title: 'Recent error events', status, severity: recentErrorCount > 10 ? 'HIGH' : 'MEDIUM', area: 'infrastructure', explanation: `${recentErrorCount} error/critical infra event(s) recently recorded.`, recommendedFix: status === 'PASS' ? 'None.' : 'Review the Infrastructure events log for repeated errors.', source: 'lib/infra events' }, nowIso);
}

// ---- metadata (cannot be introspected at runtime → NOT_OBSERVED) -----------

/** Next.js page metadata is resolved per-render and is not enumerable at
 *  runtime, so the auditor cannot verify it programmatically here. Reported
 *  honestly as NOT_OBSERVED rather than a fabricated PASS. */
export function checkMetadata(nowIso: string): AuditIssue {
  return issue({
    id: 'metadata-coverage', title: 'Public page SEO metadata', status: 'NOT_OBSERVED', severity: 'LOW', area: 'metadata',
    explanation: 'Next.js metadata is resolved per-render and is not enumerable at runtime; it cannot be verified from here.',
    recommendedFix: 'Verify title/description/canonical in each marketing page export, or add a build-time metadata lint in a future phase.',
    source: 'static review (runtime introspection unavailable)',
  }, nowIso);
}

// ---- geospatial health (Phase 73.3) ----------------------------------------

export interface GeoHealthInput {
  glyphsConfigured: boolean;     // MapLibre style declares a glyphs source (config fact)
  layerCount: number;            // number of map layers wired
  expectedLayers: number;
  readiness: { geoReady: number; totalSources: number; signalsInheritingGeo: number; narrativesInheritingGeo: number } | null; // null = could not read
}

export function checkGeospatial(input: GeoHealthInput, nowIso: string): AuditIssue[] {
  const out: AuditIssue[] = [];

  out.push(issue({
    id: 'geo-glyphs', title: 'MapLibre glyphs configured', area: 'global_map',
    status: input.glyphsConfigured ? 'PASS' : 'FAIL', severity: 'HIGH',
    explanation: input.glyphsConfigured ? 'The map style declares a glyphs source, so cluster-count labels render.' : 'No glyphs source declared — symbol layers using text-field will error.',
    recommendedFix: input.glyphsConfigured ? 'None.' : 'Add a `glyphs` PBF endpoint to the MapLibre style.',
    source: 'MapLibre style config',
  }, nowIso));

  out.push(issue({
    id: 'geo-layers', title: 'Map layers available', area: 'global_map',
    status: input.layerCount >= input.expectedLayers ? 'PASS' : 'WARNING', severity: 'MEDIUM',
    explanation: `${input.layerCount}/${input.expectedLayers} layers wired (Sources/Narratives/Evidence/Forecasts/Contradictions/Trust/Blind spots).`,
    recommendedFix: input.layerCount >= input.expectedLayers ? 'None.' : 'Restore the missing map layer(s).',
    source: 'narrative-map MAP_LAYERS',
  }, nowIso));

  // runtime MapLibre health is a client concern — not observable server-side.
  out.push(issue({ id: 'geo-maplibre-runtime', title: 'MapLibre runtime health', area: 'global_map', status: 'NOT_OBSERVED', severity: 'LOW', explanation: 'The map engine runs client-side; its runtime state is not observable from the server.', recommendedFix: 'Check the browser console on /dashboard/global-map.', source: 'client runtime (not introspectable here)' }, nowIso));

  if (!input.readiness) {
    out.push(issue({ id: 'geo-readiness', title: 'Geo readiness', area: 'global_map', status: 'NOT_OBSERVED', severity: 'MEDIUM', explanation: 'Geo readiness could not be computed.', recommendedFix: 'Verify Supabase access and re-run.', source: 'global-map readiness' }, nowIso));
    return out;
  }

  const { geoReady, totalSources, signalsInheritingGeo, narrativesInheritingGeo } = input.readiness;
  out.push(issue({
    id: 'geo-readiness', title: 'Geo-ready sources', area: 'global_map',
    status: geoReady > 0 ? 'PASS' : 'WARNING', severity: geoReady > 0 ? 'LOW' : 'MEDIUM',
    explanation: `${geoReady}/${totalSources} sources are geo-ready (have real coordinates).`,
    recommendedFix: geoReady > 0 ? 'None.' : 'Run "Backfill Geographic Data" to deterministically enrich known sources.',
    source: 'global-map readiness',
  }, nowIso));

  out.push(issue({
    id: 'geo-inheritance', title: 'Geo inheritance (signals / narratives)', area: 'global_map',
    status: geoReady === 0 ? 'NOT_OBSERVED' : (signalsInheritingGeo > 0 || narrativesInheritingGeo > 0) ? 'PASS' : 'WARNING', severity: 'LOW',
    explanation: geoReady === 0 ? 'No geo-ready sources yet, so nothing inherits geo.' : `${signalsInheritingGeo} signals and ${narrativesInheritingGeo} narratives inherit geo from a geo-ready source.`,
    recommendedFix: (geoReady > 0 && signalsInheritingGeo === 0 && narrativesInheritingGeo === 0) ? 'Link signals to geo-ready sources (Signal → Source path).' : 'None.',
    source: 'narrative-map inheritance rollup',
  }, nowIso));

  return out;
}

// ---- conversion readiness (beta/demo) --------------------------------------

export interface ConversionInput { betaRoute: boolean; demoRoute: boolean; betaApi: boolean; demoApi: boolean; formsBackendWired: boolean }
export function checkConversion(c: ConversionInput, nowIso: string): AuditIssue[] {
  const routesOk = c.betaRoute && c.demoRoute;
  const apisOk = c.betaApi && c.demoApi;
  return [
    issue({ id: 'conversion-routes', title: 'Beta & demo pages present', status: routesOk ? 'PASS' : 'FAIL', severity: 'MEDIUM', area: 'conversion', explanation: routesOk ? '/beta and /demo routes exist.' : 'A conversion route is missing.', recommendedFix: routesOk ? 'None.' : 'Restore the missing /beta or /demo route.', source: 'route registry' }, nowIso),
    issue({ id: 'conversion-apis', title: 'Beta & demo intake endpoints present', status: apisOk ? 'PASS' : 'FAIL', severity: 'MEDIUM', area: 'forms', explanation: apisOk ? '/api/beta/apply and /api/demo/request exist.' : 'A conversion API is missing.', recommendedFix: apisOk ? 'None.' : 'Restore the missing intake endpoint.', source: 'route registry' }, nowIso),
    issue({ id: 'conversion-backend', title: 'Conversion form backend wired', status: c.formsBackendWired ? 'PASS' : 'NOT_CONFIGURED', severity: 'MEDIUM', area: 'forms', explanation: c.formsBackendWired ? 'Submissions are persisted/forwarded.' : 'Beta/demo forms validate + succeed but do not yet persist or email (placeholder).', recommendedFix: c.formsBackendWired ? 'None.' : 'Wire Supabase/Resend/CRM behind /api/beta/apply and /api/demo/request (see TODOs).', source: 'app/api/beta, app/api/demo' }, nowIso),
  ];
}
