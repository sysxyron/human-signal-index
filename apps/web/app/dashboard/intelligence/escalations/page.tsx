// =============================================================================
// HSI Phase 18 — Research Escalations (/dashboard/intelligence/escalations).
// Server Component, force-dynamic. getEscalationsAction(status?) returns the
// escalations (repeated failures / trust collapse / calibration drift / missing
// evidence / governance backlog / queue blockage) with severity, evidence, and an
// advisory recommendation. Never auto-resolved — a curator acknowledges/resolves
// each with a note. Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Siren, Info } from 'lucide-react';
import type { EscalationsData, EscalationSeverity } from '@hsi/shared-types';
import { getEscalationsAction, resolveEscalationAction } from '@/lib/orchestration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoEscalations, formatDateTime, readStringArray, severityDecor } from '@/lib/orchestration/view';
import { IntelligenceOpsNav } from '@/components/intelligence/IntelligenceOpsNav';
import { SeverityBadge } from '@/components/intelligence/badges';
import { EscalationResolveControl } from '@/components/intelligence/EscalationResolveControl';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EscalationsPage({ searchParams }: { searchParams: { status?: string } }) {
  const statusFilter = ['open', 'acknowledged', 'resolved'].includes(searchParams.status ?? '')
    ? searchParams.status
    : undefined;
  const [res, role, user] = await Promise.all([
    getEscalationsAction(statusFilter),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);
  const mayResolve = canCurate(role) && Boolean(user);

  let data: EscalationsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoEscalations();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const escalations = data?.escalations ?? [];
  const SEVERITIES: EscalationSeverity[] = ['CRITICAL', 'HIGH', 'WARNING', 'INFO'];

  return (
    <>
      <TopNav title="Escalations" subtitle="What needs attention? — issues routed to humans, never auto-resolved" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelligenceOpsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Siren className="h-5 w-5 text-electric" /> Escalations
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Escalations surface operational problems for a human. Each carries an advisory
            recommendation and is <span className="font-semibold text-text-primary">never auto-resolved</span> —
            a curator acknowledges or resolves it with a logged note.
          </p>
        </Card>

        {data ? (
          <Card className="flex flex-wrap items-center gap-4 border-border" padded>
            <span className="text-label uppercase tracking-wide text-text-muted">By severity</span>
            {SEVERITIES.map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <SeverityBadge severity={s} />
                <span className="tabular-nums text-caption font-semibold text-text-primary">{data!.bySeverity[s]}</span>
              </div>
            ))}
          </Card>
        ) : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing escalations requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load escalations" message={errored.message} code={errored.code} redirectedFrom="/dashboard/intelligence/escalations" />
        ) : !data ? null : escalations.length === 0 ? (
          <EmptyState icon={<Siren className="h-5 w-5" />} title="No escalations" message="Nothing needs attention — the orchestrator raises escalations when runs fail, trust collapses, or the queue blocks." />
        ) : (
          <div className="space-y-3">
            {escalations.map((e) => {
              const evidence = readStringArray(e.evidence);
              return (
                <Card key={e.id} className="space-y-2 border-border" padded>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary">{e.trigger}</span>
                      {e.run_id ? (
                        <Link href={`/dashboard/intelligence/runs/${e.run_id}` as never} className="text-caption text-electric hover:underline">
                          run {e.run_id}
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={e.severity} />
                      <span className="text-[11px] text-text-muted">{formatDateTime(e.created_at)}</span>
                    </div>
                  </div>
                  <p className="text-caption leading-relaxed text-text-secondary">{e.reason}</p>
                  {e.recommendation ? (
                    <div className="rounded-card border border-border bg-surface/50 p-2 text-[12px] leading-snug text-text-secondary">
                      <span className="font-semibold text-text-primary">Recommendation: </span>{e.recommendation}
                    </div>
                  ) : null}
                  {evidence.length > 0 ? (
                    <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-text-muted">
                      {evidence.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  ) : null}
                  <EscalationResolveControl
                    escalationId={e.id}
                    status={e.status}
                    action={resolveEscalationAction}
                    canResolve={mayResolve}
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
