// =============================================================================
// HSI Phase 15 — Outcome Detail + Audit Trail (/dashboard/outcomes/[id]). Server
// Component, force-dynamic. getOutcomeAction(id) returns the OutcomeView. Renders
// the FULL traceable chain:
//   Recommendation → Expected Outcome → Observed Outcome → Success Score →
//   Confidence Update (before→after, delta) → Governance Review.
// Shows the measurements table (metric / expected / observed / delta / within), the
// explanation list, the limitations panel, the status badge + success score ring,
// the prior governance reviews, and the full audit-trail steps in order. A feedback
// control (authenticated) leaves a 1..5 rating + notes via addOutcomeFeedbackAction.
// Offline (NOT_CONFIGURED) → labeled demo from the outcomeDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { ArrowLeft, GitBranch, Target } from 'lucide-react';
import type { OutcomeView } from '@hsi/shared-types';
import {
  getOutcomeAction,
  addOutcomeFeedbackAction,
} from '@/lib/outcome/actions';
import { getUser } from '@/lib/supabase/server';
import {
  demoOutcomeView,
  formatConfidence,
  formatDate,
  readExplanation,
  readMetricEntries,
  readOutcomeLimitations,
} from '@/lib/outcome/view';
import { OutcomeNav } from '@/components/outcome/OutcomeNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { OutcomeStatusBadge, GovernanceDecisionBadge } from '@/components/outcome/badges';
import { SuccessScoreRing } from '@/components/outcome/SuccessScore';
import { ConfidenceDeltaChip } from '@/components/outcome/ConfidenceDeltaChip';
import { MeasurementsTable } from '@/components/outcome/MeasurementsTable';
import {
  OutcomeLimitations,
  OutcomeExplanation,
} from '@/components/outcome/OutcomeLimitations';
import { OutcomeAuditTrail } from '@/components/outcome/OutcomeAuditTrail';
import { OutcomeFeedbackControl } from '@/components/outcome/OutcomeFeedbackControl';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OutcomeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = decodeURIComponent(params.id);
  const [res, user] = await Promise.all([getOutcomeAction(id), getUser()]);

  let view: OutcomeView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoOutcomeView(id);
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const o = view?.outcome;
  const expected = o ? readMetricEntries(o.expected_outcome) : [];
  const observed = o ? readMetricEntries(o.observed_outcome) : [];
  const explanation = o ? readExplanation(o) : [];
  const limitations = o ? readOutcomeLimitations(o) : [];
  const run = view?.decisionRun;

  return (
    <>
      <TopNav
        title="Outcome Detail"
        subtitle="The full traceable chain — recommendation → observed → verdict"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <OutcomeNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <GitBranch className="h-5 w-5 text-electric" /> Outcome
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <Link
            href={'/dashboard/outcomes' as never}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to performance
          </Link>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState
            title="Could not load outcome"
            message={errored.message}
            code={errored.code}
            redirectedFrom={`/dashboard/outcomes/${id}`}
          />
        ) : !view || !o ? (
          <ErrorState title="Outcome not found" message="This outcome does not exist or is not visible to you." />
        ) : (
          <div className="space-y-6">
            {/* Headline: status + success score + confidence update */}
            <Card className="space-y-4" padded>
              <div className="flex flex-wrap items-center gap-3">
                <OutcomeStatusBadge status={o.status} />
                <ConfidenceDeltaChip
                  before={o.confidence_before}
                  after={o.confidence_after}
                />
                <span className="ml-auto text-caption text-text-muted">
                  Recorded {formatDate(o.created_at)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <SuccessScoreRing score={o.success_score} size={72} label="Success score" />
                <div className="min-w-0 space-y-1">
                  {run ? (
                    <p className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
                      <Target className="h-4 w-4 text-electric" />
                      {run.recommended_action || run.decision_name || 'Recommendation'}
                    </p>
                  ) : null}
                  <p className="text-caption text-text-muted">
                    Confidence updated from {formatConfidence(o.confidence_before)} to{' '}
                    {formatConfidence(o.confidence_after)} after the observed outcome — an
                    aid for a human reviewer, never a certainty.
                  </p>
                  {o.notes ? (
                    <p className="text-caption text-text-secondary">{o.notes}</p>
                  ) : null}
                </div>
              </div>
            </Card>

            {/* The traceable chain: Recommendation → Expected → Observed → Verdict */}
            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <GitBranch className="h-4 w-4 text-electric" /> Recommendation → Expected →
                Observed
              </h3>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2 rounded-card border border-border bg-surface-2/40 p-3">
                  <h4 className="text-label text-text-muted">Expected outcome</h4>
                  {expected.length === 0 ? (
                    <p className="text-caption text-text-muted">No expected metrics recorded.</p>
                  ) : (
                    <dl className="space-y-1">
                      {expected.map((e) => (
                        <div key={e.key} className="flex items-center justify-between gap-2">
                          <dt className="text-caption text-text-secondary">{e.label}</dt>
                          <dd className="text-caption font-semibold text-text-primary">
                            {e.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
                <div className="space-y-2 rounded-card border border-border bg-surface-2/40 p-3">
                  <h4 className="text-label text-text-muted">Observed outcome</h4>
                  {observed.length === 0 ? (
                    <p className="text-caption text-text-muted">No observed metrics recorded.</p>
                  ) : (
                    <dl className="space-y-1">
                      {observed.map((e) => (
                        <div key={e.key} className="flex items-center justify-between gap-2">
                          <dt className="text-caption text-text-secondary">{e.label}</dt>
                          <dd className="text-caption font-semibold text-text-primary">
                            {e.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            </Card>

            {/* Measurements (the grounding for the success score) */}
            <MeasurementsTable measurements={view.measurements} />

            {/* Explanation + limitations */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-3" padded>
                <OutcomeExplanation explanation={explanation} />
              </Card>
              <OutcomeLimitations limitations={limitations} />
            </div>

            {/* Governance reviews over this outcome */}
            {view.governance.length > 0 ? (
              <Card className="space-y-3" padded>
                <h3 className="text-h6 font-semibold text-text-primary">Governance review</h3>
                <ul className="space-y-2">
                  {view.governance.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-2">
                      <GovernanceDecisionBadge decision={g.decision} />
                      {g.notes ? (
                        <span className="text-caption text-text-secondary">{g.notes}</span>
                      ) : null}
                      <span className="ml-auto text-caption text-text-muted">
                        {formatDate(g.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-text-muted">
                  Run the full governance workflow from the{' '}
                  <Link
                    href={'/dashboard/governance' as never}
                    className="font-semibold text-electric hover:text-white"
                  >
                    governance console
                  </Link>
                  .
                </p>
              </Card>
            ) : null}

            {/* Full audit trail (the 6-step chain) */}
            <OutcomeAuditTrail steps={view.auditTrail} />

            {/* Feedback */}
            <OutcomeFeedbackControl
              outcomeId={o.id}
              action={addOutcomeFeedbackAction}
              canSubmit={Boolean(user)}
              demo={isDemo}
            />
          </div>
        )}
      </main>
    </>
  );
}
