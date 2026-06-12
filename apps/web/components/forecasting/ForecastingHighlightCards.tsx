// =============================================================================
// HSI Phase 21 — ForecastingHighlightCards. A compact, defensive headline strip
// for the operations center: active forecasts, forecast failures, scenario
// shifts, warning alerts, forecast accuracy, confidence drift. Each links into the
// forecasting dashboards. Pure presentational, server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { TrendingUp, TrendingDown, GitBranch, Siren, Gauge, Activity } from 'lucide-react';
import type { ForecastingHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { formatPct } from '@/lib/forecasting/view';

function Stat({ href, icon: Icon, label, value, color }: { href: string; icon: typeof TrendingUp; label: string; value: string; color: string }) {
  return (
    <Link href={href as never} className="block">
      <Card className="flex items-center gap-3 border-border transition hover:border-electric/50" padded>
        <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1f` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </span>
        <div>
          <div className="text-h6 font-bold tabular-nums text-text-primary">{value}</div>
          <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
        </div>
      </Card>
    </Link>
  );
}

export function ForecastingHighlightCards({ highlights, demo = false }: { highlights: ForecastingHighlights; demo?: boolean }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <TrendingUp className="h-4 w-4 text-electric" /> Forecasting
        </h3>
        {demo ? <DemoBadge /> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat href="/dashboard/forecasts" icon={TrendingUp} label="Active" value={String(highlights.activeForecasts ?? 0)} color="#3B82F6" />
        <Stat href="/dashboard/forecasts" icon={TrendingDown} label="Failures" value={String(highlights.forecastFailures ?? 0)} color="#EF4444" />
        <Stat href="/dashboard/scenarios" icon={GitBranch} label="Scenario shifts" value={String(highlights.scenarioShifts ?? 0)} color="#8B5CF6" />
        <Stat href="/dashboard/warnings" icon={Siren} label="Warnings" value={String(highlights.warningAlerts ?? 0)} color="#F59E0B" />
        <Stat href="/dashboard/forecasts" icon={Gauge} label="Accuracy" value={formatPct(highlights.forecastAccuracy)} color="#10B981" />
        <Stat href="/dashboard/forecasts" icon={Activity} label="Conf. drift" value={formatPct(highlights.confidenceDrift)} color="#06B6D4" />
      </div>
    </section>
  );
}
