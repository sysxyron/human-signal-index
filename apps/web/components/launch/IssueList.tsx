// =============================================================================
// HSI Phase 23 — IssueList. Renders the beta issue log (governed placeholder
// sample). Server-safe presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import type { BetaIssue, IssueSeverity } from '@/lib/launch/types';
import { formatDateTime } from '@/lib/launch/view';

const SEV_COLOR: Record<IssueSeverity, string> = {
  critical: '#EF4444', high: '#F59E0B', medium: '#3B82F6', low: '#94A3B8',
};

export function IssueList({ issues }: { issues: BetaIssue[] }) {
  if (issues.length === 0) {
    return <Card className="border-border p-6 text-center text-caption text-text-muted" padded>No beta issues logged.</Card>;
  }
  return (
    <div className="space-y-2">
      {issues.map((i) => (
        <Card key={i.id} className="space-y-1.5 border-border" padded>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body font-medium text-text-primary">{i.title}</span>
            <span className="rounded-full px-2 py-0.5 text-label font-semibold uppercase" style={{ backgroundColor: `${SEV_COLOR[i.severity]}1f`, color: SEV_COLOR[i.severity] }}>{i.severity}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-label text-text-muted">
            <span className="font-mono">{i.route}</span>
            <span>· role {i.role}</span>
            <span>· {i.status}</span>
            {i.assignedTo ? <span>· @{i.assignedTo}</span> : null}
            <span>· {formatDateTime(i.updatedAt)}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
