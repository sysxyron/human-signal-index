// =============================================================================
// HSI Phase 18 — OperationsHighlightCards. A compact, defensive headline strip for
// the platform operations dashboard: active runs, queue depth, open escalations,
// proposed opportunities, and overall system health. Each card links into the
// Intelligence Operations Center. Pure presentational, server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Activity, ListTree, Siren, Lightbulb } from 'lucide-react';
import type { OperationsHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { healthDecor } from '@/lib/orchestration/view';

function Stat({ href, icon: Icon, label, value, color }: {
  href: string;
  icon: typeof Activity;
  label: string;
  value: string;
  color: string;
}) {
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

export function OperationsHighlightCards({
  highlights,
  demo = false,
}: {
  highlights: OperationsHighlights;
  demo?: boolean;
}) {
  const statusColor = healthDecor(highlights.overallStatus).color;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Activity className="h-4 w-4 text-electric" /> Operations center
        </h3>
        {demo ? <DemoBadge /> : null}
        {highlights.overallStatus ? (
          <span
            className="rounded-full px-2 py-0.5 text-caption font-semibold"
            style={{ color: statusColor, backgroundColor: `${statusColor}1f`, border: `1px solid ${statusColor}55` }}
          >
            {healthDecor(highlights.overallStatus).label}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat href="/dashboard/intelligence/runs" icon={Activity} label="Active runs" value={String(highlights.activeRuns ?? 0)} color="#3B82F6" />
        <Stat href="/dashboard/intelligence/operations" icon={ListTree} label="Queue depth" value={String(highlights.queueDepth ?? 0)} color="#06B6D4" />
        <Stat href="/dashboard/intelligence/escalations" icon={Siren} label="Escalations" value={String(highlights.openEscalations ?? 0)} color="#EF4444" />
        <Stat href="/dashboard/intelligence/opportunities" icon={Lightbulb} label="Opportunities" value={String(highlights.proposedOpportunities ?? 0)} color="#F59E0B" />
      </div>
    </section>
  );
}
