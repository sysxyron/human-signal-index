// =============================================================================
// HSI Phase 20 — Consensus detail (/dashboard/consensus/[id]). Server Component,
// force-dynamic. getConsensusDetailAction(investigationId) returns the latest (or
// live) consensus snapshot with its breakdown, dissent, and the governance review
// history. A reviewer/curator approves/rejects/escalates/archives the forming
// consensus (GovernanceDecisionPanel) — never auto-acted. Answers "how strong is
// the consensus, who decided, and why?".
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { ArrowLeft, Scale, ShieldCheck } from 'lucide-react';
import type { ConsensusDetailData } from '@hsi/shared-types';
import { getConsensusDetailAction, reviewConsensusAction } from '@/lib/collective/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoConsensusDetail, formatDateTime } from '@/lib/collective/view';
import { CollectiveNav } from '@/components/collective/CollectiveNav';
import { ConsensusCard, ConsensusBreakdown, DissentTable } from '@/components/collective/ConsensusCard';
import { GovernanceDecisionPanel } from '@/components/collective/controls';
import { DecisionBadge, InvestigationStateBadge } from '@/components/collective/badges';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConsensusDetailPage({ params }: { params: { id: string } }) {
  const [res, role, user] = await Promise.all([getConsensusDetailAction(params.id), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayDecide = canCurate(role) && Boolean(user);

  let data: ConsensusDetailData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoConsensusDetail(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const inv = data?.investigation;

  return (
    <>
      <TopNav title="Consensus detail" subtitle="The weighted candidate, the dissent, and the governance decision" />
      <main className="space-y-6 p-5 lg:p-6">
        <CollectiveNav />
        <Link href={'/dashboard/consensus' as never} className="inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to consensus
        </Link>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing consensus requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load consensus" message={errored.message} code={errored.code} redirectedFrom={`/dashboard/consensus/${params.id}`} />
        ) : !data || !inv ? (
          <ErrorState title="Not found" message="This investigation does not exist." />
        ) : (
          <div className="space-y-6">
            <Card className="flex flex-wrap items-center justify-between gap-2 border-border" padded>
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-electric" />
                <Link href={`/dashboard/investigations/${inv.id}` as never} className="text-h6 font-semibold text-text-primary hover:underline">{inv.title}</Link>
                {isDemo ? <DemoBadge /> : null}
              </div>
              <InvestigationStateBadge state={inv.state} />
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <ConsensusCard snapshot={data.snapshot} />
                <ConsensusBreakdown snapshot={data.snapshot} />
                <DissentTable snapshot={data.snapshot} />
              </div>
              <div className="space-y-6">
                <Card className="space-y-3 border-border" padded>
                  <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                    <ShieldCheck className="h-4 w-4 text-electric" /> Governance decision
                  </h3>
                  <p className="text-[12px] leading-snug text-text-muted">
                    Consensus is a candidate. A human reviewer accepts, rejects, escalates, or archives it — never auto-approved, never auto-published.
                  </p>
                  <GovernanceDecisionPanel investigationId={inv.id} action={reviewConsensusAction} canAct={mayDecide} demo={isDemo} />
                </Card>

                <Card className="space-y-3 border-border" padded>
                  <h3 className="text-h6 font-semibold text-text-primary">Decision history</h3>
                  {data.reviews.length === 0 ? (
                    <p className="text-caption text-text-muted">No governance decision yet — this consensus is awaiting review.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.reviews.map((r) => (
                        <div key={r.id} className="rounded-card border border-border bg-surface/50 p-3">
                          <div className="flex items-center justify-between">
                            <DecisionBadge decision={r.decision} />
                            <span className="text-[11px] text-text-muted">{formatDateTime(r.created_at)}</span>
                          </div>
                          {r.reason ? <p className="mt-1.5 text-caption text-text-secondary"><span className="font-semibold text-text-primary">Reason: </span>{r.reason}</p> : null}
                          <p className="mt-1 text-[11px] text-text-muted">Reviewer: {r.reviewer_id ?? 'unknown'} · → {r.resulting_state}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
