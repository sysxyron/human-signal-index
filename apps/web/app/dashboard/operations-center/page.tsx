// =============================================================================
// HSI Phase 24 — Human Operations Center (/dashboard/operations-center). Server
// Component, force-dynamic, researcher+. The unified operational view:
// assignments, workloads, escalations, backlogs, capacity, alerts, team health.
// Read-only + advisory — nothing here publishes, approves, or governs.
// Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Activity, Info } from 'lucide-react';
import type { OperationsCenterData } from '@hsi/shared-types';
import { getOperationsCenterAction } from '@/lib/operations-os/actions';
import { demoOperationsCenter } from '@/lib/operations-os/view';
import { OperationsNav } from '@/components/operations-os/OperationsNav';
import { StatCards, TeamWorkloadGrid, WorkloadTable, AlertList } from '@/components/operations-os/panels';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OperationsCenterPage() {
  const res = await getOperationsCenterAction();
  let data: OperationsCenterData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoOperationsCenter(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Human Operations Center" subtitle="Assignments, workloads, escalations, backlogs, capacity, and team health in one place" />
      <main className="space-y-6 p-5 lg:p-6">
        <OperationsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Activity className="h-5 w-5 text-electric" /> Operational overview</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            This view coordinates the work of teams. It is <span className="font-semibold text-text-primary">advisory</span>:
            it assigns and surfaces load but never publishes, approves, rejects, or makes a governance decision. Every
            workflow action is a human action and is audit-logged.
          </p>
        </Card>

        {errored ? (
          <ErrorState title="Could not load operations center" message={errored.message} code={errored.code} redirectedFrom="/dashboard/operations-center" />
        ) : !data ? null : (
          <div className="space-y-6">
            <StatCards items={[
              { label: 'Open cases', value: data.openCases, color: '#3B82F6' },
              { label: 'Overdue', value: data.overdueCases, color: '#F59E0B' },
              { label: 'Critical escalations', value: data.criticalEscalations, color: '#EF4444' },
              { label: 'Open alerts', value: data.alerts.length, color: '#8B5CF6' },
            ]} />
            <section className="space-y-3"><h3 className="text-h6 font-semibold text-text-primary">Team health</h3><TeamWorkloadGrid teams={data.teamHealth} /></section>
            <section className="space-y-3"><h3 className="text-h6 font-semibold text-text-primary">Operational alerts</h3><AlertList alerts={data.alerts} /></section>
            <section className="space-y-3"><h3 className="text-h6 font-semibold text-text-primary">Assignee workload</h3><WorkloadTable rows={data.workloads.byAssignee} /></section>
          </div>
        )}
      </main>
    </>
  );
}
