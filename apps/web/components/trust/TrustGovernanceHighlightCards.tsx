// =============================================================================
// HSI Phase 17 — TrustGovernanceHighlightCards. A compact, defensive headline
// strip for the operations dashboard: degrading entities, pending recalibration
// proposals, drift events, and average trust. Each card links into the trust &
// governance dashboards. Pure presentational, server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ShieldCheck, TrendingDown, Sliders, Waves } from 'lucide-react';
import type { TrustGovernanceHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { formatTrustScore } from '@/lib/trust/view';

function Stat({
  href,
  icon: Icon,
  label,
  value,
  color,
}: {
  href: string;
  icon: typeof ShieldCheck;
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

export function TrustGovernanceHighlightCards({
  highlights,
  demo = false,
}: {
  highlights: TrustGovernanceHighlights;
  demo?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <ShieldCheck className="h-4 w-4 text-electric" /> Trust &amp; governance
        </h3>
        {demo ? <DemoBadge /> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          href="/dashboard/trust/public"
          icon={ShieldCheck}
          label="Avg trust"
          value={formatTrustScore(highlights.avgTrust)}
          color="#3B82F6"
        />
        <Stat
          href="/dashboard/trust/drift"
          icon={TrendingDown}
          label="Degrading"
          value={String(highlights.degradingCount ?? 0)}
          color="#F59E0B"
        />
        <Stat
          href="/dashboard/trust/drift"
          icon={Waves}
          label="Drift events"
          value={String(highlights.driftEvents ?? 0)}
          color="#EC4899"
        />
        <Stat
          href="/dashboard/trust/proposals"
          icon={Sliders}
          label="Pending proposals"
          value={String(highlights.pendingProposals ?? 0)}
          color="#8B5CF6"
        />
      </div>
    </section>
  );
}
