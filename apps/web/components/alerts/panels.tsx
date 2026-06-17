// =============================================================================
// HSI Phase 51 — Alerts & Watchlists panels (server-rendered, read-only).
// Public-safe aggregates. Graceful empty states. No notification sending.
// =============================================================================

import { Card } from '@hsi/ui';
import {
  Bell, Radio, TrendingUp, Database, ClipboardCheck, Gauge, Activity, Mail, MessageSquare, Webhook, Smartphone,
} from 'lucide-react';
import type {
  Alert, AlertSeverity, EmergingNarrative, SourceAlerts, ReviewAlerts, ExecAlertSummary, AlertHealth, NotificationChannel,
} from '@/lib/alerts-intelligence';

const SEV_COLOR: Record<AlertSeverity, string> = {
  Critical: '#B91C1C', High: '#EF4444', Moderate: '#F59E0B', Low: '#3B82F6', Informational: '#94A3B8',
};
const n = (v: number) => v.toLocaleString('en-US');

export function ExecutiveAlertSummary({ summary }: { summary: ExecAlertSummary }) {
  const items = [
    { label: 'Top risk', value: summary.topRisk },
    { label: 'Fastest growing', value: summary.fastestGrowing },
    { label: 'Largest backlog', value: summary.largestBacklog },
    { label: 'Top source category', value: summary.topSourceCategory },
    { label: 'Platform health', value: summary.platformHealth },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-electric" /><h2 className="text-h6 font-semibold text-text-primary">Executive alert summary</h2></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{it.label}</div>
            <div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={it.value}>{it.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AlertHealthPanel({ health }: { health: AlertHealth }) {
  const cells = [
    { label: 'Total alerts', value: n(health.total), color: '#3B82F6' },
    { label: 'Active', value: n(health.active), color: '#F59E0B' },
    { label: 'Resolved', value: n(health.resolved), color: '#10B981' },
    { label: 'New today', value: n(health.newToday), color: '#8B5CF6' },
    { label: 'Critical open', value: n(health.criticalOpen), color: '#B91C1C' },
    { label: 'Avg severity', value: health.avgSeverity, color: SEV_COLOR[health.avgSeverity] },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {cells.map((c) => (
        <Card key={c.label} className="space-y-1">
          <div className="text-h5 font-bold tabular-nums" style={{ color: c.color }}>{c.value}</div>
          <div className="text-caption text-text-muted">{c.label}</div>
        </Card>
      ))}
    </div>
  );
}

export function SeverityPanel({ distribution, trend }: { distribution: { severity: AlertSeverity; count: number }[]; trend: number[] }) {
  const max = Math.max(1, ...distribution.map((d) => d.count));
  const maxT = Math.max(1, ...trend);
  return (
    <Card className="space-y-4">
      <h3 className="text-h6 font-semibold text-text-primary">Alert severity</h3>
      <ul className="space-y-2">
        {distribution.map((d) => (
          <li key={d.severity} className="space-y-1">
            <div className="flex items-center justify-between text-caption">
              <span className="flex items-center gap-2 font-medium text-text-secondary"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEV_COLOR[d.severity] }} />{d.severity}</span>
              <span className="font-semibold tabular-nums text-text-primary">{n(d.count)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.round((d.count / max) * 100)}%`, backgroundColor: SEV_COLOR[d.severity] }} /></div>
          </li>
        ))}
      </ul>
      {trend.length >= 2 ? (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Activity trend</div>
          <div className="flex h-8 items-end gap-0.5">
            {trend.map((v, i) => <div key={i} className="flex-1 rounded-t bg-electric/70" style={{ height: `${Math.max(8, (v / maxT) * 100)}%` }} />)}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function AlertFeed({ alerts }: { alerts: Alert[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Alert feed</h3></div>
      {alerts.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No alerts — the platform is quiet.</p>
      ) : (
        <ul className="space-y-2.5">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV_COLOR[a.severity] }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: SEV_COLOR[a.severity] }}>{a.type}</span>
                  <span className="rounded-full bg-surface-2/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-muted">{a.severity}</span>
                </div>
                <div className="truncate text-caption text-text-secondary">{a.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function EmergingNarratives({ emerging }: { emerging: EmergingNarrative[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Emerging narratives</h3></div>
      {emerging.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-6 text-center text-caption text-text-muted">No emerging narratives detected.</p>
      ) : (
        <ul className="space-y-2">
          {emerging.map((e) => (
            <li key={e.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2.5">
              <div className="flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-warning" /><span className="text-body-sm font-semibold text-text-primary">{e.label}</span></div>
              <p className="mt-1 text-caption text-text-muted">{e.reason}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {e.counts.map((c) => <span key={c.label} className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] text-text-secondary">{c.label}: <span className="font-semibold text-text-primary">{c.value}</span></span>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SourceAlertsPanel({ data }: { data: SourceAlerts }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Database className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Source alerts</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Inactive" value={n(data.inactive)} />
        <Cell label="Failing" value={n(data.failing)} tone={data.failing > 0 ? '#EF4444' : undefined} />
        <Cell label="Recovered" value={n(data.recovered)} tone={data.recovered > 0 ? '#10B981' : undefined} />
        <Cell label="High-yield" value={n(data.highYield)} />
      </div>
      <div>
        <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Coverage gaps</h4>
        {data.coverageGaps.length === 0 ? <p className="text-caption text-verified">All categories covered.</p> : (
          <div className="flex flex-wrap gap-1.5">{data.coverageGaps.map((g) => <span key={g} className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] text-warning">{g}</span>)}</div>
        )}
      </div>
    </Card>
  );
}

export function ReviewAlertsPanel({ data }: { data: ReviewAlerts }) {
  const pressureColor = data.queuePressure === 'High' ? '#EF4444' : data.queuePressure === 'Medium' ? '#F59E0B' : '#10B981';
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Review alerts</h3>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${pressureColor}1f`, color: pressureColor }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pressureColor }} />{data.queuePressure} pressure</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Pending" value={n(data.pending)} />
        <Cell label="Aging" value={n(data.aging)} />
        <Cell label="Pub delays" value={n(data.publicationDelays)} />
        <Cell label="Backlog growth" value={data.backlogGrowth} />
      </div>
    </Card>
  );
}

const CHANNEL_ICON: Record<string, typeof Mail> = { Email: Mail, SMS: MessageSquare, Webhooks: Webhook, Push: Smartphone };

export function NotificationPrep({ channels }: { channels: NotificationChannel[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Notification channels</h3><span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-text-muted">future phase</span></div>
      <p className="text-caption text-text-muted">Delivery is not enabled in this phase. The architecture below is reserved for a future notification engine — no alerts are sent.</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {channels.map((c) => {
          const Icon = CHANNEL_ICON[c.channel] ?? Mail;
          return (
            <div key={c.channel} className="rounded-card border border-dashed border-border/70 bg-background-deep/30 p-3">
              <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-text-muted" /><span className="text-body-sm font-semibold text-text-primary">{c.channel}</span><span className="ml-auto rounded-full bg-surface-2/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-muted">{c.status}</span></div>
              <p className="mt-1 text-caption text-text-muted">{c.description}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className="text-h6 font-bold tabular-nums" style={{ color: tone ?? undefined }}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
