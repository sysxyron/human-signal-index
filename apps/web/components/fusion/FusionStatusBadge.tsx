// =============================================================================
// HSI Phase 9 — FusionStatusBadge. Pill for a WorldForge fusion link status
// (draft / approved / created / rejected). Server-safe.
// =============================================================================

import { cn } from '@hsi/ui';
import type { WorldforgeLinkStatus } from '@hsi/shared-types';
import { linkStatusDecor } from '@/lib/operations/phase9-view';

export function FusionStatusBadge({ status }: { status?: WorldforgeLinkStatus | string }) {
  const { label, color } = linkStatusDecor(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold',
      )}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}
