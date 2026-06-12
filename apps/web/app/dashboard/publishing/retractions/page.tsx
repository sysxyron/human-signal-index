// =============================================================================
// HSI Phase 19 — Retractions (/dashboard/publishing/retractions). Server
// Component, force-dynamic. Lists every retraction (reason + detail + who + when)
// from the publishing dashboard payload. Retractions remain visible — history is
// never deleted. Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { AlertOctagon, Info } from 'lucide-react';
import type { PublishingDashboardData } from '@hsi/shared-types';
import { getPublishingDashboardAction } from '@/lib/publishing/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoPublishingDashboard, formatDateTime, retractionReasonLabel } from '@/lib/publishing/view';
import { PublishingNav } from '@/components/publishing/PublishingNav';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RetractionsPage() {
  const [res, role, user] = await Promise.all([getPublishingDashboardAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);

  let data: PublishingDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoPublishingDashboard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const retractions = data?.retractions ?? [];

  return (
    <>
      <TopNav title="Retractions" subtitle="What was retracted and why? — kept visible for the record, never deleted" />
      <main className="space-y-6 p-5 lg:p-6">
        <PublishingNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <AlertOctagon className="h-5 w-5 text-risk" /> Retractions
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            A retraction marks a published report as withdrawn while keeping it
            <span className="font-semibold text-text-primary"> visible</span> with its reason — history is never
            deleted, so the public record stays honest.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing retractions requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load retractions" message={errored.message} code={errored.code} redirectedFrom="/dashboard/publishing/retractions" />
        ) : retractions.length === 0 ? (
          <EmptyState icon={<AlertOctagon className="h-5 w-5" />} title="No retractions" message="Retracted reports appear here with their reason and detail." />
        ) : (
          <div className="space-y-3">
            {retractions.map((r) => (
              <Card key={r.id} className="space-y-1 border-risk/40" padded>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-risk/10 px-2 py-0.5 text-caption font-semibold text-risk">{retractionReasonLabel(r.reason)}</span>
                  <span className="text-[11px] text-text-muted">{formatDateTime(r.created_at)}</span>
                </div>
                <p className="text-caption text-text-secondary">{r.detail}</p>
                <p className="text-[11px] text-text-muted">
                  Was {r.previous_state}.{' '}
                  {r.publication_id ? <Link href={`/dashboard/publishing` as never} className="text-electric hover:underline">View in dashboard</Link> : null}
                </p>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
