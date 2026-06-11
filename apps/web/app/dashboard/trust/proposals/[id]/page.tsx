// =============================================================================
// HSI Phase 17 — Recalibration Proposal detail (/dashboard/trust/proposals/[id]).
// Server Component, force-dynamic. getRecalibrationProposalAction(id) returns the
// proposal, a fresh non-mutating review summary (validity checks + guidance), and
// the append-only governance decisions over it. A curator may APPROVE or REJECT
// (required reason) via RecalibrationDecisionControl — approval preserves the
// previous state (reversible) and is audited; "Who approved the change?" is
// answered by the decision history. Researcher+ view; decisions re-checked server.
//
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/recalibration-engine.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Sliders, ArrowLeft, Check, X, ShieldCheck } from 'lucide-react';
import type { RecalibrationProposalView } from '@hsi/shared-types';
import {
  getRecalibrationProposalAction,
  decideRecalibrationProposalAction,
} from '@/lib/trust/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canCurate,
  canResearch,
  demoRecalibrationProposal,
  directionDecor,
  entityTypeDecor,
  formatConfidence,
  formatDateTime,
  readStringArray,
} from '@/lib/trust/view';
import { TrustGovernanceNav } from '@/components/trust/TrustGovernanceNav';
import { ProposalStatusBadge, SeverityBadge } from '@/components/trust/badges';
import { RecalibrationDecisionControl } from '@/components/trust/RecalibrationDecisionControl';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProposalDetailPage({ params }: { params: { id: string } }) {
  const [res, role, user] = await Promise.all([
    getRecalibrationProposalAction(params.id),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);
  const mayDecide = canCurate(role) && Boolean(user);

  let data: RecalibrationProposalView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoRecalibrationProposal(params.id);
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const p = data?.proposal;
  const entity = p ? entityTypeDecor(p.entity_type) : null;
  const dir = p ? directionDecor(p.direction) : null;
  const evidence = p ? readStringArray(p.supporting_evidence) : [];

  return (
    <>
      <TopNav title="Proposal review" subtitle="Who approved the change, and why? — governed, auditable, reversible" />
      <main className="space-y-6 p-5 lg:p-6">
        <TrustGovernanceNav />

        <Link
          href={'/dashboard/trust/proposals' as never}
          className="inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to proposals
        </Link>

        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing proposals requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load the proposal" message={errored.message} code={errored.code} redirectedFrom={`/dashboard/trust/proposals/${params.id}`} />
        ) : !data || !p ? (
          <ErrorState title="Proposal not found" message="This recalibration proposal does not exist." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: the proposal + decision control */}
            <div className="space-y-4">
              <Card className="space-y-3 border-border" padded>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-electric" />
                    <span className="font-semibold" style={{ color: entity!.color }}>
                      {entity!.label}
                    </span>
                    <span className="text-caption text-text-muted">{p.entity_id}</span>
                    {isDemo ? <DemoBadge /> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={p.severity} />
                    <ProposalStatusBadge status={p.status} />
                  </div>
                </div>

                <p className="text-caption leading-relaxed text-text-secondary">{p.reason}</p>

                <div className="grid grid-cols-2 gap-3 rounded-card border border-border bg-surface/50 p-3">
                  <div>
                    <div className="text-label uppercase tracking-wide text-text-muted">Current</div>
                    <div className="text-h5 font-bold text-text-primary">{formatConfidence(p.current_confidence)}</div>
                  </div>
                  <div>
                    <div className="text-label uppercase tracking-wide text-text-muted">Recommended</div>
                    <div className="text-h5 font-bold" style={{ color: dir!.color }}>
                      {formatConfidence(p.recommended_confidence)}
                    </div>
                  </div>
                  <div className="col-span-2 text-caption" style={{ color: dir!.color }}>
                    {dir!.description} · trigger <span className="text-text-secondary">{p.trigger}</span>
                  </div>
                </div>

                {evidence.length > 0 ? (
                  <div>
                    <div className="text-label uppercase tracking-wide text-text-muted">Supporting evidence</div>
                    <ul className="mt-1 ml-4 list-disc space-y-0.5 text-[12px] text-text-secondary">
                      {evidence.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>

              <Card className="space-y-3 border-border" padded>
                <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                  <ShieldCheck className="h-4 w-4 text-electric" /> Governance decision
                </h3>
                <RecalibrationDecisionControl
                  proposalId={p.id}
                  status={p.status}
                  action={decideRecalibrationProposalAction}
                  canDecide={mayDecide}
                  demo={isDemo}
                />
              </Card>
            </div>

            {/* Right: the review summary + decision history */}
            <div className="space-y-4">
              <Card className="space-y-3 border-border" padded>
                <h3 className="text-h6 font-semibold text-text-primary">Review checklist</h3>
                <p className="text-caption leading-relaxed text-text-secondary">{data.review.recommendation}</p>
                <ul className="space-y-1.5">
                  {data.review.checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-caption">
                      {c.ok ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verified" />
                      ) : (
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk" />
                      )}
                      <span className="text-text-secondary">
                        <span className="font-medium text-text-primary">{c.label}</span> — {c.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="space-y-3 border-border" padded>
                <h3 className="text-h6 font-semibold text-text-primary">Decision history</h3>
                {data.reviews.length === 0 ? (
                  <p className="text-caption text-text-muted">No decision recorded yet — this proposal is awaiting review.</p>
                ) : (
                  <div className="space-y-3">
                    {data.reviews.map((r) => {
                      const trail = readStringArray(r.audit_trail);
                      return (
                        <div key={r.id} className="rounded-card border border-border bg-surface/50 p-3">
                          <div className="flex items-center justify-between">
                            <ProposalStatusBadge status={r.decision} />
                            <span className="text-caption text-text-muted">{formatDateTime(r.created_at)}</span>
                          </div>
                          {r.reason ? (
                            <p className="mt-1.5 text-caption text-text-secondary">
                              <span className="font-semibold text-text-primary">Reason: </span>
                              {r.reason}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-text-muted">
                            Reviewer: {r.reviewer_id ?? 'unknown'} · reversible: {r.reversible ? 'yes' : 'no'}
                          </p>
                          {trail.length > 0 ? (
                            <ul className="mt-1.5 ml-4 list-disc space-y-0.5 text-[11px] text-text-muted">
                              {trail.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
