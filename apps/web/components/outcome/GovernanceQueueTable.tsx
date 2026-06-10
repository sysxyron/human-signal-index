// =============================================================================
// HSI Phase 15 — GovernanceQueueTable. Lists outcomes awaiting human review. Each
// item shows the outcome status, success score, confidence update (before→after),
// a link to the full audit trail, the per-item review history, and (for reviewer+)
// the GovernanceReviewControls (validate / approve / reject / escalate + notes).
// Non-authorised reviewers see read-only review history. Server component that
// embeds the client review controls. NOT an auto-action — a human decides.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ShieldCheck, ArrowRight, History } from 'lucide-react';
import type {
  HsinGovernanceReviewRecord,
  HsinRecommendationOutcomeRecord,
} from '@hsi/shared-types';
import { OutcomeStatusBadge, GovernanceDecisionBadge } from './badges';
import { SuccessScoreBar } from './SuccessScore';
import { ConfidenceDeltaChip } from './ConfidenceDeltaChip';
import {
  GovernanceReviewControls,
  type ReviewDecision,
} from './GovernanceReviewControls';
import { formatDate, formatDateTime, reviewsForOutcome } from '@/lib/outcome/view';

type DbErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
type ReviewResult = { ok: true } | { ok: false; error: string; code?: DbErrorCode };

export function GovernanceQueueTable({
  outcomes,
  reviews,
  reviewAction,
  canReview,
  authenticated,
  demo = false,
}: {
  outcomes: HsinRecommendationOutcomeRecord[];
  reviews: HsinGovernanceReviewRecord[];
  reviewAction: (
    outcomeId: string,
    decision: ReviewDecision,
    notes?: string,
  ) => Promise<ReviewResult>;
  canReview: boolean;
  authenticated: boolean;
  demo?: boolean;
}) {
  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <ShieldCheck className="h-4 w-4 text-electric" /> Outcomes awaiting review
        </h3>
        <span className="ml-auto text-caption text-text-muted">
          human-in-the-loop — never auto-validated
        </span>
      </div>

      {outcomes.length === 0 ? (
        <p className="text-caption text-text-muted">
          The governance queue is clear — no outcomes are currently awaiting review.
        </p>
      ) : (
        <ul className="space-y-4">
          {outcomes.map((o) => {
            const history = reviewsForOutcome(reviews, o.id);
            return (
              <li
                key={o.id}
                className="space-y-3 rounded-card border border-border bg-surface-2/30 p-3.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <OutcomeStatusBadge status={o.status} />
                  <ConfidenceDeltaChip
                    before={o.confidence_before}
                    after={o.confidence_after}
                    compact
                  />
                  <span className="ml-auto text-caption text-text-muted">
                    Recorded {formatDate(o.created_at)}
                  </span>
                  <Link
                    href={`/dashboard/outcomes/${encodeURIComponent(o.id)}` as never}
                    className="inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
                  >
                    Audit <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="max-w-md">
                  <SuccessScoreBar score={o.success_score} />
                </div>

                {history.length > 0 ? (
                  <div className="space-y-1.5 border-t border-border/60 pt-2.5">
                    <h4 className="flex items-center gap-1.5 text-label text-text-muted">
                      <History className="h-3.5 w-3.5" /> Review history
                    </h4>
                    <ul className="space-y-1.5">
                      {history.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2">
                          <GovernanceDecisionBadge decision={r.decision} />
                          {r.notes ? (
                            <span className="text-caption text-text-secondary">
                              {r.notes}
                            </span>
                          ) : null}
                          <span className="ml-auto text-caption text-text-muted">
                            {formatDateTime(r.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="border-t border-border/60 pt-2.5">
                  <GovernanceReviewControls
                    outcomeId={o.id}
                    action={reviewAction}
                    canReview={canReview}
                    authenticated={authenticated}
                    demo={demo}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
