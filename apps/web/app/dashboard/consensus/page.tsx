// =============================================================================
// HSI Phase 20 — Consensus board (/dashboard/consensus). Server Component,
// force-dynamic. getConsensusBoardAction() lists recent consensus snapshots + the
// governance decisions over them. Answers "how strong is the consensus?" and
// "what governance decisions were made?". Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Scale } from 'lucide-react';
import type { ConsensusBoardData } from '@hsi/shared-types';
import { getConsensusBoardAction } from '@/lib/collective/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoConsensusBoard, formatDateTime, formatPct } from '@/lib/collective/view';
import { CollectiveNav } from '@/components/collective/CollectiveNav';
import { AgreementBadge, DecisionBadge } from '@/components/collective/badges';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConsensusBoardPage() {
  const [res, role, user] = await Promise.all([getConsensusBoardAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);

  let data: ConsensusBoardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoConsensusBoard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Consensus" subtitle="Weighted consensus candidates + the governance decisions over them" />
      <main className="space-y-6 p-5 lg:p-6">
        <CollectiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Scale className="h-5 w-5 text-electric" /> Consensus snapshots
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing consensus requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load consensus" message={errored.message} code={errored.code} redirectedFrom="/dashboard/consensus" />
        ) : !data || data.snapshots.length === 0 ? (
          <EmptyState icon={<Scale className="h-5 w-5" />} title="No consensus snapshots yet" message="The consensus worker computes snapshots for active investigations every 30 minutes." />
        ) : (
          <div className="space-y-3">
            {data.snapshots.map((s) => {
              const review = data!.reviews.find((r) => r.investigation_id === s.investigation_id);
              return (
                <Link key={s.id} href={`/dashboard/consensus/${s.investigation_id}` as never} className="block">
                  <Card className="space-y-2 border-border transition hover:border-electric/50" padded>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-text-primary">{s.consensus_position ?? '— no candidate —'}</span>
                      <div className="flex items-center gap-2">
                        <AgreementBadge score={s.agreement_score} />
                        {review ? <DecisionBadge decision={review.decision} /> : <DecisionBadge decision={null} />}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-muted">
                      <span>agreement {formatPct(s.agreement_score)}</span>
                      <span>evidence {formatPct(s.evidence_strength)}</span>
                      <span>confidence {formatPct(s.confidence)}</span>
                      <span>{s.sample_count ?? 0} finding(s) · {s.contributor_count ?? 0} contributor(s)</span>
                      <span>{formatDateTime(s.generated_at ?? s.created_at)}</span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
