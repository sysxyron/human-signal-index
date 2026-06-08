// =============================================================================
// WorldForge Phase 6 — REVIEW QUEUE hub (Server Component, force-dynamic).
// Four sections: Evidence Reviews (links to the existing /dashboard/review/
// evidence), Research Reviews (entity_type='research_run'), Publication Queue
// (status 'approved' awaiting publish), and Escalated Items (status
// 'escalated'). A client ReviewFilters bar updates the querystring; this server
// component reads searchParams and re-fetches via listReviewQueueAction. Full
// loading (Suspense streaming not needed — single await) / error / empty +
// offline handling — never a white screen.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import {
  ClipboardCheck,
  Microscope,
  Send,
  ArrowUpCircle,
  Archive,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import type {
  ReviewQueueItem,
  ReviewQueueStatus,
  ReviewPriority,
  ReviewEntityType,
} from '@hsi/shared-types';
import { listReviewQueueAction } from './actions';
import { ReviewQueueTable } from '@/components/governance/ReviewQueueTable';
import { ReviewFilters } from '@/components/governance/ReviewFilters';
import { priorityWeight } from '@/lib/governance/view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams {
  status?: string;
  priority?: string;
  reviewerId?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters = {
    status: (searchParams.status || undefined) as ReviewQueueStatus | undefined,
    priority: (searchParams.priority || undefined) as ReviewPriority | undefined,
    reviewerId: searchParams.reviewerId || undefined,
    entityType: (searchParams.entityType || undefined) as ReviewEntityType | undefined,
    from: searchParams.from || undefined,
    to: searchParams.to || undefined,
  };

  const res = await listReviewQueueAction(filters);

  return (
    <>
      <TopNav title="Review Queue" subtitle="Human review &amp; curation hub" />
      <main className="space-y-6 p-5 lg:p-6">
        <ReviewFilters />

        {!res.ok ? (
          <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <ClipboardCheck className="h-5 w-5" /> Could not load the review queue
            </h3>
            <p className="text-body-sm text-text-secondary">{res.error}</p>
            {res.code === 'NOT_CONFIGURED' ? (
              <p className="text-caption text-text-muted">
                Supabase is not configured in this environment, so there is no review
                queue to load yet.
              </p>
            ) : res.code === 'AUTH_REQUIRED' ? (
              <Link
                href="/sign-in?redirectedFrom=/dashboard/review"
                className="text-caption font-semibold text-electric hover:text-white"
              >
                Sign in to view the review queue →
              </Link>
            ) : null}
          </Card>
        ) : (
          <QueueSections items={res.data} />
        )}
      </main>
    </>
  );
}

function QueueSections({ items }: { items: ReviewQueueItem[] }) {
  const byPriority = (a: ReviewQueueItem, b: ReviewQueueItem) =>
    priorityWeight(a.queue.priority) - priorityWeight(b.queue.priority) ||
    b.queue.updated_at.localeCompare(a.queue.updated_at);

  const research = items
    .filter((i) => i.queue.entity_type === 'research_run')
    .sort(byPriority);
  const publicationQueue = items
    .filter((i) => i.queue.status === 'approved')
    .sort(byPriority);
  const escalated = items.filter((i) => i.queue.status === 'escalated').sort(byPriority);

  return (
    <div className="space-y-8">
      {/* Evidence Reviews — links to the Phase 5 route */}
      <section className="space-y-3">
        <SectionHeader
          icon={<Archive className="h-5 w-5 text-electric" />}
          title="Evidence Reviews"
          subtitle="Curate the shared citation library"
        />
        <Link href="/dashboard/review/evidence" className="block">
          <Card interactive className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-h6 font-semibold text-text-primary">Evidence Review Queue</h4>
              <p className="text-caption text-text-secondary">
                Validate, reject, or flag evidence sources across all runs.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-caption font-semibold text-electric">
              Open queue <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Card>
        </Link>
      </section>

      {/* Research Reviews */}
      <section className="space-y-3">
        <SectionHeader
          icon={<Microscope className="h-5 w-5 text-electric" />}
          title="Research Reviews"
          subtitle="Research runs awaiting human review"
          count={research.length}
        />
        <ReviewQueueTable
          items={research}
          emptyMessage="No research runs in the review queue. Submit a run for review from its overview page."
        />
      </section>

      {/* Publication Queue */}
      <section className="space-y-3">
        <SectionHeader
          icon={<Send className="h-5 w-5 text-verified" />}
          title="Publication Queue"
          subtitle="Approved items awaiting publication"
          count={publicationQueue.length}
        />
        <ReviewQueueTable
          items={publicationQueue}
          emptyMessage="No approved items awaiting publication."
        />
        <p className="text-caption text-text-muted">
          Manage publishing from the{' '}
          <Link href="/dashboard/curation" className="font-semibold text-electric hover:text-white">
            Curation dashboard
          </Link>
          .
        </p>
      </section>

      {/* Escalated Items */}
      <section className="space-y-3">
        <SectionHeader
          icon={<ArrowUpCircle className="h-5 w-5 text-accent" />}
          title="Escalated Items"
          subtitle="Raised to curators/admins for adjudication"
          count={escalated.length}
          warn={escalated.length > 0}
        />
        {escalated.length > 0 ? (
          <div className="flex items-center gap-2 rounded-btn border border-accent/40 bg-accent/5 px-3 py-2 text-caption text-accent">
            <AlertTriangle className="h-3.5 w-3.5" />
            Escalations are always surfaced — disagreement is never hidden.
          </div>
        ) : null}
        <ReviewQueueTable items={escalated} emptyMessage="No escalated items. " />
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  count,
  warn = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count?: number;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
          {icon}
          {title}
          {count !== undefined ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-caption font-medium ${
                warn
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border bg-surface-2/60 text-text-secondary'
              }`}
            >
              {count}
            </span>
          ) : null}
        </h3>
        <p className="text-caption text-text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
