// =============================================================================
// HSI Phase 20 — Contributors (/dashboard/contributors). Server Component,
// force-dynamic. getContributorsBoardAction() returns the contributor reliability
// leaderboard (ContributorRanking) + an explainable per-contributor breakdown
// (TrustBreakdown). No hidden scoring. Answers "who contributed and how
// trustworthy are they?". Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Trophy, Info } from 'lucide-react';
import type { ContributorsBoardData } from '@hsi/shared-types';
import { getContributorsBoardAction } from '@/lib/collective/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoContributorsBoard } from '@/lib/collective/view';
import { CollectiveNav } from '@/components/collective/CollectiveNav';
import { ContributorRanking, TrustBreakdown } from '@/components/collective/ContributorRanking';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContributorsPage() {
  const [res, role, user] = await Promise.all([getContributorsBoardAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);

  let data: ContributorsBoardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoContributorsBoard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const scores = data?.scores ?? [];

  return (
    <>
      <TopNav title="Contributors" subtitle="Contributor reliability — accuracy, trust, review quality, consensus alignment, evidence" />
      <main className="space-y-6 p-5 lg:p-6">
        <CollectiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Trophy className="h-5 w-5 text-electric" /> Contributor leaderboard
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Every contributor score is <span className="font-semibold text-text-primary">explainable</span> — it shows the
            counts behind accuracy, review reliability, and consensus alignment, plus explicit limitations. No hidden
            scoring; reputation is advisory, never a verdict on the person.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing contributors requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load contributors" message={errored.message} code={errored.code} redirectedFrom="/dashboard/contributors" />
        ) : scores.length === 0 ? (
          <EmptyState icon={<Trophy className="h-5 w-5" />} title="No contributor scores yet" message="The consensus worker computes contributor reliability every 30 minutes." />
        ) : (
          <div className="space-y-6">
            <ContributorRanking scores={scores} />
            <div className="grid gap-4 md:grid-cols-2">
              {scores.slice(0, 4).map((s) => <TrustBreakdown key={s.id} score={s} />)}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
