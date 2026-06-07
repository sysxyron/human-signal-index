'use client';

import { AlertTriangle } from 'lucide-react';
import { severityColor } from '@/lib/worldforge/research-view';

export interface DisagreementMarkerProps {
  /** Number of open/total disputes targeting this domain. */
  count: number;
  /** Highest severity among the disputes ('high' | 'medium' | 'low'). */
  severity?: 'low' | 'medium' | 'high' | string;
  className?: string;
}

/**
 * Badge shown on an agent card when the skeptic raised one or more disputes
 * against that domain. Color reflects the highest severity.
 */
export function DisagreementMarker({
  count,
  severity = 'medium',
  className = '',
}: DisagreementMarkerProps) {
  if (count <= 0) return null;
  const color = severityColor(severity);
  const label =
    count === 1 ? '1 dispute' : `${count} disputes`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}66` }}
      title={`Skeptic raised ${label} (max severity: ${severity})`}
    >
      <AlertTriangle className="h-3 w-3" />
      {label}
    </span>
  );
}
