// =============================================================================
// HSI Phase 20 — Debates (/dashboard/debates). Server Component, force-dynamic.
// getDebatesBoardAction() returns evidence claims under contention (most-
// challenged first) + the open challenges across investigations. Answers "what
// evidence is in dispute?". Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { MessagesSquare } from 'lucide-react';
import type { DebatesBoardData } from '@hsi/shared-types';
import { getDebatesBoardAction } from '@/lib/collective/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoDebatesBoard, formatPct } from '@/lib/collective/view';
import { CollectiveNav } from '@/components/collective/CollectiveNav';
import { EvidenceDebatePanel } from '@/components/collective/panels';
import { ChallengeStatusBadge } from '@/components/collective/badges';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DebatesPage() {
  const [res, role, user] = await Promise.all([getDebatesBoardAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);

  let data: DebatesBoardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoDebatesBoard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Debates" subtitle="Evidence under contention — support, challenges, and reviews" />
      <main className="space-y-6 p-5 lg:p-6">
        <CollectiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <MessagesSquare className="h-5 w-5 text-electric" /> Evidence debates
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing debates requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load debates" message={errored.message} code={errored.code} redirectedFrom="/dashboard/debates" />
        ) : !data || (data.claims.length === 0 && data.challenges.length === 0) ? (
          <EmptyState icon={<MessagesSquare className="h-5 w-5" />} title="No active debates" message="Evidence claims and open challenges appear here as investigations progress." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <EvidenceDebatePanel claims={data.claims} />
            <Card className="space-y-3 border-border" padded>
              <h3 className="text-h6 font-semibold text-text-primary">Open challenges</h3>
              {data.challenges.length === 0 ? (
                <p className="text-caption text-text-muted">No open challenges.</p>
              ) : (
                <ul className="space-y-2">
                  {data.challenges.map((c) => (
                    <li key={c.id} className="rounded-card border border-border bg-surface/50 p-2">
                      <div className="flex items-center justify-between">
                        <Link href={`/dashboard/investigations/${c.investigation_id}` as never} className="text-[11px] text-electric hover:underline">
                          investigation {c.investigation_id?.slice(0, 8)}
                        </Link>
                        <ChallengeStatusBadge status={c.status} />
                      </div>
                      <p className="mt-1 text-caption text-text-secondary">{c.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </main>
    </>
  );
}
