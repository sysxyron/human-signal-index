// =============================================================================
// HSI Phase 9 — Dead-Letter Queue (/dashboard/operations/dead-letter). Server
// Component, force-dynamic. Jobs that exhausted their retry budget and were
// parked off the live queue. listDeadLetterJobsAction(); per-row Requeue
// (curator+, useTransition). Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Skull, Info, ArrowLeft } from 'lucide-react';
import type { HsinDeadLetterJobRecord } from '@hsi/shared-types';
import { listDeadLetterJobsAction } from '@/lib/operations/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canRequeue as canRequeueRole, demoDeadLetterJobs } from '@/lib/operations/phase9-view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';
import { DeadLetterTable } from '@/components/providers/DeadLetterTable';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DeadLetterPage() {
  const [res, role, user] = await Promise.all([
    listDeadLetterJobsAction(),
    getSessionRole(),
    getUser(),
  ]);

  const canRequeue = canRequeueRole(role) && Boolean(user);

  let jobs: HsinDeadLetterJobRecord[] | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    jobs = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    jobs = demoDeadLetterJobs();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  return (
    <>
      <TopNav title="Dead-Letter Queue" subtitle="Jobs that exhausted every retry" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Skull className="h-5 w-5 text-risk" /> Dead-letter queue
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <Link
            href={'/dashboard/operations' as never}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Operations console
          </Link>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="space-y-2 border-electric/30 bg-electric/5" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-electric">
            <Info className="h-4 w-4" /> What is the dead-letter queue?
          </h3>
          <p className="text-caption leading-relaxed text-text-secondary">
            When a background job (a capture, a triage pass, a graph build) fails repeatedly
            and uses up its entire retry budget, it is moved off the live queue and parked
            here instead of looping forever. This keeps the live queue healthy while making
            every terminal failure visible — with its reason and last error — so an operator
            can diagnose the root cause and, once fixed, <strong className="text-text-primary">requeue</strong>{' '}
            the job back onto the live queue. Nothing here is ever silently dropped.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load the dead-letter queue"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/operations/dead-letter"
          />
        ) : jobs ? (
          <DeadLetterTable jobs={jobs} canRequeue={canRequeue} demo={isDemo} />
        ) : null}
      </main>
    </>
  );
}
