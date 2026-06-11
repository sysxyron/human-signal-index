// =============================================================================
// HSI Phase 16 — Calibration Snapshot Detail (/dashboard/calibration/[id]).
// Server Component, force-dynamic. getCalibrationAction(id) returns a
// CalibrationView: one snapshot + its per-bin reliability curve + (optionally)
// its Brier score and drift. Renders the snapshot's ECE/MCE/Brier headline, the
// ReliabilityDiagram + CalibrationBinsTable, the BrierScoreCard, and the
// DriftPanel — fully explainable (axes + every number shown). Researcher+ view.
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/calibration-engine
// fixtures.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Gauge, ArrowLeft, GitCompareArrows, Crosshair, Calendar } from 'lucide-react';
import type { CalibrationView } from '@hsi/shared-types';
import { getCalibrationAction } from '@/lib/calibration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  brierQuality,
  canResearch,
  demoCalibrationView,
  formatBrier,
  formatDateTime,
  formatErrorPct,
  qualityDecor,
  readReliabilityBins,
} from '@/lib/calibration/view';
import { CalibrationNav } from '@/components/calibration/CalibrationNav';
import { DemoBadge, DecoratedPill } from '@/components/signals/badges';
import { CalibrationQualityBadge } from '@/components/calibration/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';
import { ReliabilityDiagram } from '@/components/calibration/ReliabilityDiagram';
import { CalibrationBinsTable } from '@/components/calibration/CalibrationBinsTable';
import { BrierScoreCard } from '@/components/calibration/BrierScoreCard';
import { DriftPanel } from '@/components/calibration/DriftPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CalibrationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = decodeURIComponent(params.id);

  const [res, role, user] = await Promise.all([
    getCalibrationAction(id),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);

  let view: CalibrationView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoCalibrationView(id);
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const forbidden = !isDemo && res.ok && !mayView;

  const snapshot = view?.snapshot;
  const bins = readReliabilityBins(view?.curves, snapshot?.curve);
  const ece = snapshot?.expected_calibration_error;
  const mce = snapshot?.max_calibration_error;
  const brierScore = view?.brier?.score ?? snapshot?.brier_score;
  const quality = view?.brier?.calibration_quality ?? brierQuality(brierScore, snapshot?.sample_count);

  return (
    <>
      <TopNav title="Calibration snapshot" subtitle="A single point-in-time calibration — fully auditable" />
      <main className="space-y-6 p-5 lg:p-6">
        <CalibrationNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={'/dashboard/calibration' as never}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-text-secondary transition hover:text-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to calibration
          </Link>
          {isDemo ? <DemoBadge /> : null}
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState
            title="Insufficient permissions"
            message="Viewing calibration requires the researcher role or above."
            code="FORBIDDEN"
          />
        ) : errored ? (
          <ErrorState
            title="Could not load calibration snapshot"
            message={errored.message}
            code={errored.code}
            redirectedFrom={`/dashboard/calibration/${id}`}
          />
        ) : !view || !snapshot ? (
          <ErrorState title="Snapshot not found" message="No calibration snapshot matched this id." />
        ) : (
          <div className="space-y-6">
            {/* Snapshot header */}
            <Card className="space-y-3" padded>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                  <Gauge className="h-4 w-4 text-electric" /> Snapshot {snapshot.id}
                </h2>
                <CalibrationQualityBadge quality={quality} />
              </div>
              <div className="flex flex-wrap gap-2">
                {snapshot.scope ? (
                  <DecoratedPill decor={{ label: `scope: ${snapshot.scope}`, color: '#3B82F6', tone: 'blue' }} dot={false} />
                ) : null}
                {snapshot.kind ? (
                  <DecoratedPill decor={{ label: `kind: ${snapshot.kind}`, color: '#8B5CF6', tone: 'purple' }} dot={false} />
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-card border border-border bg-surface-2/40 p-3">
                  <p className="flex items-center gap-1.5 text-label text-text-muted">
                    <GitCompareArrows className="h-3.5 w-3.5" /> ECE
                  </p>
                  <p className="text-body-sm font-semibold text-text-primary">{formatErrorPct(ece)}</p>
                </div>
                <div className="rounded-card border border-border bg-surface-2/40 p-3">
                  <p className="flex items-center gap-1.5 text-label text-text-muted">
                    <Crosshair className="h-3.5 w-3.5" /> MCE
                  </p>
                  <p className="text-body-sm font-semibold text-text-primary">{formatErrorPct(mce)}</p>
                </div>
                <div className="rounded-card border border-border bg-surface-2/40 p-3">
                  <p className="flex items-center gap-1.5 text-label text-text-muted">
                    <Gauge className="h-3.5 w-3.5" /> Brier
                  </p>
                  <p className="text-body-sm font-semibold text-text-primary">
                    {formatBrier(brierScore)}{' '}
                    <span className="text-caption text-text-muted">· {qualityDecor(quality).label}</span>
                  </p>
                </div>
                <div className="rounded-card border border-border bg-surface-2/40 p-3">
                  <p className="flex items-center gap-1.5 text-label text-text-muted">
                    <Calendar className="h-3.5 w-3.5" /> Generated
                  </p>
                  <p className="text-body-sm font-semibold text-text-primary">
                    {formatDateTime(snapshot.generated_at ?? snapshot.created_at)}
                  </p>
                </div>
              </div>
              <p className="text-caption text-text-muted">
                {snapshot.sample_count ?? 0} observed predictions · overconfidence index{' '}
                {snapshot.overconfidence_index == null
                  ? '—'
                  : Number(snapshot.overconfidence_index.toFixed(2))}{' '}
                (+ = overconfident, − = underconfident).
              </p>
            </Card>

            {/* Reliability diagram + bins */}
            <div className="grid gap-6 lg:grid-cols-2">
              <ReliabilityDiagram bins={bins} ece={ece} mce={mce} />
              <CalibrationBinsTable bins={bins} />
            </div>

            {/* Brier + drift for this snapshot */}
            <div className="grid gap-6 lg:grid-cols-2">
              {view.brier ? (
                <BrierScoreCard brier={view.brier} title="Brier score for this snapshot" />
              ) : null}
              {view.drift ? <DriftPanel drift={view.drift} title="Drift at this snapshot" /> : null}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
