import { Card } from '@hsi/ui';
import {
  providerHealthStyle,
  shortDate,
  type ProviderHealthRecord,
} from '@/lib/worldforge/evidence-intel-view';

export interface ProviderHealthTileProps {
  health: ProviderHealthRecord;
  className?: string;
}

/**
 * One provider's health tile: name, status badge (HEALTHY/DEGRADED/OFFLINE),
 * latency, success/error counts, and last success/failure timestamps.
 * Server-safe (no hooks).
 */
export function ProviderHealthTile({
  health,
  className = '',
}: ProviderHealthTileProps) {
  const s = providerHealthStyle(health.status);
  const Icon = s.icon;
  const total = health.success_count + health.error_count;
  const successRate = total > 0 ? Math.round((health.success_count / total) * 100) : null;

  return (
    <Card
      className={`space-y-3 ${className}`}
      padded
      style={{ borderColor: s.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-h6 font-semibold text-text-primary">
            {health.provider}
          </p>
          <p className="text-[11px] text-text-muted">
            {health.enabled ? 'Enabled' : 'Disabled'}
            {' · '}
            {health.available ? 'Reachable' : 'Unreachable'}
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
        >
          <Icon className="h-3 w-3" />
          {s.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric
          label="Latency"
          value={
            typeof health.latency_ms === 'number'
              ? `${Math.round(health.latency_ms)}ms`
              : '—'
          }
          color="#3B82F6"
        />
        <Metric label="OK" value={String(health.success_count)} color="#10B981" />
        <Metric label="Errors" value={String(health.error_count)} color="#EF4444" />
      </div>

      <div className="space-y-1 border-t border-border pt-2 text-[11px] text-text-muted">
        {successRate !== null ? (
          <p>
            Success rate{' '}
            <span className="font-semibold" style={{ color: s.color }}>
              {successRate}%
            </span>
          </p>
        ) : null}
        <p>Last success: {shortDate(health.last_success)}</p>
        <p>Last failure: {shortDate(health.last_failure)}</p>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-2 py-1.5 text-center">
      <div className="text-body-sm font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-text-muted">{label}</div>
    </div>
  );
}
