// =============================================================================
// HSI Phase 20 — Investigation detail (/dashboard/investigations/[id]). Server
// Component, force-dynamic. getInvestigationDetailAction(id) returns the
// investigation, findings (FindingTimeline), challenges (ChallengePanel),
// alternative narratives, evidence debate (EvidenceDebatePanel), and the live
// consensus snapshot (ConsensusCard + DissentTable). Researcher+ submit findings/
// challenges; curator+ recompute consensus. Answers "what evidence supports this,
// who disagrees, what alternatives exist?".
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { ArrowLeft, Users } from 'lucide-react';
import type { InvestigationDetailData } from '@hsi/shared-types';
import {
  getInvestigationDetailAction,
  recomputeConsensusAction,
  submitChallengeAction,
  submitFindingAction,
} from '@/lib/collective/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoInvestigationDetail, formatPct } from '@/lib/collective/view';
import { CollectiveNav } from '@/components/collective/CollectiveNav';
import { InvestigationStateBadge } from '@/components/collective/badges';
import { FindingTimeline, ChallengePanel, EvidenceDebatePanel, AlternativeNarrativesPanel } from '@/components/collective/panels';
import { ConsensusCard, DissentTable } from '@/components/collective/ConsensusCard';
import { SubmitFindingControl, SubmitChallengeControl, RecomputeConsensusButton } from '@/components/collective/controls';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InvestigationDetailPage({ params }: { params: { id: string } }) {
  const [res, role, user] = await Promise.all([getInvestigationDetailAction(params.id), getSessionRole(), getUser()]);
  const mayResearch = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: InvestigationDetailData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoInvestigationDetail(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayResearch;
  const inv = data?.investigation;

  return (
    <>
      <TopNav title="Investigation" subtitle="Collaborate, debate the evidence, and watch consensus form" />
      <main className="space-y-6 p-5 lg:p-6">
        <CollectiveNav />
        <Link href={'/dashboard/investigations' as never} className="inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to investigations
        </Link>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing investigations requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load the investigation" message={errored.message} code={errored.code} redirectedFrom={`/dashboard/investigations/${params.id}`} />
        ) : !data || !inv ? (
          <ErrorState title="Investigation not found" message="This investigation does not exist." />
        ) : (
          <div className="space-y-6">
            <Card className="space-y-2 border-border" padded>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-electric" />
                  <h2 className="text-h6 font-semibold text-text-primary">{inv.title}</h2>
                  {isDemo ? <DemoBadge /> : null}
                </div>
                <InvestigationStateBadge state={inv.state} />
              </div>
              <p className="text-caption text-text-secondary">{inv.question}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
                <span>{data.metrics.findingCount} finding(s)</span>
                <span>{data.metrics.openChallengeCount} open challenge(s)</span>
                <span>{data.metrics.alternativeCount} alternative(s)</span>
                <span>{data.metrics.contributorCount} contributor(s)</span>
                <span>contention {formatPct(data.metrics.contentiousness)}</span>
                <Link href={`/dashboard/consensus/${inv.id}` as never} className="text-electric hover:underline">Consensus detail →</Link>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <FindingTimeline findings={data.findings} />
                {mayResearch && !isDemo ? (
                  <Card className="space-y-2 border-border" padded>
                    <h3 className="text-h6 font-semibold text-text-primary">Submit a finding</h3>
                    <SubmitFindingControl investigationId={inv.id} action={submitFindingAction} canAct={mayResearch} demo={isDemo} />
                  </Card>
                ) : null}
                <ChallengePanel challenges={data.challenges} />
                {mayResearch && !isDemo && data.findings.length > 0 ? (
                  <Card className="space-y-2 border-border" padded>
                    <h3 className="text-h6 font-semibold text-text-primary">Challenge a finding</h3>
                    <SubmitChallengeControl investigationId={inv.id} findings={data.findings.map((f) => ({ id: f.id, position: f.position }))} action={submitChallengeAction} canAct={mayResearch} demo={isDemo} />
                  </Card>
                ) : null}
              </div>
              <div className="space-y-6">
                <div className="flex items-center justify-end">
                  <RecomputeConsensusButton investigationId={inv.id} action={recomputeConsensusAction} canAct={mayCurate} demo={isDemo} />
                </div>
                <ConsensusCard snapshot={data.snapshot} />
                <DissentTable snapshot={data.snapshot} />
                <EvidenceDebatePanel claims={data.evidenceClaims} />
                <AlternativeNarrativesPanel alternatives={data.alternatives} />
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
