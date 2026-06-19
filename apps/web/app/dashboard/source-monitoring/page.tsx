// =============================================================================
// HSI Phase 63 — Automated Source Monitoring (/dashboard/source-monitoring).
// Server Component, force-dynamic, reviewer+ (admins also get the run control).
// Active monitoring surface: overview, health trends, collections, alert feed,
// reliability trends, and the executive "can we trust our source network today?"
// summary — all computed. Reads only; the run/cron persist + notify. RLS-gated.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getMonitoringDashboard } from '@/lib/source-monitoring/data';
import {
  MonitoringOverviewPanel, HealthTrendsPanel, CollectionsPanel, AlertFeed,
  ReliabilityTrends, ExecutiveMonitoringSummary,
} from '@/components/source-monitoring/panels';
import { RunMonitoringButton } from '@/components/source-monitoring/RunMonitoringButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SourceMonitoringPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Source Monitoring" subtitle="Automated source monitoring" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'Source Monitoring is available to reviewers and admins.' : 'Sign in to view source monitoring.'}
            redirectedFrom="/dashboard/source-monitoring"
          />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const data = await getMonitoringDashboard();

  return (
    <DashboardPage
      title="Source Monitoring"
      subtitle="Automated detection of failures, recoveries, stale sources, gaps & reliability drift — observation only, never circumvention"
      actions={admin ? <RunMonitoringButton /> : undefined}
    >
      <div className="space-y-8">
        <ExecutiveMonitoringSummary executive={data.executive} />
        <MonitoringOverviewPanel overview={data.overview} lastRunAt={data.lastRunAt} />
        <CollectionsPanel collections={data.collections} />
        <div className="grid gap-6 xl:grid-cols-2">
          <HealthTrendsPanel distribution={data.distribution} changes={data.changes} />
          <ReliabilityTrends trends={data.trends} />
        </div>
        <AlertFeed alerts={data.alerts} />
      </div>
    </DashboardPage>
  );
}
