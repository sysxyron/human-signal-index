// =============================================================================
// HSI Phase 45 — Report activity feed. Real public-safe intelligence events
// (reused from the shared public-intelligence bundle): report published, evidence
// linked, review completed, etc. Graceful empty state — never fabricated.
// =============================================================================

import { Radio } from 'lucide-react';
import type { PublicActivityItem, PublicActivityKind } from '@/lib/public-intelligence';

const KIND_COLOR: Record<PublicActivityKind, string> = {
  'NEW SIGNAL': '#3B82F6',
  'EVIDENCE LINKED': '#10B981',
  'REVIEW COMPLETED': '#F59E0B',
  'REPORT PUBLISHED': '#8B5CF6',
  'SOURCE VERIFIED': '#06B6D4',
};

export function ReportActivityFeed({ items }: { items: PublicActivityItem[] }) {
  return (
    <div className="rounded-card border border-border bg-surface/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Radio className="h-4 w-4 text-electric" />
        <h2 className="text-label uppercase tracking-wide text-text-muted">Recent intelligence activity</h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-6 text-center text-caption text-text-muted">
          No recent activity yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_COLOR[e.kind] ?? '#3B82F6' }} />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: KIND_COLOR[e.kind] ?? '#3B82F6' }}>{e.kind}</div>
                <div className="truncate text-caption text-text-secondary">{e.text}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
