// =============================================================================
// HSI Phase 18 — Research Opportunities (/dashboard/intelligence/opportunities).
// Server Component, force-dynamic. getOpportunitiesAction(status?) returns the
// PROPOSED opportunities discovered from signals / evidence / alerts / trust drift
// / outcome failures / narrative spikes — never auto-published. A curator ACCEPTS
// (spawns a run) or REJECTS each with a reason. Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Lightbulb, Info } from 'lucide-react';
import type { OpportunitiesData } from '@hsi/shared-types';
import { decideOpportunityAction, getOpportunitiesAction } from '@/lib/orchestration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoOpportunities, formatPct, priorityDecor } from '@/lib/orchestration/view';
import { IntelligenceOpsNav } from '@/components/intelligence/IntelligenceOpsNav';
import { PriorityBadge } from '@/components/intelligence/badges';
import { OpportunityDecisionControl } from '@/components/intelligence/OpportunityDecisionControl';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

export default async function OpportunitiesPage({ searchParams }: { searchParams: { status?: string } }) {
  const statusFilter = ['proposed', 'accepted', 'rejected'].includes(searchParams.status ?? '')
    ? searchParams.status
    : undefined;
  const [res, role, user] = await Promise.all([
    getOpportunitiesAction(statusFilter),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);
  const mayDecide = canCurate(role) && Boolean(user);

  let data: OpportunitiesData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoOpportunities();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const opps = data?.opportunities ?? [];
  const active = statusFilter ?? 'all';

  return (
    <>
      <TopNav title="Research opportunities" subtitle="What should we investigate next? — proposals only, triaged by humans" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelligenceOpsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Lightbulb className="h-5 w-5 text-electric" /> Discovered opportunities
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Discovery scans live signals and <span className="font-semibold text-text-primary">proposes</span>{' '}
            investigations. Nothing is auto-published — a curator accepts (which starts a research run)
            or rejects each, with the decision logged.
          </p>
        </Card>

        {data ? (
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => {
              const isActive = active === s.value;
              const href = s.value === 'all' ? '/dashboard/intelligence/opportunities' : `/dashboard/intelligence/opportunities?status=${s.value}`;
              const count = s.value === 'proposed' ? data!.proposedCount : s.value === 'accepted' ? data!.acceptedCount : s.value === 'rejected' ? data!.rejectedCount : data!.proposedCount + data!.acceptedCount + data!.rejectedCount;
              return (
                <Link key={s.value} href={href as never} className="rounded-full px-3 py-1 text-caption font-semibold transition"
                  style={isActive ? { backgroundColor: '#3B82F61f', color: '#3B82F6', border: '1px solid #3B82F655' } : { color: '#94A3B8', border: '1px solid #2A3A5C' }}>
                  {s.label} {isDemo ? '' : `(${count})`}
                </Link>
              );
            })}
          </div>
        ) : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing opportunities requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load opportunities" message={errored.message} code={errored.code} redirectedFrom="/dashboard/intelligence/opportunities" />
        ) : !data ? null : opps.length === 0 ? (
          <EmptyState icon={<Lightbulb className="h-5 w-5" />} title="No opportunities" message="The discovery worker proposes opportunities from drift, failures, alerts, and spikes." />
        ) : (
          <div className="space-y-3">
            {opps.map((o) => {
              const dec = priorityDecor(o.priority);
              return (
                <Card key={o.id} className="space-y-2 border-border" padded>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-text-primary">{o.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-caption tabular-nums" style={{ color: dec.color }}>conf {formatPct(o.confidence)}</span>
                      <PriorityBadge priority={o.priority} />
                    </div>
                  </div>
                  <p className="text-caption leading-relaxed text-text-secondary">{o.reason}</p>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <span>source: {o.source}</span>
                    {o.entity_id ? <span>· {o.entity_id}</span> : null}
                  </div>
                  <OpportunityDecisionControl
                    opportunityId={o.id}
                    status={o.status}
                    action={decideOpportunityAction}
                    canDecide={mayDecide}
                    demo={isDemo}
                  />
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
