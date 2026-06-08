// =============================================================================
// HSI Phase 8 — SlaBadge. A decorated pill for an SLA state
// (on_track / due_soon / overdue_review / overdue_escalation). Server-safe,
// purely presentational. Never hides an overdue state — escalation is shown in
// the most urgent (deep-red) tone.
// =============================================================================

import { cn } from '@hsi/ui';
import { Clock, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { slaStateDecor, type SlaState } from '@/lib/operations/view';

function iconFor(state: SlaState | string) {
  switch (state) {
    case 'on_track':
      return CheckCircle2;
    case 'due_soon':
      return Clock;
    case 'overdue_review':
      return AlertTriangle;
    case 'overdue_escalation':
      return ShieldAlert;
    default:
      return Clock;
  }
}

export function SlaBadge({
  state,
  className = '',
}: {
  state: SlaState | string;
  className?: string;
}) {
  const decor = slaStateDecor(state);
  const Icon = iconFor(state);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{
        backgroundColor: `${decor.color}1f`,
        color: decor.color,
        border: `1px solid ${decor.color}55`,
      }}
      title={`SLA: ${decor.label}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {decor.label}
    </span>
  );
}
