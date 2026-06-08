// =============================================================================
// HSI Phase 8 — JobStatusBadge. A decorated pill for a job/attempt status.
// Server-safe, purely presentational. Failed/retrying are never hidden.
// =============================================================================

import { cn } from '@hsi/ui';
import type { JobStatus } from '@hsi/shared-types';
import { attemptStatusDecor, jobStatusDecor } from '@/lib/operations/view';

export function JobStatusBadge({
  status,
  className = '',
}: {
  status: JobStatus | string;
  className?: string;
}) {
  const decor = jobStatusDecor(status);
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
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: decor.color, boxShadow: `0 0 8px ${decor.color}` }}
      />
      {decor.label}
    </span>
  );
}

export function AttemptStatusBadge({ status }: { status?: string }) {
  const decor = attemptStatusDecor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold"
      style={{
        backgroundColor: `${decor.color}1f`,
        color: decor.color,
        border: `1px solid ${decor.color}55`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: decor.color }} />
      {decor.label}
    </span>
  );
}
