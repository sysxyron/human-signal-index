// =============================================================================
// HSI Phase 14 — HealthStatusCard. One card per dependent service (Supabase /
// Auth / REST / Storage) from a HealthCheckResult: status badge, message, and
// key details (HTTP status code, Cloudflare-challenge flag). Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { ShieldAlert } from 'lucide-react';
import type { HealthCheckResult } from '@hsi/shared-types';
import { HealthStatusBadge } from './HealthStatusBadge';
import {
  detailString,
  flagsCloudflareChallenge,
  healthStatusCode,
} from '@/lib/security/view';

export function HealthStatusCard({ check }: { check: HealthCheckResult }) {
  const code = healthStatusCode(check);
  const endpoint = detailString(check.details, 'endpoint');
  const challenge = flagsCloudflareChallenge(check);

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-h6 font-semibold text-text-primary">
            {check.service}
          </h3>
          {endpoint ? (
            <p className="truncate font-mono text-caption text-text-muted">{endpoint}</p>
          ) : null}
        </div>
        <HealthStatusBadge status={check.status} />
      </div>

      <p className="break-words text-body-sm leading-relaxed text-text-secondary">
        {check.message || '—'}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-caption">
        {typeof code === 'number' ? (
          <span className="inline-flex items-center gap-1 rounded-btn border border-border bg-surface-2/60 px-2 py-1 font-mono text-text-secondary">
            HTTP {code}
          </span>
        ) : null}
        {challenge ? (
          <span className="inline-flex items-center gap-1 rounded-btn border border-warning/50 bg-warning/10 px-2 py-1 font-semibold text-warning">
            <ShieldAlert className="h-3.5 w-3.5" /> Cloudflare challenge
          </span>
        ) : null}
      </div>
    </Card>
  );
}
