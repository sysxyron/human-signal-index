// =============================================================================
// HSI Phase 22 — RiskMatrix. Operational risks grouped by severity, sorted by
// score, each with source + advisory recommendation. Server-safe presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { ShieldAlert } from 'lucide-react';
import type { ExecutiveRisksData } from '@hsi/shared-types';
import { formatScore } from '@/lib/executive/view';
import { SeverityBadge } from './badges';

const ORDER: Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function RiskMatrix({ data }: { data: ExecutiveRisksData }) {
  if (data.risks.length === 0) {
    return <Card className="border-border p-6 text-center text-caption text-text-muted" padded>No operational risks detected.</Card>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ORDER.map((sev) => (
          <div key={sev} className="rounded-card border border-border bg-surface/50 p-3">
            <div className="text-h6 font-bold tabular-nums text-text-primary">{data.bySeverity[sev] ?? 0}</div>
            <SeverityBadge severity={sev} />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {data.risks.map((r) => (
          <Card key={r.id} className="flex items-start justify-between gap-3 border-border" padded>
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-risk" />
              <div>
                <div className="text-body font-medium text-text-primary">{r.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={r.severity} />
                  <span className="text-label uppercase tracking-wide text-text-muted">{r.source}</span>
                  <span className="text-label tabular-nums text-text-muted">score {formatScore(r.score)}</span>
                </div>
                <p className="mt-1 text-caption text-text-secondary">{r.recommendation}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
