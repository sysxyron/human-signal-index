// =============================================================================
// HSI Phase 23 — Launch Operations client-safe view helpers.
//
// PURE + CLIENT-SAFE: NO server-only imports. Status → color/label, and labeled
// demo builders (from the PURE readiness + migration engines) so every launch
// page renders fully offline when an action returns NOT_CONFIGURED.
// =============================================================================

import { auditMigrations, EXPECTED_MIGRATIONS } from './migration-audit';
import { computeReadiness, type Status, type AreaKey } from './readiness';
import type { BetaIssue, LaunchStatus } from './types';

const DEMO_NOW = '2026-06-12T12:00:00.000Z';

const STATUS_COLOR: Record<Status, string> = {
  GREEN: '#10B981',
  YELLOW: '#F59E0B',
  RED: '#EF4444',
};
export function statusColor(s: Status): string {
  return STATUS_COLOR[s];
}
export function statusLabel(s: Status): string {
  return s === 'GREEN' ? 'Ready' : s === 'YELLOW' ? 'Caution' : 'Blocked';
}

const AREA_LABEL: Record<AreaKey, string> = {
  production: 'Production',
  migration: 'Migrations',
  role: 'Roles',
  tester: 'Testers',
  deployment: 'Deployment',
  security: 'Security',
};
export function areaLabel(k: AreaKey): string {
  return AREA_LABEL[k];
}

const MIGRATION_COLOR: Record<string, string> = {
  applied: '#10B981',
  missing: '#EF4444',
  out_of_order: '#F59E0B',
  failed: '#EF4444',
  unknown: '#94A3B8',
};
export function migrationStateColor(state: string): string {
  return MIGRATION_COLOR[state] ?? '#94A3B8';
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

/* -------------------------------------------------------------------------- */
/* DEMO builders                                                               */
/* -------------------------------------------------------------------------- */

/** A labeled demo launch status (configured prod, migrations unverifiable). */
export function demoLaunchStatus(): LaunchStatus {
  const migration = auditMigrations(EXPECTED_MIGRATIONS.map((m) => m.id)); // all applied (demo)
  const readiness = computeReadiness({
    appUrlConfigured: true,
    supabaseConfigured: true,
    supabaseReachable: true,
    authReachable: true,
    storageReachable: true,
    serviceRoleConfigured: false, // demo: workers not configured → one YELLOW
    requiredEnvMissing: [],
    migration: { ok: migration.ok, missing: migration.missing, outOfOrder: migration.outOfOrder, failed: migration.failed, verifiable: migration.verifiable },
    rbac: { resolverOk: true, resolvedRole: 'admin' },
    testerCount: 5,
    openBlockers: 0,
    debugEndpointHardened: true,
  });
  return {
    readiness,
    migration,
    env: { requiredMissing: [], optionalMissing: ['SUPABASE_SERVICE_ROLE_KEY'], masked: { NEXT_PUBLIC_SUPABASE_URL: 'https://demo…', NEXT_PUBLIC_APP_URL: 'https://demo…' } },
    health: [
      { service: 'supabase', ok: true, status: 'ok', message: 'Reached Supabase (demo).' },
      { service: 'auth', ok: true, status: 'ok', message: 'Auth healthy (demo).' },
      { service: 'storage', ok: true, status: 'ok', message: 'Storage healthy (demo).' },
    ],
    rbac: { resolvedRole: 'admin', source: 'public.user_roles' },
    testerCount: 5,
    appUrl: 'https://demo.humansignalindex.org',
    generatedAt: DEMO_NOW,
  };
}

export function demoMigrationAudit() {
  return auditMigrations(EXPECTED_MIGRATIONS.map((m) => m.id));
}

export function demoBetaIssues(): BetaIssue[] {
  return [
    {
      id: 'demo-1', title: 'Sidebar “Trust Center” highlight not active on sub-routes',
      route: '/dashboard/trust/history', role: 'reviewer', severity: 'low',
      stepsToReproduce: 'Open /dashboard/trust/history; observe sidebar.', expectedBehavior: 'Trust Center highlighted.', actualBehavior: 'No item highlighted.',
      status: 'open', assignedTo: null, createdAt: DEMO_NOW, updatedAt: DEMO_NOW,
    },
    {
      id: 'demo-2', title: 'Forecast card confidence rounding', route: '/dashboard/forecasts',
      role: 'researcher', severity: 'medium', stepsToReproduce: 'Open forecasts.', expectedBehavior: 'Two decimals.', actualBehavior: 'Long float.',
      status: 'triaged', assignedTo: 'admin', createdAt: DEMO_NOW, updatedAt: DEMO_NOW,
    },
  ];
}
