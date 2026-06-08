// =============================================================================
// WorldForge Phase 6 — REVIEW ITEM detail (Server Component, force-dynamic).
// getReviewItemAction(id) -> review status + assigned reviewer + decision notes,
// and (for research_run entities) the evidence coverage / contradictions /
// consensus + governed confidence via GovernedConfidencePanel. Interactive:
// ReviewDecisionPanel (reviewer+), AssignReviewerControl (curator+), a threaded
// CommentThread with @mentions, a ReviewProvenancePanel (Claim -> Evidence ->
// Reviewer -> Decision -> Timestamp), and an AuditTrailList. Curators get a
// "Publish" affordance for research runs. Full error/empty/auth handling.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { ClipboardCheck, UserCheck, Send, ArrowRight } from 'lucide-react';
import { getUser, getSessionRole } from '@/lib/supabase/server';
import { getReviewItemAction } from '../actions';
import { ReviewStatusBadge } from '@/components/governance/ReviewStatusBadge';
import { PriorityBadge } from '@/components/governance/PriorityBadge';
import { GovernedConfidencePanel } from '@/components/governance/GovernedConfidencePanel';
import { ReviewDecisionPanel } from '@/components/governance/ReviewDecisionPanel';
import { AssignReviewerControl } from '@/components/governance/AssignReviewerControl';
import { CommentThread } from '@/components/governance/CommentThread';
import { ReviewProvenancePanel } from '@/components/governance/ReviewProvenancePanel';
import { AuditTrailList } from '@/components/governance/AuditTrailList';
import {
  entityDisplayLabel,
  entityLabel,
  fmtDate,
  roleAtLeast,
} from '@/lib/governance/view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReviewItemPage({ params }: { params: { id: string } }) {
  const [res, user, role] = await Promise.all([
    getReviewItemAction(params.id),
    getUser(),
    getSessionRole(),
  ]);

  const isAuthenticated = Boolean(user);

  if (!res.ok) {
    return (
      <>
        <TopNav title="Review item" subtitle="Human review" />
        <main className="space-y-4 p-5 lg:p-6">
          <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <ClipboardCheck className="h-5 w-5" /> Could not load this review item
            </h3>
            <p className="text-body-sm text-text-secondary">{res.error}</p>
            {res.code === 'AUTH_REQUIRED' ? (
              <Link
                href={`/sign-in?redirectedFrom=/dashboard/review/${params.id}`}
                className="text-caption font-semibold text-electric hover:text-white"
              >
                Sign in to view this item →
              </Link>
            ) : res.code === 'FORBIDDEN' ? (
              <p className="text-caption text-text-muted">
                You don&apos;t have permission to view this item.
              </p>
            ) : null}
          </Card>
          <Link
            href="/dashboard/review"
            className="text-caption font-semibold text-electric hover:text-white"
          >
            ← Back to review queue
          </Link>
        </main>
      </>
    );
  }

  const { queue, assignments, decisions, comments, entitySummary } = res.data;
  const label = entityDisplayLabel(queue.entity_type, queue.entity_id, entitySummary);
  const latestAssignment = [...assignments].sort((a, b) =>
    b.assigned_at.localeCompare(a.assigned_at),
  )[0];
  const isResearchRun = queue.entity_type === 'research_run';
  const canPublish = isAuthenticated && roleAtLeast(role, 'curator');

  return (
    <>
      <TopNav title={label} subtitle={`${entityLabel(queue.entity_type)} review`} />
      <main className="space-y-6 p-5 lg:p-6">
        <Link
          href="/dashboard/review"
          className="inline-flex items-center gap-1 text-caption font-semibold text-text-muted hover:text-electric"
        >
          ← Back to review queue
        </Link>

        {/* Header / status */}
        <Card className="flex flex-wrap items-center justify-between gap-4" padded>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ReviewStatusBadge status={queue.status} />
              <PriorityBadge priority={queue.priority} />
            </div>
            <p className="text-caption text-text-muted">
              {entityLabel(queue.entity_type)} · {queue.entity_id} · created{' '}
              {fmtDate(queue.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 text-caption text-text-secondary">
            <UserCheck className="h-4 w-4 text-electric" />
            {queue.assigned_to ? (
              <span>Assigned to {queue.assigned_to.slice(0, 12)}</span>
            ) : (
              <span className="text-text-muted">Unassigned</span>
            )}
          </div>
        </Card>

        {isResearchRun ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/dashboard/worldforge/research/${queue.entity_id}`}
              className="inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
            >
              View research run <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            {canPublish ? (
              <Link
                href={`/dashboard/curation?publish=${queue.entity_id}`}
                className="inline-flex items-center gap-1.5 rounded-btn border border-verified/40 bg-verified/5 px-3 py-1.5 text-caption font-semibold text-verified transition hover:bg-verified/10"
              >
                <Send className="h-3.5 w-3.5" /> Publish (curator)
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {isResearchRun ? <GovernedConfidencePanel entitySummary={entitySummary} /> : null}

            <ReviewProvenancePanel decisions={decisions} entitySummary={entitySummary} />

            <CommentThread
              entityType={queue.entity_type}
              entityId={queue.entity_id}
              isAuthenticated={isAuthenticated}
            />

            <AuditTrailList entityType={queue.entity_type} entityId={queue.entity_id} />
          </div>

          <div className="space-y-6">
            <ReviewDecisionPanel
              queueId={queue.id}
              role={role}
              isAuthenticated={isAuthenticated}
            />
            <AssignReviewerControl
              queueId={queue.id}
              role={role}
              isAuthenticated={isAuthenticated}
              currentReviewer={
                queue.assigned_to ?? latestAssignment?.reviewer_id ?? undefined
              }
            />
          </div>
        </div>
      </main>
    </>
  );
}
