// =============================================================================
// HSI Phase 19 — Publishing review queue (/dashboard/publishing/review). Server
// Component, force-dynamic. getPublishingReviewAction() returns publications
// UNDER_REVIEW (awaiting a governance decision) + APPROVED (cleared to publish).
// A curator approves/rejects with a required reason (logged). Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ClipboardCheck, Info } from 'lucide-react';
import type { PublishingReviewData } from '@hsi/shared-types';
import { getPublishingReviewAction, reviewPublicationAction } from '@/lib/publishing/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoPublishingDashboard, formatTrust } from '@/lib/publishing/view';
import { PublishingNav } from '@/components/publishing/PublishingNav';
import { PublicationStateBadge } from '@/components/publishing/badges';
import { ReviewControl } from '@/components/publishing/PublishingControls';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PublishingReviewPage() {
  const [res, role, user] = await Promise.all([getPublishingReviewAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: PublishingReviewData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    // Demo: surface a draft as "under review" so the control is visible.
    const demo = demoPublishingDashboard();
    data = { reviewQueue: demo.drafts.map((d) => ({ ...d, state: 'UNDER_REVIEW' as const })), approved: [] };
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Review queue" subtitle="Who approves publication? — governed publish reviews, required reasons, fully audited" />
      <main className="space-y-6 p-5 lg:p-6">
        <PublishingNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <ClipboardCheck className="h-5 w-5 text-electric" /> Pending review
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Approval requires a reviewer + reason and clears the publish gate (trust / evidence / source thresholds +
            governance). Nothing auto-publishes. Approved reports move to the publishing queue.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Reviewing publications requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load the review queue" message={errored.message} code={errored.code} redirectedFrom="/dashboard/publishing/review" />
        ) : !data ? null : data.reviewQueue.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="h-5 w-5" />} title="Nothing awaiting review" message="Drafts submitted for review appear here for a governance decision." />
        ) : (
          <div className="space-y-3">
            {data.reviewQueue.map((p) => (
              <Card key={p.id} className="space-y-3 border-border" padded>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">{p.title}</span>
                  <PublicationStateBadge state={p.state} />
                </div>
                <p className="text-caption text-text-secondary">{p.summary}</p>
                <p className="text-[11px] text-text-muted">trust {formatTrust(p.trust_score)} · {p.evidence_count ?? 0} evidence · {p.source_count ?? 0} sources</p>
                <ReviewControl publicationId={p.id} action={reviewPublicationAction} canAct={mayCurate} demo={isDemo} />
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
