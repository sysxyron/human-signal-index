// =============================================================================
// HSI Phase 24 — Executive Operations (/dashboard/executive-operations). Server
// Component, force-dynamic, researcher+. Backlogs, queues, escalations, team +
// forecasted capacity, resolution time, operational health. Advisory. Offline →
// labeled demo.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { Command } from 'lucide-react';
import type { ExecutiveOperationsData } from '@hsi/shared-types';
import { getExecutiveOperationsAction } from '@/lib/operations-os/actions';
import { demoExecutiveOperations, formatDuration, opsStatusColor } from '@/lib/operations-os/view';
import { OperationsNav } from '@/components/operations-os/OperationsNav';
import { StatCards, TeamWorkloadGrid } from '@/components/operations-os/panels';
import { Card } from '@hsi/ui';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ExecutiveOperationsPage() {
  const res = await getExecutiveOperationsAction();
  let data: ExecutiveOperationsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoExecutiveOperations(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Executive Operations" subtitle="Backlogs, capacity, and operational health at a glance" />
      <main className="space-y-6 p-5 lg:p-6">
        <OperationsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Command className="h-5 w-5 text-electric" /> Executive operations</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState title="Could not load executive operations" message={errored.message} code={errored.code} redirectedFrom="/dashboard/executive-operations" />
        ) : !data ? null : (
          <div className="space-y-6">
            <StatCards items={[
              { label: 'Research backlog', value: data.researchBacklog, color: '#3B82F6' },
              { label: 'Review backlog', value: data.reviewBacklog, color: '#8B5CF6' },
              { label: 'Publication queue', value: data.publicationQueue, color: '#06B6D4' },
              { label: 'Critical escalations', value: data.criticalEscalations, color: '#EF4444' },
              { label: 'Open investigations', value: data.openInvestigations, color: '#10B981' },
              { label: 'Avg resolution', value: formatDuration(data.avgResolutionMs), color: '#F59E0B' },
            ]} />
            <Card className="flex items-center justify-between border-border" padded>
              <span className="text-body font-semibold text-text-primary">Operational health</span>
              <span className="rounded-full px-3 py-1 text-caption font-bold uppercase" style={{ backgroundColor: `${opsStatusColor(data.operationalHealth)}1f`, color: opsStatusColor(data.operationalHealth) }}>{data.operationalHealth}</span>
            </Card>
            <section className="space-y-3"><h3 className="text-h6 font-semibold text-text-primary">Team capacity</h3><TeamWorkloadGrid teams={data.teamCapacity} /></section>
            {data.forecastedCapacity.length > 0 ? (
              <section className="space-y-3">
                <h3 className="text-h6 font-semibold text-text-primary">Forecasted capacity (advisory)</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.forecastedCapacity.map((f) => (
                    <Card key={f.team} className="space-y-1 border-border" padded>
                      <div className="text-body font-semibold capitalize text-text-primary">{f.team}</div>
                      <div className="text-caption text-text-secondary">Capacity {f.weeklyCapacity}/wk · net {f.netPerWeek > 0 ? '+' : ''}{f.netPerWeek}/wk · {f.trend}</div>
                    </Card>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}
