// =============================================================================
// HSI Phase 8 — ProviderRateLimitGrid. Per-provider rate-limit windows
// (window / remaining / reset) with a budget bar. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Gauge } from 'lucide-react';
import type { HsinProviderRateLimitRecord } from '@hsi/shared-types';
import {
  formatDateTime,
  rateLimitDecor,
  rateLimitFraction,
  titleize,
} from '@/lib/operations/view';

export function ProviderRateLimitGrid({
  limits,
}: {
  limits: HsinProviderRateLimitRecord[];
}) {
  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Gauge className="h-4 w-4 text-electric" /> Provider rate limits
      </h3>
      {limits.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No provider rate-limit windows recorded.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {limits.map((r) => {
            const decor = rateLimitDecor(r);
            const f = rateLimitFraction(r);
            const pct = f == null ? null : Math.round(f * 100);
            return (
              <div
                key={r.id}
                className="space-y-2 rounded-card border border-border bg-surface-2/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-text-primary">
                    {titleize(r.provider_name)}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-caption font-semibold"
                    style={{
                      backgroundColor: `${decor.color}1f`,
                      color: decor.color,
                      border: `1px solid ${decor.color}55`,
                    }}
                  >
                    {decor.label}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct ?? 0}%`,
                      backgroundColor: decor.color,
                    }}
                  />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-caption">
                  <div>
                    <dt className="text-text-muted">Remaining</dt>
                    <dd className="font-mono text-text-primary">
                      {r.remaining_requests ?? '—'}
                      {r.max_requests != null ? ` / ${r.max_requests}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Window</dt>
                    <dd className="font-mono text-text-primary">
                      {r.window_seconds != null ? `${r.window_seconds}s` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Resets</dt>
                    <dd className="font-mono text-text-primary">
                      {formatDateTime(r.reset_at)}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
