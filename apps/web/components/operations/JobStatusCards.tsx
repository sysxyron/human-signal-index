// =============================================================================
// HSI Phase 8 — JobStatusCards. The five queue stat cards
// (Queued / Running / Failed / Retrying / Completed-24h). Server-safe.
// =============================================================================

import { Layers, Loader2, XCircle, RotateCw, CheckCircle2 } from 'lucide-react';
import { IntelStatCard } from '@/components/signals/IntelStatCard';
import type { OperationsOverview } from '@hsi/shared-types';

export function JobStatusCards({ overview }: { overview: OperationsOverview }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <IntelStatCard label="Queued" value={overview.queued} icon={Layers} accent="#3B82F6" />
      <IntelStatCard label="Running" value={overview.running} icon={Loader2} accent="#8B5CF6" />
      <IntelStatCard label="Failed" value={overview.failed} icon={XCircle} accent="#EF4444" />
      <IntelStatCard label="Retrying" value={overview.retrying} icon={RotateCw} accent="#F59E0B" />
      <IntelStatCard
        label="Completed (24h)"
        value={overview.completed24h}
        icon={CheckCircle2}
        accent="#10B981"
      />
    </div>
  );
}
