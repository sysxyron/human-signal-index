import Link from 'next/link';
import { ArrowRight, UserCheck, MessageSquare } from 'lucide-react';
import type { ReviewQueueItem } from '@hsi/shared-types';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { PriorityBadge } from './PriorityBadge';
import {
  entityDisplayLabel,
  entityLabel,
  decisionStyle,
  fmtDateShort,
} from '@/lib/governance/view';

/**
 * Tabular worklist of review-queue items. Each row links to the item detail.
 * Server component (no interactivity) — links carry the navigation.
 */
export function ReviewQueueTable({
  items,
  emptyMessage = 'No items in this queue.',
}: {
  items: ReviewQueueItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface-2/40 px-4 py-6 text-center text-caption text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface/60">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <Th>Entity</Th>
            <Th>Status</Th>
            <Th>Priority</Th>
            <Th>Reviewer</Th>
            <Th align="center">Decisions</Th>
            <Th>Latest decision</Th>
            <Th align="right">Updated</Th>
            <Th align="right"> </Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const q = item.queue;
            const label = entityDisplayLabel(q.entity_type, q.entity_id, item.entitySummary);
            const latest = item.latestDecision;
            const ds = latest ? decisionStyle(latest.decision) : null;
            return (
              <tr
                key={q.id}
                className="border-b border-border/60 transition last:border-0 hover:bg-surface-2/50"
              >
                <td className="px-4 py-3">
                  <Link href={`/dashboard/review/${q.id}`} className="group block">
                    <span className="font-medium text-text-primary group-hover:text-electric">
                      {label}
                    </span>
                    <span className="block text-[11px] text-text-muted">
                      {entityLabel(q.entity_type)} · {q.entity_id.slice(0, 8)}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <ReviewStatusBadge status={q.status} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={q.priority} />
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {item.assignedReviewerEmail ? (
                    <span className="inline-flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-electric" />
                      <span className="truncate" title={item.assignedReviewerEmail}>
                        {item.assignedReviewerEmail}
                      </span>
                    </span>
                  ) : (
                    <span className="text-text-muted">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <MessageSquare className="h-3.5 w-3.5 text-text-muted" />
                    {item.decisionsCount}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {ds ? (
                    <span className="text-caption font-semibold" style={{ color: ds.color }}>
                      {ds.label}
                    </span>
                  ) : (
                    <span className="text-caption text-text-muted">No decision yet</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-caption text-text-muted">
                  {fmtDateShort(q.updated_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/review/${q.id}`}
                    className="inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
                  >
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={`px-4 py-3 text-label font-semibold text-text-muted ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}
