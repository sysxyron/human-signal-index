// =============================================================================
// HSI Phase 15 — Governance Workflow (/dashboard/governance). Server Component,
// force-dynamic. getGovernanceQueueAction() returns the GovernanceQueueData:
// outcomes awaiting validation, the reviews over them, and the open decision-alert
// feed. Reviewer+ (reviewer / curator / admin) can Validate / Approve / Reject /
// Escalate an outcome with notes → reviewOutcomeAction (useTransition). The review
// history per item is shown. Validation is GATED server-side via getSessionRole —
// non-authorised users get a read-only view + a permission notice. NOT an
// auto-action: a human always makes the call. Offline (NOT_CONFIGURED) → labeled
// demo from the outcomeDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ShieldCheck, Info } from 'lucide-react';
import type { GovernanceQueueData } from '@hsi/shared-types';
import {
  getGovernanceQueueAction,
  reviewOutcomeAction,
} from '@/lib/outcome/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canReview, demoGovernanceQueue } from '@/lib/outcome/view';
import { OutcomeNav } from '@/components/outcome/OutcomeNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { GovernanceQueueTable } from '@/components/outcome/GovernanceQueueTable';
import { OutcomeAlertList } from '@/components/outcome/OutcomeAlertList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GovernancePage() {
  const [res, role, user] = await Promise.all([
    getGovernanceQueueAction(),
    getSessionRole(),
    getUser(),
  ]);
  // Reviewer+ AND authenticated may record a governance verdict (re-checked
  // server-side inside reviewOutcomeAction via getSessionRole).
  const authenticated = Boolean(user);
  const canAct = canReview(role) && authenticated;

  let data: GovernanceQueueData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    data = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    data = demoGovernanceQueue();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  return (
    <>
      <TopNav
        title="Governance"
        subtitle="Human-in-the-loop validation of recommendation outcomes"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <OutcomeNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <ShieldCheck className="h-5 w-5 text-electric" /> Governance queue
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Governance is the human-in-the-loop layer over the outcome loop. A
            reviewer validates, approves, rejects, or escalates a recorded outcome —
            and the decision-intelligence alert feed surfaces failures, confidence
            drift, spikes, and anomalies for triage. Nothing is auto-validated: every
            verdict is{' '}
            <span className="font-semibold text-text-primary">a human decision</span>,
            and the full audit trail is always one click away.
          </p>
        </Card>

        {!canAct ? (
          <div className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning/5 px-4 py-3 text-caption text-warning">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {authenticated
                ? 'Read-only view — governance validation requires a reviewer, curator, or admin role.'
                : 'Sign in as a reviewer, curator, or admin to action the governance queue. The queue below is read-only.'}
            </span>
          </div>
        ) : null}

        {errored ? (
          <ErrorState
            title="Could not load the governance queue"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/governance"
          />
        ) : !data ? null : (
          <div className="space-y-6">
            <GovernanceQueueTable
              outcomes={data.pendingOutcomes}
              reviews={data.reviews}
              reviewAction={reviewOutcomeAction}
              canReview={canAct}
              authenticated={authenticated}
              demo={isDemo}
            />
            <OutcomeAlertList alerts={data.alerts} />
          </div>
        )}
      </main>
    </>
  );
}
