// =============================================================================
// HSI Phase 24 — Team Management (/dashboard/teams). Server Component,
// force-dynamic, researcher+. Team listing with members, workload, capacity, and
// role distribution. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Users } from 'lucide-react';
import type { TeamsData } from '@hsi/shared-types';
import { getTeamsAction } from '@/lib/operations-os/actions';
import { demoTeams, opsStatusColor } from '@/lib/operations-os/view';
import { OperationsNav } from '@/components/operations-os/OperationsNav';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TeamsPage() {
  const res = await getTeamsAction();
  let data: TeamsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoTeams(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Teams" subtitle="The teams that run the platform — membership, workload, and capacity" />
      <main className="space-y-6 p-5 lg:p-6">
        <OperationsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Users className="h-5 w-5 text-electric" /> Teams</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState title="Could not load teams" message={errored.message} code={errored.code} redirectedFrom="/dashboard/teams" />
        ) : !data ? null : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.teams.map((t) => (
              <Card key={t.key} className="space-y-1.5 border-border" padded>
                <div className="flex items-center justify-between">
                  <span className="text-body font-semibold text-text-primary">{t.name}</span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: opsStatusColor(t.status) }} />
                </div>
                <div className="text-caption text-text-secondary">{t.members} member(s)</div>
                <div className="text-caption text-text-secondary">{t.open} open · {t.overdue} overdue</div>
                <div className="text-label uppercase tracking-wide" style={{ color: opsStatusColor(t.status) }}>{t.status}</div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
