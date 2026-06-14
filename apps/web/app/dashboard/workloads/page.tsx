// =============================================================================
// HSI Phase 24 — Workload Dashboard (/dashboard/workloads). Server Component,
// force-dynamic, researcher+. Team + individual workload, backlogs, escalations.
// Advisory. Offline → labeled demo.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { Gauge } from 'lucide-react';
import type { WorkloadsData } from '@hsi/shared-types';
import { getWorkloadsAction } from '@/lib/operations-os/actions';
import { demoWorkloads } from '@/lib/operations-os/view';
import { OperationsNav } from '@/components/operations-os/OperationsNav';
import { WorkloadTotals, TeamWorkloadGrid, WorkloadTable } from '@/components/operations-os/panels';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorkloadsPage() {
  const res = await getWorkloadsAction();
  let data: WorkloadsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoWorkloads(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Workloads" subtitle="Who is carrying what — by team and by person" />
      <main className="space-y-6 p-5 lg:p-6">
        <OperationsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Gauge className="h-5 w-5 text-electric" /> Workload</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState title="Could not load workloads" message={errored.message} code={errored.code} redirectedFrom="/dashboard/workloads" />
        ) : !data ? null : (
          <div className="space-y-6">
            <WorkloadTotals data={data} />
            <section className="space-y-3"><h3 className="text-h6 font-semibold text-text-primary">By team</h3><TeamWorkloadGrid teams={data.byTeam} /></section>
            <section className="space-y-3"><h3 className="text-h6 font-semibold text-text-primary">By person</h3><WorkloadTable rows={data.byAssignee} /></section>
          </div>
        )}
      </main>
    </>
  );
}
