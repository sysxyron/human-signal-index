// =============================================================================
// HSI Phase 20 — CollectiveHighlightCards. A compact, defensive headline strip for
// the operations center: active investigations, consensus forming, major disputes,
// pending governance reviews, high-trust contributors, and high-impact
// investigations. Each links into the collective-intelligence dashboards. Pure
// presentational, server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Users, Scale, Swords, ShieldCheck, Trophy, Flame } from 'lucide-react';
import type { CollectiveHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';

function Stat({ href, icon: Icon, label, value, color }: { href: string; icon: typeof Users; label: string; value: string; color: string }) {
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

export function CollectiveHighlightCards({ highlights, demo = false }: { highlights: CollectiveHighlights; demo?: boolean }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Users className="h-4 w-4 text-electric" /> Collective intelligence
        </h3>
        {demo ? <DemoBadge /> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat href="/dashboard/investigations" icon={Users} label="Active" value={String(highlights.activeInvestigations ?? 0)} color="#3B82F6" />
        <Stat href="/dashboard/consensus" icon={Scale} label="Consensus forming" value={String(highlights.consensusForming ?? 0)} color="#8B5CF6" />
        <Stat href="/dashboard/debates" icon={Swords} label="Major disputes" value={String(highlights.majorDisputes ?? 0)} color="#EF4444" />
        <Stat href="/dashboard/consensus" icon={ShieldCheck} label="Pending governance" value={String(highlights.pendingGovernance ?? 0)} color="#F59E0B" />
        <Stat href="/dashboard/contributors" icon={Trophy} label="High-trust" value={String(highlights.highTrustContributors ?? 0)} color="#10B981" />
        <Stat href="/dashboard/investigations" icon={Flame} label="High-impact" value={String(highlights.highImpactInvestigations ?? 0)} color="#EC4899" />
      </div>
    </section>
  );
}
