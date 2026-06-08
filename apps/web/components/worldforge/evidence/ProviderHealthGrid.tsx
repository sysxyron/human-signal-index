import { Card } from '@hsi/ui';
import { Activity } from 'lucide-react';
import {
  PROVIDER_HEALTH_STYLES,
  type ProviderHealthRecord,
  type ProviderHealthStatus,
} from '@/lib/worldforge/evidence-intel-view';
import { ProviderHealthTile } from './ProviderHealthTile';

export interface ProviderHealthGridProps {
  providers: ProviderHealthRecord[];
  className?: string;
}

const STATUS_ORDER: ProviderHealthStatus[] = ['OFFLINE', 'DEGRADED', 'HEALTHY'];

/**
 * Provider-health grid for the Evidence Intelligence dashboard: one tile per
 * evidence provider, with a quick status roll-up legend. Server-safe.
 */
export function ProviderHealthGrid({
  providers,
  className = '',
}: ProviderHealthGridProps) {
  if (providers.length === 0) {
    return (
      <Card className={`space-y-1.5 ${className}`} padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Activity className="h-4 w-4 text-electric" /> Provider health
        </h3>
        <p className="text-caption text-text-muted">
          No provider health data yet. Provider health is recorded as evidence is
          gathered from live research APIs.
        </p>
      </Card>
    );
  }

  // Worst-first so problems surface at the top.
  const sorted = [...providers].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );

  const counts = providers.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
          <Activity className="h-5 w-5 text-electric" /> Provider health
        </h3>
        <div className="flex flex-wrap gap-2">
          {(['HEALTHY', 'DEGRADED', 'OFFLINE'] as ProviderHealthStatus[]).map(
            (status) => {
              const style = PROVIDER_HEALTH_STYLES[status];
              const n = counts[status] ?? 0;
              return (
                <span
                  key={status}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: style.soft,
                    color: style.color,
                    border: `1px solid ${style.border}`,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: style.color }}
                  />
                  {n} {style.label}
                </span>
              );
            },
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((p) => (
          <ProviderHealthTile key={p.provider} health={p} />
        ))}
      </div>
    </section>
  );
}
