// =============================================================================
// HSI Phase 17 — Trust History (/dashboard/trust/history). Server Component,
// force-dynamic. getTrustHistoryDashboardAction() returns per-entity rows (latest
// score + trend + sparkline) built from the APPEND-ONLY hsin_trust_history series,
// plus the drift timeline and trend counts (TrustTrendPanel).
//
// When ?entityType=&entityId= is present, the entity's full TrustHistoryView is
// shown via getTrustHistoryForAction: the TrustHistoryChart, its trend
// explanation, the latest drift, and the TrustProvenancePanel ("why & how it
// changed"). Curator/admin may append a snapshot via recordTrustHistoryAction.
// Researcher+ view; mutations re-checked server-side.
//
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/trust-history fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { History, Info } from 'lucide-react';
import type {
  TrustEntityType,
  TrustHistoryDashboardData,
  TrustHistoryView,
} from '@hsi/shared-types';
import {
  getTrustHistoryDashboardAction,
  getTrustHistoryForAction,
  recordTrustHistoryAction,
} from '@/lib/trust/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canCurate,
  canResearch,
  demoTrustHistoryDashboard,
  demoTrustHistoryView,
  formatTrustScore,
  trendDecor,
} from '@/lib/trust/view';
import { TrustGovernanceNav } from '@/components/trust/TrustGovernanceNav';
import { TrustHistoryRankingTable } from '@/components/trust/TrustHistoryRankingTable';
import { TrustHistoryChart } from '@/components/trust/TrustHistoryChart';
import { TrustDriftTimeline } from '@/components/trust/TrustDriftTimeline';
import { TrustProvenancePanel } from '@/components/trust/TrustProvenancePanel';
import { TrendBadge } from '@/components/trust/badges';
import { RecordHistoryButton } from '@/components/trust/RecordHistoryButton';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isEntityType(v: string | undefined): v is TrustEntityType {
  return (
    v === 'source' ||
    v === 'narrative' ||
    v === 'forecast' ||
    v === 'decision' ||
    v === 'intervention' ||
    v === 'recommendation'
  );
}

export default async function TrustHistoryPage({
  searchParams,
}: {
  searchParams: { entityType?: string; entityId?: string };
}) {
  const detailType = isEntityType(searchParams.entityType) ? searchParams.entityType : undefined;
  const detailId = searchParams.entityId?.trim() || undefined;

  const [res, role, user] = await Promise.all([
    getTrustHistoryDashboardAction(),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);
  const mayRecord = canCurate(role) && Boolean(user);

  let data: TrustHistoryDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoTrustHistoryDashboard();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const hasData = (data?.rows.length ?? 0) > 0;

  // Optional entity detail.
  let detail: TrustHistoryView | null = null;
  if (detailType && detailId) {
    if (isDemo) {
      detail = demoTrustHistoryView(detailType, detailId);
    } else {
      const dRes = await getTrustHistoryForAction(detailType, detailId);
      if (dRes.ok) detail = dRes.data;
      else if (dRes.code === 'NOT_CONFIGURED') detail = demoTrustHistoryView(detailType, detailId);
    }
  }

  const trendCounts = data?.trendCounts;

  return (
    <>
      <TopNav
        title="Trust history"
        subtitle="How has trust changed over time? — append-only snapshots, trends, and drift"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <TrustGovernanceNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <History className="h-5 w-5 text-electric" /> Trust over time
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RecordHistoryButton action={recordTrustHistoryAction} canRecord={mayRecord} demo={isDemo} />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Trust history is <span className="font-semibold text-text-primary">append-only</span> —
            every snapshot is preserved, never overwritten. The trend (improving / stable /
            degrading / volatile) and drift are <span className="font-semibold text-text-primary">derived</span>{' '}
            from the series and are advisory; nothing here changes a trust score automatically.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing trust history requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load trust history" message={errored.message} code={errored.code} redirectedFrom="/dashboard/trust/history" />
        ) : !data ? null : !hasData ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No trust history yet"
            message="Record a trust snapshot (curator+) once entities have trust scores. The trend and drift will populate here."
          />
        ) : (
          <div className="space-y-6">
            {/* Trend panel — counts of each trend across all entities. */}
            {trendCounts ? (
              <Card className="flex flex-wrap items-center gap-4 border-border" padded>
                <span className="text-label uppercase tracking-wide text-text-muted">Trend mix</span>
                {(['improving', 'stable', 'degrading', 'volatile'] as const).map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <TrendBadge trend={t} />
                    <span className="tabular-nums text-caption font-semibold text-text-primary">
                      {trendCounts[t]}
                    </span>
                  </div>
                ))}
              </Card>
            ) : null}

            {/* Entity detail (when selected). */}
            {detail ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="space-y-3 border-border" padded>
                  <div className="flex items-center justify-between">
                    <h3 className="text-h6 font-semibold text-text-primary">
                      {detail.entityType} · {detail.entityId}
                    </h3>
                    {detail.trend ? <TrendBadge trend={detail.trend.trend} /> : null}
                  </div>
                  <TrustHistoryChart series={detail.snapshots.map((s) => ({ trustScore: s.trust_score ?? 0, at: s.snapshot_at ?? s.created_at }))} />
                  {detail.trend ? (
                    <div className="rounded-card border border-border bg-surface/50 p-3 text-[12px] leading-snug text-text-secondary">
                      <span className="font-semibold text-text-primary">
                        {trendDecor(detail.trend.trend).label}
                        {' · '}net {formatTrustScore(detail.trend.last)} from {formatTrustScore(detail.trend.first)}
                      </span>
                      <p className="mt-1">{detail.trend.explanation}</p>
                    </div>
                  ) : null}
                  {detail.drift ? <TrustDriftTimeline events={[detail.drift]} /> : null}
                </Card>
                {detail.provenance ? <TrustProvenancePanel provenance={detail.provenance} /> : null}
              </div>
            ) : null}

            {/* Ranking table */}
            <TrustHistoryRankingTable rows={data.rows} />

            {/* Drift timeline */}
            {data.drift.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-h6 font-semibold text-text-primary">Recent drift</h3>
                <TrustDriftTimeline events={data.drift.slice(0, 8)} />
              </div>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}
