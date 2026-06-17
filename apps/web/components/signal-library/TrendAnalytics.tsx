// =============================================================================
// HSI Phase 44 — Signal Library trend analytics. Real platform series:
// signals over time, average risk over time, publications over time. Renders the
// shared @hsi/ui LineChart; shows a calm empty note when there isn't yet enough
// data (never fabricated). Presentational (data computed server-side).
// =============================================================================

import { Card, LineChart } from '@hsi/ui';
import { Activity, ShieldAlert, FileText } from 'lucide-react';
import type { SignalLibraryTrends, TrendPoint } from '@/lib/public-intelligence';

export function TrendAnalytics({ trends }: { trends: SignalLibraryTrends }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <TrendCard icon={<Activity className="h-4 w-4 text-electric" />} title="Signals over time" points={trends.signalsOverTime} color="#3B82F6" />
      <TrendCard icon={<ShieldAlert className="h-4 w-4 text-risk" />} title="Risk over time" subtitle="avg risk level" points={trends.riskOverTime} color="#EF4444" />
      <TrendCard icon={<FileText className="h-4 w-4 text-verified" />} title="Publications over time" points={trends.publicationsOverTime} color="#10B981" />
    </div>
  );
}

function TrendCard({ icon, title, subtitle, points, color }: { icon: React.ReactNode; title: string; subtitle?: string; points: TrendPoint[]; color: string }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-body-sm font-semibold text-text-primary">{icon} {title}</span>
        {subtitle ? <span className="text-caption text-text-muted">{subtitle}</span> : null}
      </div>
      {points.length >= 2 ? (
        <LineChart
          series={[{ name: title, color, data: points.map((p) => p.value) }]}
          xLabels={points.map((p) => p.label)}
          height={160}
          showLegend={false}
        />
      ) : (
        <div className="flex h-[160px] items-center justify-center rounded-card border border-dashed border-border/70 text-caption text-text-muted">
          Not enough data yet
        </div>
      )}
    </Card>
  );
}
