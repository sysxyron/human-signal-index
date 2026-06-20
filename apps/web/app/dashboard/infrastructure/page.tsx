// =============================================================================
// HSI Phase 70.1 — Infrastructure & Observability (/dashboard/infrastructure).
// Server Component, force-dynamic, ADMIN-ONLY. Health, backup & recovery,
// deployment ledger, migration verification, operational metrics, uptime, and the
// infra event log. All computed from real probes + records. Read-only over the
// systems it observes; admins record backups/deployments + run uptime checks.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getInfrastructureDashboard } from '@/lib/infra/data';
import {
  HealthBoard, BackupRecoveryPanel, DeploymentLedger, MigrationVerification,
  OperationalMetricsPanel, UptimePanel, InfraEventsPanel,
} from '@/components/infra/panels';
import { InfraControls } from '@/components/infra/InfraControls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InfrastructurePage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Infrastructure" subtitle="Production infrastructure & observability" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Infrastructure & Observability is available to administrators.' : 'Sign in to view infrastructure.'} redirectedFrom="/dashboard/infrastructure" />
        </main>
      </>
    );
  }

  const d = await getInfrastructureDashboard();

  return (
    <DashboardPage
      title="Infrastructure & Observability"
      subtitle="Health, backups, deployments, migration verification, uptime, and operational metrics — all computed from real probes and records."
      actions={<InfraControls />}
    >
      <div className="space-y-8">
        <HealthBoard health={d.health} overall={d.overall} />
        <OperationalMetricsPanel metrics={d.metrics} />
        <div className="grid gap-6 xl:grid-cols-2">
          <BackupRecoveryPanel recovery={d.recovery} backups={d.backups} />
          <MigrationVerification migrations={d.migrations} />
        </div>
        <DeploymentLedger deployments={d.deployments} current={d.currentDeployment} />
        <UptimePanel uptime={d.uptime} incidents={d.incidents} />
        <InfraEventsPanel events={d.events} />
      </div>
    </DashboardPage>
  );
}
