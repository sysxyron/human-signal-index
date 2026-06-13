// =============================================================================
// HSI Phase 14 — Admin Security dashboard (/dashboard/security). Server
// Component, force-dynamic, ADMIN-ONLY. The auth/security-hardening control
// surface: dependency health (Supabase / Auth / REST / Storage), a Cloudflare
// challenge warning, 24h security counters, the failed-login / access-denial /
// security-event / session-event feeds, and the RBAC protected-route audit.
//
// Gating: read getUser() + getSessionRole() server-side; non-admins get a
// permission notice and NOTHING sensitive is rendered. Data via
// getSecurityDashboardAction() + getRbacAuditAction(); NOT_CONFIGURED → a
// clearly-LABELED demo view (the only mock). AUTH_REQUIRED → sign-in,
// FORBIDDEN → permission notice.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ShieldCheck, Database } from 'lucide-react';
import type { SecurityDashboardData } from '@hsi/shared-types';
import {
  getSecurityDashboardAction,
  getRbacAuditAction,
} from '@/lib/security/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  anyCloudflareChallenge,
  demoSecurityDashboardData,
  isAdmin,
} from '@/lib/security/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { HealthStatusCard } from '@/components/security/HealthStatusCard';
import { CloudflareWarningBanner } from '@/components/security/CloudflareWarningBanner';
import { EnvStatusPanel } from '@/components/security/EnvStatusPanel';
import { SecurityStatCards } from '@/components/security/SecurityStatCards';
import { LoginAttemptsTable } from '@/components/security/LoginAttemptsTable';
import { AccessDenialsTable } from '@/components/security/AccessDenialsTable';
import { SecurityEventsTable } from '@/components/security/SecurityEventsTable';
import { SessionEventsTable } from '@/components/security/SessionEventsTable';
import {
  RbacAuditPanel,
  type RbacAuditRow,
} from '@/components/security/RbacAuditPanel';
import { RefreshHealthButton } from '@/components/security/RefreshHealthButton';
import { SecurityReviewControls } from '@/components/security/SecurityReviewControls';
import { MigrationStatusPanel } from '@/components/launch/MigrationStatusPanel';
import { getMigrationAuditAction } from '@/lib/launch/actions';
import { demoMigrationAudit } from '@/lib/launch/view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Best-effort normalize whatever getRbacAuditAction returns into RbacAuditRow[].
 * Accepts an array of {route,minRole} (the rbac-audit AuditedRoute shape) or a
 * wrapper { routes: [...] }. Anything unrecognized → []. No `any`.
 */
function normalizeRbac(data: unknown): RbacAuditRow[] {
  const arr = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { routes?: unknown }).routes)
      ? ((data as { routes: unknown[] }).routes)
      : [];
  const out: RbacAuditRow[] = [];
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const route = typeof rec.route === 'string' ? rec.route : typeof rec.pattern === 'string' ? rec.pattern : undefined;
    const minRole = typeof rec.minRole === 'string' ? rec.minRole : typeof rec.min_role === 'string' ? rec.min_role : undefined;
    if (route && minRole) out.push({ route, minRole });
  }
  return out;
}

export default async function SecurityPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);

  // ADMIN-ONLY gate (server-side). Non-admins see a permission notice; we render
  // nothing sensitive below.
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Security" subtitle="Auth & security hardening — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <IntelNav />
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={
              user
                ? 'The Security dashboard is restricted to administrators.'
                : 'You need to be signed in as an administrator to view the Security dashboard.'
            }
            redirectedFrom="/dashboard/security"
          />
        </main>
      </>
    );
  }

  const [dashRes, rbacRes, migRes] = await Promise.all([
    getSecurityDashboardAction(),
    getRbacAuditAction(),
    getMigrationAuditAction(),
  ]);
  const migrationAudit = migRes.ok ? migRes.data : demoMigrationAudit();
  const migrationDemo = !migRes.ok;

  // Resolve the dashboard payload: live, demo (NOT_CONFIGURED), or a real error.
  let data: SecurityDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (dashRes.ok) {
    data = dashRes.data;
  } else if (dashRes.code === 'NOT_CONFIGURED') {
    data = demoSecurityDashboardData();
    isDemo = true;
  } else {
    errored = { message: dashRes.error, code: dashRes.code };
  }

  // RBAC audit — defensive: a failure here must not blank the page.
  let rbacRows: RbacAuditRow[] = [];
  if (rbacRes.ok) {
    rbacRows = normalizeRbac(rbacRes.data);
  }

  if (!data) {
    return (
      <>
        <TopNav title="Security" subtitle="Auth & security hardening" />
        <main className="space-y-6 p-5 lg:p-6">
          <IntelNav />
          <ErrorState
            title="Could not load the security dashboard"
            message={errored?.message ?? 'Unknown error.'}
            code={errored?.code}
            redirectedFrom="/dashboard/security"
          />
        </main>
      </>
    );
  }

  const d = data;
  const showCloudflareWarning =
    Boolean(d.cloudflareWarning) || anyCloudflareChallenge(d.health);

  return (
    <>
      <TopNav
        title="Security"
        subtitle="Auth health, access telemetry & RBAC audit"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <ShieldCheck className="h-5 w-5 text-electric" /> Security
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RefreshHealthButton demo={isDemo} />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {/* Cloudflare challenge warning (live warning or any health flag). */}
        {showCloudflareWarning ? (
          <CloudflareWarningBanner message={d.cloudflareWarning} />
        ) : null}

        {/* Startup environment validation (required/optional). */}
        {d.env ? <EnvStatusPanel env={d.env} /> : null}

        {/* Phase 23 — database migration audit (0001→0026). */}
        <MigrationStatusPanel audit={migrationAudit} demo={migrationDemo} />

        {/* Connection / health panel — one card per service. */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Database className="h-4 w-4 text-electric" /> Connection &amp; health
          </h3>
          {d.health.length === 0 ? (
            <Card padded>
              <p className="text-body-sm text-text-secondary">
                No health checks reported. Re-run the probes to populate this panel.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {d.health.map((check, i) => (
                <HealthStatusCard key={`${check.service}-${i}`} check={check} />
              ))}
            </div>
          )}
        </section>

        {/* 24h security counters. */}
        <SecurityStatCards counts={d.counts} />

        {/* Telemetry feeds. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <LoginAttemptsTable rows={d.failedLogins} />
          <AccessDenialsTable rows={d.accessDenials} />
        </div>

        <SecurityEventsTable rows={d.securityEvents} />

        <div className="grid gap-6 lg:grid-cols-2">
          <SessionEventsTable rows={d.sessionEvents} />
          <RbacAuditPanel routes={rbacRows} />
        </div>

        {/* Optional admin triage controls. */}
        <SecurityReviewControls canReview={isAdmin(role)} demo={isDemo} />
      </main>
    </>
  );
}
