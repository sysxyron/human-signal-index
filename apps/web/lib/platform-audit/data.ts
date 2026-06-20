// =============================================================================
// HSI Phase 73.2 — Platform Self-Check Auditor DAL (SERVER-ONLY, admin). Gathers
// REAL inputs — env presence, infra probes, migration audit, recent error events,
// and the route/nav/RBAC registries — and runs the pure deterministic checks into
// a PlatformAuditReport. No fabricated results; unreadable inputs → NOT_OBSERVED.
// Never throws (degrades). NOT cached (it reads cookies + reflects live state).
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { NAV_VISIBILITY, ALL_NAV_HREFS } from '@hsi/ui';
import { PROTECTED_ROUTES } from '@/lib/security/rbac-audit';
import { getInfrastructureHealth } from '@/lib/infra/probes';
import { getMigrationAudit } from '@/lib/launch/persistence';
import { listInfraEventsDal } from '@/lib/infra/persistence';
import { getPhase72Readiness } from '@/lib/global-map/data';
import {
  checkRouteNav, checkEnv, checkSubsystems, checkMigrations, checkErrorEvents, checkConversion, checkMetadata, checkGeospatial,
} from './checks';
import { summarizeAudit, sortIssues, recommendations, isProblem } from './summary';
import type { PlatformAuditReport, AuditIssue } from './types';

function envPresent(name: string): boolean { const v = process.env[name]; return typeof v === 'string' && v.trim().length > 0; }

export async function getPlatformAuditReport(): Promise<PlatformAuditReport> {
  const nowIso = new Date().toISOString();
  const issues: AuditIssue[] = [];

  // ---- pure registry checks (always available) -----------------------------
  issues.push(...checkRouteNav({
    navVisibility: NAV_VISIBILITY as Record<string, string[]>,
    allNavHrefs: ALL_NAV_HREFS,
    protectedRoutes: PROTECTED_ROUTES.map((p) => ({ pattern: p.pattern, minRole: p.minRole })),
  }, nowIso));

  // ---- environment presence -------------------------------------------------
  const envNames = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_APP_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'RESEND_API_KEY'];
  const present: Record<string, boolean> = {};
  for (const n of envNames) present[n] = envPresent(n);
  issues.push(...checkEnv({ present }, nowIso));

  // ---- metadata (NOT_OBSERVED — not runtime-introspectable) -----------------
  issues.push(checkMetadata(nowIso));

  // ---- infra probes (supabase / auth / rest / storage) ---------------------
  const subsystems = await getInfrastructureHealth().catch(() => []);
  issues.push(...checkSubsystems(subsystems.map((s) => ({ name: s.name, state: s.state, detail: s.detail })), nowIso));

  // ---- migrations -----------------------------------------------------------
  const mig = await getMigrationAudit().catch(() => null);
  const migInput = mig && mig.ok ? { verifiable: mig.data.verifiable, ok: mig.data.ok, applied: mig.data.applied, missing: mig.data.missing, total: mig.data.total } : null;
  issues.push(checkMigrations(migInput, nowIso));

  // ---- recent error events --------------------------------------------------
  let recentErrors: number | null = null;
  try {
    const events = await listInfraEventsDal(createClient(), 100);
    recentErrors = events.filter((e) => /error|critical/i.test(e.severity) || /error|crash|fail/i.test(e.eventType)).length;
  } catch { recentErrors = null; }
  issues.push(checkErrorEvents(recentErrors, nowIso));

  // ---- geospatial health (Phase 73.3) --------------------------------------
  const p72 = await getPhase72Readiness().catch(() => null);
  issues.push(...checkGeospatial({
    glyphsConfigured: true, // both MapLibre styles declare a glyphs PBF source
    layerCount: 7, expectedLayers: 7, // narrative-map MAP_LAYERS
    readiness: p72 ? { geoReady: p72.mapReadySources, totalSources: p72.totalSources, signalsInheritingGeo: p72.signalsInheritingGeo, narrativesInheritingGeo: p72.narrativesInheritingGeo } : null,
  }, nowIso));

  // ---- conversion readiness (beta/demo) ------------------------------------
  // Routes/APIs exist (Phase 73.1); the form backend is an intentional placeholder.
  issues.push(...checkConversion({ betaRoute: true, demoRoute: true, betaApi: true, demoApi: true, formsBackendWired: false }, nowIso));

  const ordered = sortIssues(issues);
  const problems = ordered.filter((i) => isProblem(i.status));
  return {
    title: 'HSI Platform Self-Check',
    generatedAt: nowIso,
    summary: summarizeAudit(ordered),
    checks: ordered,
    issues: problems,
    recommendations: recommendations(ordered),
  };
}
