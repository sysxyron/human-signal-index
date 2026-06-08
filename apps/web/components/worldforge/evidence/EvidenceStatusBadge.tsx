'use client';

import { queueStatusStyle } from '@/lib/worldforge/evidence-intel-view';

export interface EvidenceStatusBadgeProps {
  /** A persisted/queue review status ('validated'|'rejected'|'needs_more'|'pending'|'unreviewed'). */
  status: string;
  className?: string;
}

/**
 * Status pill for the review queue, using the spec status mapping:
 * validated→Verified (green), rejected→Rejected (red),
 * needs_more→Needs More (amber), pending→Pending (slate).
 */
export function EvidenceStatusBadge({
  status,
  className = '',
}: EvidenceStatusBadgeProps) {
  const s = queueStatusStyle(status);
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
      title={`Status: ${s.label}`}
    >
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}
