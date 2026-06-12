// =============================================================================
// HSI Phase 22 — ExecutiveHighlightCards. A compact, defensive headline strip for
// the operations center: attention index, top priorities, open risks, open
// opportunities, governance pending, daily-brief status. Each links into the
// command-center dashboards. Pure presentational, server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Gauge, ListChecks, ShieldAlert, Sparkles, Gavel, CalendarClock } from 'lucide-react';
import type { ExecutiveHighlights } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { attentionDecor, formatScore } from '@/lib/executive/view';

function Stat({ href, icon: Icon, label, value, color }: { href: string; icon: typeof Gauge; label: string; value: string; color: string }) {
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

export function ExecutiveHighlightCards({ highlights, demo = false }: { highlights: ExecutiveHighlights; demo?: boolean }) {
  const decor = attentionDecor(highlights.attentionLevel);
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Gauge className="h-4 w-4 text-electric" /> Executive Command
        </h3>
        {demo ? <DemoBadge /> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat href="/dashboard/executive" icon={Gauge} label={`Attention · ${decor.label}`} value={formatScore(highlights.attentionIndex)} color={decor.color} />
        <Stat href="/dashboard/priorities" icon={ListChecks} label="Top priorities" value={String(highlights.topPriorities ?? 0)} color="#3B82F6" />
        <Stat href="/dashboard/risks" icon={ShieldAlert} label="Open risks" value={String(highlights.openRisks ?? 0)} color="#EF4444" />
        <Stat href="/dashboard/opportunities" icon={Sparkles} label="Opportunities" value={String(highlights.openOpportunities ?? 0)} color="#10B981" />
        <Stat href="/dashboard/exec-governance" icon={Gavel} label="Governance" value={String(highlights.governancePending ?? 0)} color="#06B6D4" />
        <Stat href="/dashboard/briefings" icon={CalendarClock} label="Daily brief" value={highlights.dailyBriefReady ? 'Ready' : '—'} color="#8B5CF6" />
      </div>
    </section>
  );
}
