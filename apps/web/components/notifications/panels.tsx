// =============================================================================
// HSI Phase 62 — Notification presentational panels (server). Summary metrics,
// severity breakdown, and the admin executive alert summary. All counts arrive
// pre-computed from the engine — nothing is hardcoded here. Display only.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Bell, BellOff, CheckCheck, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';
import type { NotificationStats, NotificationSeverity } from '@/lib/notifications/types';
import { SEVERITIES } from '@/lib/notifications/types';
import type { ExecutiveAlertSummary } from '@/lib/notifications/service';

const n = (v: number) => v.toLocaleString('en-US');

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  INFO: '#3B82F6', NOTICE: '#0EA5E9', WARNING: '#F59E0B', CRITICAL: '#EF4444',
};

export function NotificationSummary({ stats, unread }: { stats: NotificationStats; unread: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Unread" value={n(unread)} accent="#F59E0B" icon={Bell} />
      <MetricCard label="Read" value={n(stats.read)} accent="#10B981" icon={CheckCheck} />
      <MetricCard label="Active total" value={n(stats.total)} accent="#3B82F6" icon={Activity} />
      <MetricCard label="Archived" value={n(stats.archived)} accent="#94A3B8" icon={BellOff} />
    </div>
  );
}

export function SeverityBreakdown({ stats }: { stats: NotificationStats }) {
  const max = Math.max(1, ...SEVERITIES.map((s) => stats.bySeverity[s]));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Severity breakdown</h3>
      </div>
      <ul className="space-y-3">
        {SEVERITIES.map((sev) => {
          const v = stats.bySeverity[sev];
          const pct = Math.round((v / max) * 100);
          return (
            <li key={sev} className="space-y-1">
              <div className="flex items-center justify-between text-caption">
                <span className="flex items-center gap-2 font-medium text-text-secondary">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[sev] }} />
                  {sev}
                </span>
                <span className="font-semibold tabular-nums text-text-primary">{n(v)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: SEVERITY_COLOR[sev], opacity: 0.85 }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const TONE_STYLE: Record<NotificationSeverity, string> = {
  INFO: 'border-border bg-background-deep/30 text-text-secondary',
  NOTICE: 'border-electric/30 bg-electric/5 text-electric',
  WARNING: 'border-warning/40 bg-warning/5 text-warning',
  CRITICAL: 'border-risk/40 bg-risk/5 text-risk',
};

export function ExecutiveAlertsPanel({ summary }: { summary: ExecutiveAlertSummary }) {
  return (
    <Card className="space-y-5 border-electric/30">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Executive Alerts</h3>
        <span className="ml-auto text-caption text-text-muted">{n(summary.totalActive)} active · {n(summary.criticalActive)} critical</span>
      </div>
      <p className="text-caption text-text-muted">Platform-wide, computed from the notification stream and live source-reliability + review backlog. No fabricated readiness indicators.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summary.categories.map((c) => (
          <div key={c.key} className={`rounded-card border p-4 ${TONE_STYLE[c.tone]}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-body-sm font-semibold text-text-primary">{c.label}</span>
              <span className="text-h5 font-bold tabular-nums">{n(c.count)}</span>
            </div>
            <p className="mt-1 text-caption text-text-muted">{c.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
