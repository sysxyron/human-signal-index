// =============================================================================
// HSI Phase 22 — ExecutiveSnapshot. The top-of-command summary: attention index +
// level, headline counts (priorities / risks / opportunities / governance), and
// the one-paragraph executive summary. Server-safe, presentational. Advisory.
// =============================================================================

import { Card } from '@hsi/ui';
import { Gauge, ListChecks, ShieldAlert, Sparkles, Gavel } from 'lucide-react';
import type { ExecutiveCommandData } from '@hsi/shared-types';
import { attentionDecor, formatScore } from '@/lib/executive/view';
import { AttentionBadge } from './badges';

function Metric({ icon: Icon, label, value, color }: { icon: typeof ListChecks; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface/50 p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1f` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <div>
        <div className="text-h6 font-bold tabular-nums text-text-primary">{value}</div>
        <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      </div>
    </div>
  );
}

export function ExecutiveSnapshot({ data }: { data: ExecutiveCommandData }) {
  const decor = attentionDecor(data.attentionLevel);
  return (
    <Card className="space-y-4 border-border" padded>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${decor.color}1f` }}>
            <Gauge className="h-6 w-6" style={{ color: decor.color }} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-h4 font-bold tabular-nums text-text-primary">{formatScore(data.attentionIndex)}</span>
              <span className="text-caption text-text-muted">/ 100 attention</span>
            </div>
            <AttentionBadge level={data.attentionLevel} />
          </div>
        </div>
      </div>

      <p className="text-caption leading-relaxed text-text-secondary">{data.executiveSummary}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={ListChecks} label="Priorities" value={data.priorities.length} color="#3B82F6" />
        <Metric icon={ShieldAlert} label="Risks" value={data.riskCount} color="#EF4444" />
        <Metric icon={Sparkles} label="Opportunities" value={data.opportunityCount} color="#10B981" />
        <Metric icon={Gavel} label="Governance" value={data.governanceCount} color="#06B6D4" />
      </div>
    </Card>
  );
}
