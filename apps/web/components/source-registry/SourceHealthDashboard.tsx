// =============================================================================
// HSI Phase 46 — Source health dashboard (overview metrics). Read-only, derived
// from the cached source-intelligence layer. Public-safe aggregate counts only.
// =============================================================================

import { MetricCard } from '@hsi/ui';
import { Database, PauseCircle, AlertTriangle, Zap, Radio, FileText } from 'lucide-react';
import type { SourceHealthSummary } from '@/lib/source-intelligence';

export function SourceHealthDashboard({ health }: { health: SourceHealthSummary }) {
  const n = (v: number) => v.toLocaleString('en-US');
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard label="Active Sources" value={n(health.active)} accent="#10B981" icon={Database} />
      <MetricCard label="Inactive Sources" value={n(health.inactive)} accent="#94A3B8" icon={PauseCircle} />
      <MetricCard label="Failing Sources" value={n(health.failing)} accent="#EF4444" icon={AlertTriangle} />
      <MetricCard label="High-Yield Sources" value={n(health.highYield)} accent="#F59E0B" icon={Zap} />
      <MetricCard label="Signals Generated" value={n(health.signalsGenerated)} accent="#3B82F6" icon={Radio} />
      <MetricCard label="Reports Influenced" value={n(health.reportsInfluenced)} accent="#8B5CF6" icon={FileText} />
    </div>
  );
}
