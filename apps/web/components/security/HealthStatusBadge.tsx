// =============================================================================
// HSI Phase 14 — HealthStatusBadge + SeverityBadge + ReviewStatusBadge.
// Decorated pills for the security surface. Server-safe, purely presentational.
// ok=green, degraded=amber, down=red, unconfigured=slate; critical/error are
// never softened. Mirrors the operations JobStatusBadge aesthetic.
// =============================================================================

import { cn } from '@hsi/ui';
import type {
  HealthServiceStatus,
  SecurityEventSeverity,
  SecurityReviewStatus,
} from '@hsi/shared-types';
import {
  healthStatusDecor,
  reviewStatusDecor,
  severityDecor,
  type Decor,
} from '@/lib/security/view';

function Pill({ decor, className = '' }: { decor: Decor; className?: string }) {
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

export function HealthStatusBadge({
  status,
  className = '',
}: {
  status: HealthServiceStatus;
  className?: string;
}) {
  return <Pill decor={healthStatusDecor(status)} className={className} />;
}

export function SeverityBadge({
  severity,
  className = '',
}: {
  severity?: SecurityEventSeverity | string;
  className?: string;
}) {
  return <Pill decor={severityDecor(severity)} className={className} />;
}

export function ReviewStatusBadge({
  status,
  className = '',
}: {
  status?: SecurityReviewStatus | string;
  className?: string;
}) {
  return <Pill decor={reviewStatusDecor(status)} className={className} />;
}
