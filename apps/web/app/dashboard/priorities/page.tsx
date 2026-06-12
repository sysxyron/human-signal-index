// =============================================================================
// HSI Phase 22 — Strategic Priorities (/dashboard/priorities). Server Component,
// force-dynamic. The full ranked priority board derived from every subsystem,
// with a per-priority "queue for executive review" control (curator+). Researcher+
// view. Every priority is advisory; queuing routes it for a HUMAN decision.
//
// Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ListChecks, Info } from 'lucide-react';
import type { ExecutivePrioritiesData } from '@hsi/shared-types';
import { getExecutivePrioritiesAction, queueExecutiveReviewAction } from '@/lib/executive/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoExecutivePriorities, kindDecor } from '@/lib/executive/view';
import { ExecutiveNav } from '@/components/executive/ExecutiveNav';
import { PriorityBoard } from '@/components/executive/PriorityBoard';
import { QueueReviewControl } from '@/components/executive/controls';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PrioritiesPage() {
  const [res, role, user] = await Promise.all([getExecutivePrioritiesAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: ExecutivePrioritiesData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoExecutivePriorities(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Strategic Priorities" subtitle="What matters most, ranked — urgency × impact × confidence × evidence, across all intelligence" />
      <main className="space-y-6 p-5 lg:p-6">
        <ExecutiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><ListChecks className="h-5 w-5 text-electric" /> Ranked priorities</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Each priority is <span className="font-semibold text-text-primary">advisory</span> and explainable — it carries the
            numbers and reasoning that produced its score. Queuing for review routes it to a human decision; nothing auto-acts.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing priorities requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load priorities" message={errored.message} code={errored.code} redirectedFrom="/dashboard/priorities" />
        ) : !data ? null : data.priorities.length === 0 ? (
          <EmptyState icon={<ListChecks className="h-5 w-5" />} title="No priorities" message="The executive worker ranks priorities from every subsystem each hour." />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.byKind).map(([k, n]) => {
                const d = kindDecor(k);
                return <span key={k} className="rounded-full px-2.5 py-1 text-label font-semibold" style={{ backgroundColor: `${d.color}1f`, color: d.color }}>{d.label}: {n}</span>;
              })}
            </div>
            {mayCurate && !isDemo ? (
              <div className="space-y-3">
                {data.priorities.map((p) => (
                  <div key={p.id} className="space-y-2">
                    <PriorityBoard priorities={[p]} />
                    <div className="pl-10"><QueueReviewControl priorityId={p.id} action={queueExecutiveReviewAction} canAct={mayCurate} demo={isDemo} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <PriorityBoard priorities={data.priorities} />
            )}
          </div>
        )}
      </main>
    </>
  );
}
