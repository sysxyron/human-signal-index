// =============================================================================
// HSI Phase 11 — CausalEventBadge / MilestoneBadge. Server-safe, pure
// presentational pills mapping the 8 causal-event types and 7 milestone types to
// a color + icon via lib/causal/view. No client interactivity.
// =============================================================================

import { cn } from '@hsi/ui';
import type { CausalEventType, MilestoneType } from '@hsi/shared-types';
import { eventDecor, milestoneDecor } from '@/lib/causal/view';

export function CausalEventBadge({
  type,
  className = '',
  showIcon = true,
}: {
  type?: CausalEventType | string | null;
  className?: string;
  showIcon?: boolean;
}) {
  const decor = eventDecor(type);
  const Icon = decor.icon;
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
      title={decor.description}
    >
      {showIcon ? <Icon className="h-3.5 w-3.5" /> : null}
      {decor.label}
    </span>
  );
}

export function MilestoneBadge({
  type,
  className = '',
  showIcon = true,
}: {
  type?: MilestoneType | string | null;
  className?: string;
  showIcon?: boolean;
}) {
  const decor = milestoneDecor(type);
  const Icon = decor.icon;
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
      title={decor.description}
    >
      {showIcon ? <Icon className="h-3.5 w-3.5" /> : null}
      {decor.label}
    </span>
  );
}
