// =============================================================================
// HSI Phase 17 — Recalibration Proposals (/dashboard/trust/proposals). Server
// Component, force-dynamic. getRecalibrationQueueAction() returns the proposal
// queue (optionally filtered by ?status=) + pending/approved/rejected counts.
// Each proposal recommends a confidence recalibration — a PROPOSAL only, decided
// by a human via governance. Researcher+ view; decisions on the detail page.
//
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/recalibration-engine.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Sliders, Info } from 'lucide-react';
import type { ProposalStatus, RecalibrationQueueData } from '@hsi/shared-types';
import { getRecalibrationQueueAction } from '@/lib/trust/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canResearch,
  demoRecalibrationQueue,
  directionDecor,
  entityTypeDecor,
  formatConfidence,
} from '@/lib/trust/view';
import { TrustGovernanceNav } from '@/components/trust/TrustGovernanceNav';
import { ProposalStatusBadge, SeverityBadge } from '@/components/trust/badges';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUSES: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function isStatus(v: string | undefined): v is ProposalStatus {
  return v === 'pending' || v === 'approved' || v === 'rejected';
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const statusFilter = isStatus(searchParams.status) ? searchParams.status : undefined;

  const [res, role, user] = await Promise.all([
    getRecalibrationQueueAction(statusFilter),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);

  let data: RecalibrationQueueData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoRecalibrationQueue();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const hasData = (data?.proposals.length ?? 0) > 0;
  const active = statusFilter ?? 'all';

  return (
    <>
      <TopNav
        title="Recalibration proposals"
        subtitle="What recalibration is recommended? — proposals only, decided by humans"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <TrustGovernanceNav />

        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Sliders className="h-5 w-5 text-electric" /> Proposal queue
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            A proposal <span className="font-semibold text-text-primary">recommends</span> a
            confidence change; it is never applied automatically. A curator approves or rejects it
            with a required reason — approval preserves the previous state (reversible) and is fully
            audited.
          </p>
        </Card>

        {data ? (
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => {
              const isActive = active === s.value;
              const href = s.value === 'all' ? '/dashboard/trust/proposals' : `/dashboard/trust/proposals?status=${s.value}`;
              const count =
                s.value === 'pending'
                  ? data!.pendingCount
                  : s.value === 'approved'
                    ? data!.approvedCount
                    : s.value === 'rejected'
                      ? data!.rejectedCount
                      : data!.pendingCount + data!.approvedCount + data!.rejectedCount;
              return (
                <Link
                  key={s.value}
                  href={href as never}
                  className="rounded-full px-3 py-1 text-caption font-semibold transition"
                  style={
                    isActive
                      ? { backgroundColor: '#3B82F61f', color: '#3B82F6', border: '1px solid #3B82F655' }
                      : { color: '#94A3B8', border: '1px solid #2A3A5C' }
                  }
                >
                  {s.label} {isDemo ? '' : `(${count})`}
                </Link>
              );
            })}
          </div>
        ) : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing proposals requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load proposals" message={errored.message} code={errored.code} redirectedFrom="/dashboard/trust/proposals" />
        ) : !data ? null : !hasData ? (
          <EmptyState
            icon={<Sliders className="h-5 w-5" />}
            title="No recalibration proposals"
            message="When trust drifts or calibration error crosses threshold, the worker (or a curator) raises a proposal here for review."
          />
        ) : (
          <div className="space-y-3">
            {data.proposals.map((p) => {
              const entity = entityTypeDecor(p.entity_type);
              const dir = directionDecor(p.direction);
              return (
                <Link
                  key={p.id}
                  href={`/dashboard/trust/proposals/${p.id}` as never}
                  className="block"
                >
                  <Card className="border-border transition hover:border-electric/50" padded>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entity.color }} />
                        <span className="font-medium" style={{ color: entity.color }}>
                          {entity.label}
                        </span>
                        <span className="text-caption text-text-muted">{p.entity_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={p.severity} />
                        <ProposalStatusBadge status={p.status} />
                      </div>
                    </div>
                    <p className="mt-2 text-caption leading-relaxed text-text-secondary">{p.reason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-muted">
                      <span style={{ color: dir.color }}>{dir.description}</span>
                      <span>
                        Confidence{' '}
                        <span className="font-semibold text-text-secondary">
                          {formatConfidence(p.current_confidence)}
                        </span>{' '}
                        →{' '}
                        <span className="font-semibold" style={{ color: dir.color }}>
                          {formatConfidence(p.recommended_confidence)}
                        </span>
                      </span>
                      <span className="text-electric">Review →</span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
