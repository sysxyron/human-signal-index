// =============================================================================
// HSI Phase 16 — Calibration Dashboard (/dashboard/calibration). Server
// Component, force-dynamic. getCalibrationDashboardAction() returns the
// CalibrationDashboardData: the latest calibration snapshot, its per-bin
// reliability curve, Brier scores, drift events, and the ECE/Brier trend over
// snapshots.
//
// Renders: the headline ECE / MCE / Brier stat cards (with interpretation), the
// prominent "What does X% confidence mean?" explainer (grounded in the latest
// curve), the ReliabilityDiagram (predicted vs observed + perfect-calibration
// diagonal) and the CalibrationBinsTable beneath it, the ConfidenceDriftChart +
// DriftPanel (current drift kind + advisory recommendation), and the
// CalibrationTrendChart (ECE/Brier over snapshots). A RecomputeCalibrationButton
// (curator/admin) re-runs the computation. The latest snapshot links to its
// detail at /calibration/[id].
//
// Researcher+ view. Charts are EXPLAINABLE (axes + numbers shown). Offline
// (NOT_CONFIGURED) → labeled demo from the @hsi/calibration-engine
// calibrationDemo() fixtures. These are observed patterns, never certainties.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Gauge, Info, GitCompareArrows, Crosshair, Activity, ArrowRight } from 'lucide-react';
import type { CalibrationDashboardData } from '@hsi/shared-types';
import {
  getCalibrationDashboardAction,
  recomputeCalibrationAction,
} from '@/lib/calibration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  brierQuality,
  canCurate,
  canResearch,
  demoCalibrationDashboard,
  demoConfidenceMeaning,
  formatBrier,
  formatErrorPct,
  qualityDecor,
  readReliabilityBins,
} from '@/lib/calibration/view';
import { CalibrationNav } from '@/components/calibration/CalibrationNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { ReliabilityDiagram } from '@/components/calibration/ReliabilityDiagram';
import { CalibrationBinsTable } from '@/components/calibration/CalibrationBinsTable';
import { BrierScoreCard } from '@/components/calibration/BrierScoreCard';
import { ConfidenceMeaningCard } from '@/components/calibration/ConfidenceMeaningCard';
import { DriftPanel } from '@/components/calibration/DriftPanel';
import { ConfidenceDriftChart } from '@/components/calibration/ConfidenceDriftChart';
import { CalibrationTrendChart } from '@/components/calibration/CalibrationTrendChart';
import { RecomputeCalibrationButton } from '@/components/calibration/RecomputeButtons';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Gauge;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden" padded>
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-start justify-between">
        <span className="text-label text-text-muted">{label}</span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-3">
        <div className="text-3xl font-bold tracking-tight text-text-primary">{value}</div>
        <p className="mt-1 text-caption text-text-muted">{detail}</p>
      </div>
    </Card>
  );
}

export default async function CalibrationPage() {
  const [res, role, user] = await Promise.all([
    getCalibrationDashboardAction(),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);
  const mayRecompute = canCurate(role) && Boolean(user);

  let data: CalibrationDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    data = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    data = demoCalibrationDashboard();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  // The view gate: researcher+ only (server already gates; this is belt-and-braces
  // for the non-demo authed-but-underprivileged case).
  const forbidden = !isDemo && res.ok && !mayView;

  const snapshot = data?.snapshot;
  const bins = readReliabilityBins(data?.curves, snapshot?.curve);
  const overallBrier =
    data?.brier.find((b) => b.scope === 'all' && (b.kind === 'all' || !b.kind)) ??
    data?.brier[0];
  const meaning = isDemo
    ? demoConfidenceMeaning()
    : snapshot
      ? // Best-effort: ground 82% in the bin that contains it from the live curve.
        (() => {
          const target = 0.82;
          const bin = bins.find((b) => target >= b.lower && target < b.upper) ?? bins.at(-1);
          const grounded = bin && bin.count > 0;
          return {
            statedConfidence: target,
            historicalSuccess: bin?.observedSuccess ?? 0,
            sampleCount: bin?.count ?? 0,
            sentence: grounded
              ? `82% confidence predictions have historically succeeded ${formatErrorPct(bin!.observedSuccess)} of the time across ${bin!.count} observations.`
              : '82% confidence predictions have no historical observations yet — meaning cannot be grounded.',
          };
        })()
      : null;

  const currentDrift = data?.drift[0];
  const ece = snapshot?.expected_calibration_error;
  const mce = snapshot?.max_calibration_error;
  const brierScore = overallBrier?.score ?? snapshot?.brier_score;
  const quality = overallBrier?.calibration_quality ?? brierQuality(brierScore, snapshot?.sample_count);

  const hasData = data && (bins.length > 0 || (data.brier.length ?? 0) > 0 || (data.drift.length ?? 0) > 0);

  return (
    <>
      <TopNav
        title="Calibration"
        subtitle="What does our confidence actually mean? — grounded in observed outcomes"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <CalibrationNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Gauge className="h-5 w-5 text-electric" /> Confidence calibration
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RecomputeCalibrationButton
            action={recomputeCalibrationAction}
            canRecompute={mayRecompute}
            demo={isDemo}
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Calibration compares the confidence we STATE against the outcomes we OBSERVE.
            A perfectly calibrated 80% prediction succeeds 80% of the time. The{' '}
            <span className="font-semibold text-text-primary">
              reliability diagram, Expected/Maximum Calibration Error, Brier score, and
              drift detection
            </span>{' '}
            make confidence honest and auditable — every number is shown, drift only
            RECOMMENDS recalibration, and nothing here is a certainty.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState
            title="Insufficient permissions"
            message="Viewing calibration requires the researcher role or above."
            code="FORBIDDEN"
          />
        ) : errored ? (
          <ErrorState
            title="Could not load calibration"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/calibration"
          />
        ) : !data ? null : !hasData ? (
          <EmptyState
            icon={<Gauge className="h-5 w-5" />}
            title="No calibration snapshots yet"
            message="Recompute calibration (curator+) once confidence predictions have accumulated observed outcomes. The reliability diagram, error metrics, and drift will populate here."
          />
        ) : (
          <div className="space-y-6">
            {/* Headline metrics */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Expected calibration error"
                value={formatErrorPct(ece)}
                detail="avg gap between confidence & reality"
                icon={GitCompareArrows}
                accent="#F59E0B"
              />
              <StatCard
                label="Maximum calibration error"
                value={formatErrorPct(mce)}
                detail="worst single confidence band"
                icon={Crosshair}
                accent="#EF4444"
              />
              <StatCard
                label="Brier score"
                value={formatBrier(brierScore)}
                detail={`0 = perfect · ${qualityDecor(quality).label}`}
                icon={Gauge}
                accent="#3B82F6"
              />
              <StatCard
                label="Observations"
                value={String(snapshot?.sample_count ?? 0)}
                detail="predictions with observed outcomes"
                icon={Activity}
                accent="#10B981"
              />
            </div>

            {/* What does X% confidence mean? */}
            {meaning ? (
              <ConfidenceMeaningCard
                statedConfidence={meaning.statedConfidence}
                historicalSuccess={meaning.historicalSuccess}
                sampleCount={meaning.sampleCount}
                sentence={meaning.sentence}
              />
            ) : null}

            {/* Reliability diagram + bins */}
            <div className="grid gap-6 lg:grid-cols-2">
              <ReliabilityDiagram bins={bins} ece={ece} mce={mce} />
              <CalibrationBinsTable bins={bins} />
            </div>

            {/* Brier scores (overall + per-kind) */}
            {data.brier.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {data.brier.slice(0, 6).map((b) => (
                  <BrierScoreCard key={b.id} brier={b} />
                ))}
              </div>
            ) : null}

            {/* Drift: chart + current panel */}
            <div className="grid gap-6 lg:grid-cols-2">
              <ConfidenceDriftChart drift={data.drift} />
              {currentDrift ? <DriftPanel drift={currentDrift} /> : null}
            </div>

            {/* Trend over snapshots */}
            <CalibrationTrendChart trend={data.trend} />

            {/* Link to snapshot detail */}
            {snapshot ? (
              <Link
                href={`/dashboard/calibration/${encodeURIComponent(snapshot.id)}` as never}
                className="inline-flex items-center gap-2 rounded-btn border border-border bg-surface-2/40 px-3.5 py-2 text-caption font-semibold text-electric transition hover:border-electric/50"
              >
                View full snapshot detail <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}
