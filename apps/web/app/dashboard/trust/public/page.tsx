// =============================================================================
// HSI Phase 17 — Public Trust (/dashboard/trust/public). Server Component,
// force-dynamic. getPublicTrustAction() returns every tracked entity rendered
// TRANSPARENTLY: Trust Score, Reliability, Calibration Quality, Outcome Accuracy,
// Evidence Quality, and Governance History (TrustBreakdownPanel) + the
// TrustProvenancePanel ("why trust exists, where it came from, how it changed").
// No black-box scores. Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/trust-history fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Eye, Info } from 'lucide-react';
import type { PublicTrustData } from '@hsi/shared-types';
import { getPublicTrustAction } from '@/lib/trust/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canResearch,
  demoPublicTrust,
  entityTypeDecor,
  formatTrustScore,
} from '@/lib/trust/view';
import { TrustGovernanceNav } from '@/components/trust/TrustGovernanceNav';
import { TrustBreakdownPanel } from '@/components/trust/TrustBreakdownPanel';
import { TrustProvenancePanel } from '@/components/trust/TrustProvenancePanel';
import { TrustBandBadge, TrendBadge } from '@/components/trust/badges';
import { TrustScoreRing } from '@/components/calibration/TrustScoreRing';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PublicTrustPage({
  searchParams,
}: {
  searchParams: { entityId?: string };
}) {
  const expanded = searchParams.entityId?.trim() || undefined;

  const [res, role, user] = await Promise.all([
    getPublicTrustAction(),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);

  let data: PublicTrustData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoPublicTrust();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const hasData = (data?.entries.length ?? 0) > 0;

  return (
    <>
      <TopNav
        title="Public trust"
        subtitle="How trustworthy is this intelligence? — transparent, explainable, never a black box"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <TrustGovernanceNav />

        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Eye className="h-5 w-5 text-electric" /> Trust surface
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Every score is shown with the inputs that produced it — reliability, calibration,
            outcome accuracy, evidence quality, and governance history — plus full provenance and
            explicit limitations. Trust is advisory, never a guarantee.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing public trust requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load public trust" message={errored.message} code={errored.code} redirectedFrom="/dashboard/trust/public" />
        ) : !data ? null : !hasData ? (
          <EmptyState
            icon={<Eye className="h-5 w-5" />}
            title="No trust to surface yet"
            message="Recompute trust (curator+) and record history so entities appear here with their full breakdown."
          />
        ) : (
          <div className="space-y-4">
            {data.entries.map((entry) => {
              const entity = entityTypeDecor(entry.entityType);
              const isOpen = expanded === entry.entityId;
              return (
                <Card key={`${entry.entityType}:${entry.entityId}`} className="space-y-4 border-border" padded>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <TrustScoreRing score={entry.trustScore} size={52} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold" style={{ color: entity.color }}>
                            {entity.label}
                          </span>
                          <span className="text-caption text-text-muted">{entry.entityId}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <TrustBandBadge band={entry.band} />
                          {entry.trend ? <TrendBadge trend={entry.trend} /> : null}
                        </div>
                      </div>
                    </div>
                    <span className="text-h4 font-bold tabular-nums text-text-primary">
                      {formatTrustScore(entry.trustScore)}
                    </span>
                  </div>

                  <TrustBreakdownPanel entry={entry} />

                  {isOpen && entry.provenance ? (
                    <TrustProvenancePanel provenance={entry.provenance} />
                  ) : entry.provenance ? (
                    <a
                      href={`/dashboard/trust/public?entityId=${encodeURIComponent(entry.entityId)}#${entry.entityId}`}
                      className="inline-block text-caption font-semibold text-electric hover:underline"
                    >
                      Show provenance →
                    </a>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
