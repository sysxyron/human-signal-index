// =============================================================================
// HSI Phase 7 — Intelligence Dashboard (/dashboard/intelligence). Server
// Component. Stat widgets + charts over getIntelligenceOverviewAction():
// sources, signals, reviews, watchlist matches, narrative shifts, research +
// publications; source-health donut, signal-velocity & alert-activity line
// charts. Offline (NOT_CONFIGURED) → labeled demo derived from fixtures.
// =============================================================================

import { TopNav, Card, DonutChart } from '@hsi/ui';
import {
  BarChart3,
  Database,
  Activity,
  Inbox,
  CheckCircle2,
  ListChecks,
  GitCompareArrows,
  FlaskConical,
  FileBarChart,
  TrendingUp,
  Bell,
} from 'lucide-react';
import type {
  IntelligenceOverview,
  OperationsOverview,
} from '@hsi/shared-types';
import { getIntelligenceOverviewAction } from '@/lib/signals/actions';
import { getOperationsOverviewAction } from '@/lib/operations/actions';
import {
  demoIntelligenceOverview,
  sourceHealthDecor,
} from '@/lib/signals/view';
import { demoOperationsOverview } from '@/lib/operations/view';
import {
  QueueStatusStrip,
  GraphLinkCard,
  OperationsLinkCard,
} from '@/components/operations/QueueStatusStrip';
import {
  CommunitiesLinkCard,
  AmplificationLinkCard,
} from '@/components/communities/IntelLinkCards';
import {
  EvolutionLinkCard,
  GenealogyLinkCard,
  InfluenceLinkCard,
  ForecastLinkCard,
} from '@/components/temporal/TemporalLinkCards';
import { IntelNav } from '@/components/signals/IntelNav';
import { IntelStatCard } from '@/components/signals/IntelStatCard';
import { SignalVelocityChart } from '@/components/signals/SignalVelocityChart';
import { DemoBadge } from '@/components/signals/badges';
import {
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function IntelligencePage() {
  const res = await getIntelligenceOverviewAction();

  let overview: IntelligenceOverview | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    overview = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    overview = demoIntelligenceOverview();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  // ADDITIVE (Phase 8): a defensive operations queue strip. A failure here must
  // never break the intelligence page — on error we simply hide the strip.
  let opsOverview: OperationsOverview | null = null;
  let opsDemo = false;
  try {
    const opsRes = await getOperationsOverviewAction();
    if (opsRes.ok) {
      opsOverview = opsRes.data;
    } else if (opsRes.code === 'NOT_CONFIGURED') {
      opsOverview = demoOperationsOverview();
      opsDemo = true;
    }
  } catch {
    opsOverview = null;
  }

  if (!overview) {
    return (
      <>
        <TopNav title="Intelligence" subtitle="Network overview" />
        <main className="space-y-6 p-5 lg:p-6">
          <IntelNav />
          <ErrorState
            title="Could not load intelligence overview"
            message={errored?.message ?? 'Unknown error.'}
            code={errored?.code}
            redirectedFrom="/dashboard/intelligence"
          />
        </main>
      </>
    );
  }

  const o = overview;
  const healthSegments = Object.entries(o.sourceHealthSummary).map(([k, v]) => {
    const d = sourceHealthDecor(k);
    return { label: d.label, value: v, color: d.color };
  });
  const totalHealth = healthSegments.reduce((a, s) => a + s.value, 0);

  return (
    <>
      <TopNav title="Intelligence Dashboard" subtitle="Human Signal Intelligence Network" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <BarChart3 className="h-5 w-5 text-electric" /> Network overview
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {/* ADDITIVE (Phase 8): operations queue strip + graph/console links. */}
        {opsOverview ? (
          <QueueStatusStrip overview={opsOverview} demo={opsDemo} />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <GraphLinkCard />
          <OperationsLinkCard />
        </div>
        {/* ADDITIVE (Phase 9): communities + amplification intelligence link cards. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <CommunitiesLinkCard />
          <AmplificationLinkCard />
        </div>
        {/* ADDITIVE (Phase 10): temporal intelligence link cards. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <EvolutionLinkCard />
          <GenealogyLinkCard />
          <InfluenceLinkCard />
          <ForecastLinkCard />
        </div>

        {/* Stat widgets */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <IntelStatCard label="Total Sources" value={o.totalSources} icon={Database} accent="#3B82F6" />
          <IntelStatCard label="Active Sources" value={o.activeSources} icon={Activity} accent="#10B981" />
          <IntelStatCard label="Signals Captured" value={o.signalsCaptured} icon={Inbox} accent="#8B5CF6" />
          <IntelStatCard label="Signals Reviewed" value={o.signalsReviewed} icon={CheckCircle2} accent="#10B981" />
          <IntelStatCard label="Watchlist Matches" value={o.watchlistMatches} icon={ListChecks} accent="#F59E0B" />
          <IntelStatCard label="Narrative Shifts" value={o.narrativeShifts} icon={GitCompareArrows} accent="#8B5CF6" />
          <IntelStatCard label="Research Runs" value={o.researchRunsGenerated} icon={FlaskConical} accent="#3B82F6" />
          <IntelStatCard label="Publications" value={o.publicationsGenerated} icon={FileBarChart} accent="#10B981" />
        </div>

        {/* Charts row */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SignalVelocityChart
            title="Signal velocity"
            points={o.signalVelocity}
            color="#3B82F6"
            seriesName="Signals / day"
            icon={TrendingUp}
          />
          <SignalVelocityChart
            title="Alert activity"
            points={o.alertActivity}
            color="#EF4444"
            seriesName="Alerts / day"
            icon={Bell}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Source health */}
          <Card className="space-y-4" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <Activity className="h-4 w-4 text-electric" /> Source health
            </h3>
            {healthSegments.length === 0 ? (
              <p className="text-body-sm text-text-secondary">
                No source-health observations recorded yet.
              </p>
            ) : (
              <DonutChart
                segments={healthSegments}
                centerValue={totalHealth}
                centerLabel="sources"
              />
            )}
          </Card>

          {/* Activity / creation summary */}
          <Card className="space-y-4" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <FlaskConical className="h-4 w-4 text-electric" /> Pipeline output
            </h3>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Watchlist activity" value={o.watchlistMatches} hint="matches routed for review" />
              <Stat label="Narrative drift" value={o.narrativeShifts} hint="shifts detected" />
              <Stat
                label="Research creation"
                value={o.researchRunsGenerated}
                hint="runs spawned from signals"
              />
              <Stat
                label="Publication activity"
                value={o.publicationsGenerated}
                hint="publications generated"
              />
            </dl>
            <p className="text-caption text-text-muted">
              Counts reflect human-initiated outcomes — the network never
              auto-publishes or auto-actions.
            </p>
          </Card>
        </div>
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface-2/40 p-3">
      <p className="text-label text-text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-caption text-text-muted">{hint}</p>
    </div>
  );
}
