// =============================================================================
// HSI Phase 63 — Source Monitoring panels (server). Overview, health trends,
// collections, alert feed, reliability trends, and the executive summary. All
// values arrive pre-computed from the monitoring data layer. Display only.
// =============================================================================

import { Card, MetricCard, Table } from '@hsi/ui';
import {
  Radar, ShieldCheck, AlertTriangle, XOctagon, Lock, Clock, Activity, RefreshCw,
  TrendingUp, TrendingDown, Minus, HelpCircle, ShieldAlert, ClipboardCheck,
} from 'lucide-react';
import type {
  MonitoringOverview, BandDistribution, ChangeCounts, CollectionStats,
  TrendRow, MonitoringExecutive,
} from '@/lib/source-monitoring/data';
import type { AlertRow } from '@/lib/source-monitoring/persistence';
import type { MonitorSeverity, ReliabilityTrend } from '@/lib/source-monitoring/types';

const n = (v: number) => v.toLocaleString('en-US');

const SEV_STYLE: Record<MonitorSeverity, string> = {
  INFO: 'border-border bg-surface-2/50 text-text-secondary',
  NOTICE: 'border-electric/40 bg-electric/10 text-electric',
  WARNING: 'border-warning/40 bg-warning/10 text-warning',
  CRITICAL: 'border-risk/40 bg-risk/10 text-risk',
};
function SevBadge({ s }: { s: string }) {
  const style = SEV_STYLE[(s as MonitorSeverity)] ?? SEV_STYLE.INFO;
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{s}</span>;
}

const KIND_LABEL: Record<string, string> = {
  SOURCE_FAILED: 'Failed', SOURCE_RECOVERED: 'Recovered', SOURCE_BLOCKED: 'Blocked',
  SOURCE_STALE: 'Stale', SOURCE_DEGRADED: 'Degraded', COLLECTION_GAP: 'Collection gap', RELIABILITY_DROP: 'Reliability drop',
};

export function MonitoringOverviewPanel({ overview, lastRunAt }: { overview: MonitoringOverview; lastRunAt: string | null }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-caption text-text-muted">
        <Radar className="h-4 w-4 text-electric" />
        <span>Monitoring {n(overview.total)} sources · last run {lastRunAt ? new Date(lastRunAt).toLocaleString() : 'never (run to establish a baseline)'}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Healthy" value={n(overview.healthy)} accent="#10B981" icon={ShieldCheck} />
        <MetricCard label="Warning" value={n(overview.warning + overview.degraded)} accent="#F59E0B" icon={AlertTriangle} />
        <MetricCard label="Failed" value={n(overview.failed + overview.unreachable)} accent="#EF4444" icon={XOctagon} />
        <MetricCard label="Blocked" value={n(overview.blocked)} accent="#F97316" icon={Lock} />
        <MetricCard label="Stale" value={n(overview.stale)} accent="#A855F7" icon={Clock} />
        <MetricCard label="Degraded" value={n(overview.degraded)} accent="#EAB308" icon={TrendingDown} />
        <MetricCard label="Unreachable" value={n(overview.unreachable)} accent="#DC2626" icon={XOctagon} />
        <MetricCard label="Total monitored" value={n(overview.total)} accent="#3B82F6" icon={Radar} />
      </div>
    </div>
  );
}

const BAND_COLOR: Record<string, string> = { Excellent: '#10B981', Healthy: '#3B82F6', 'At Risk': '#F59E0B', Failing: '#EF4444' };

export function HealthTrendsPanel({ distribution, changes }: { distribution: BandDistribution[]; changes: ChangeCounts }) {
  const max = Math.max(1, ...distribution.map((d) => d.count));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Health trends</h3></div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="State changes" value={changes.stateChanges} tone="text-text-primary" />
        <Stat label="Failures" value={changes.failures} tone="text-risk" />
        <Stat label="Recoveries" value={changes.recoveries} tone="text-verified" />
      </div>
      <div>
        <p className="mb-2 text-label uppercase tracking-wide text-text-muted">Reliability distribution</p>
        <ul className="space-y-2">
          {distribution.map((d) => (
            <li key={d.tier} className="space-y-1">
              <div className="flex items-center justify-between text-caption">
                <span className="flex items-center gap-2 text-text-secondary"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: BAND_COLOR[d.tier] ?? '#94A3B8' }} />{d.tier}</span>
                <span className="font-semibold tabular-nums text-text-primary">{n(d.count)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.round((d.count / max) * 100)}%`, backgroundColor: BAND_COLOR[d.tier] ?? '#94A3B8', opacity: 0.85 }} /></div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function CollectionsPanel({ collections }: { collections: CollectionStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Fetches / day" value={n(collections.fetchesPerDay)} accent="#3B82F6" icon={RefreshCw} />
      <MetricCard label="Success rate" value={`${collections.successPct}%`} accent="#10B981" icon={ShieldCheck} />
      <MetricCard label="Failure rate" value={`${collections.failurePct}%`} accent="#EF4444" icon={AlertTriangle} />
      <MetricCard label="Avg response" value={collections.avgLatencyMs == null ? '—' : `${n(collections.avgLatencyMs)} ms`} accent="#F59E0B" icon={Clock} />
    </div>
  );
}

export function AlertFeed({ alerts }: { alerts: AlertRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Alert feed</h3><span className="ml-auto text-caption text-text-muted">{n(alerts.length)} recent</span></div>
      {alerts.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No monitoring alerts yet. Run monitoring (or wait for the scheduled run) to generate them.</p>
      ) : (
        <Table
          data={alerts}
          rowKey={(r) => r.id}
          columns={[
            { key: 'sev', header: 'Severity', render: (r) => <SevBadge s={r.severity} /> },
            { key: 'kind', header: 'Alert', render: (r) => <span className="font-medium text-text-primary">{KIND_LABEL[r.kind] ?? r.kind}</span> },
            { key: 'source', header: 'Source', render: (r) => <span className="text-text-secondary">{r.sourceName}</span> },
            { key: 'reason', header: 'Reason', render: (r) => <span className="text-caption text-text-muted">{r.reason ?? '—'}</span> },
            { key: 'notified', header: 'Notified', align: 'center', render: (r) => <span className="text-caption">{r.notificationId ? '✓' : '—'}</span> },
            { key: 'when', header: 'When', align: 'right', render: (r) => <span className="text-caption text-text-muted">{r.createdLabel}</span> },
          ]}
        />
      )}
    </Card>
  );
}

const TREND_ICON: Record<ReliabilityTrend, typeof TrendingUp> = {
  Improving: TrendingUp, Declining: TrendingDown, Stable: Minus, 'Insufficient Data': HelpCircle,
};
const TREND_TONE: Record<ReliabilityTrend, string> = {
  Improving: 'text-verified', Declining: 'text-risk', Stable: 'text-text-secondary', 'Insufficient Data': 'text-text-muted',
};

export function ReliabilityTrends({ trends }: { trends: TrendRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Reliability trends</h3></div>
      {trends.length === 0 ? (
        <p className="text-caption text-text-muted">All monitored sources are healthy — no trend concerns.</p>
      ) : (
        <ul className="space-y-2">
          {trends.map((t) => {
            const Icon = TREND_ICON[t.trend];
            return (
              <li key={t.sourceId} className="flex items-start gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TREND_TONE[t.trend]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate text-body-sm font-medium text-text-primary">{t.sourceName}</span><span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{t.state}</span></div>
                  <p className="text-caption text-text-muted"><span className={`font-semibold ${TREND_TONE[t.trend]}`}>{t.trend}</span> — {t.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function ExecutiveMonitoringSummary({ executive }: { executive: MonitoringExecutive }) {
  return (
    <Card className="space-y-5 border-electric/30">
      <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{executive.question}</h3></div>
      <p className="text-body-sm text-text-secondary">{executive.verdict}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <RankList title="Most reliable sources" rows={executive.mostReliable} tone="text-verified" />
        <RankList title="Most fragile sources" rows={executive.mostFragile} tone="text-risk" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AlertMiniList title="New failures" rows={executive.newFailures} tone="text-risk" />
        <AlertMiniList title="Recovered sources" rows={executive.recovered} tone="text-verified" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-body-sm font-semibold text-text-primary">Top monitoring risks</h4>
          {executive.topRisks.length === 0 ? <p className="text-caption text-text-muted">No active risks.</p> : (
            <ul className="space-y-1.5">
              {executive.topRisks.map((r) => (
                <li key={`${r.sourceName}:${r.state}`} className="text-caption text-text-secondary"><span className="font-semibold text-text-primary">{r.sourceName}</span> · <span className="text-warning">{r.state}</span> — {r.reason}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h4 className="text-body-sm font-semibold text-text-primary">Coverage &amp; category risks</h4>
          <p className="text-caption text-text-muted">Coverage: {executive.coverageRisk}</p>
          {executive.categoryRisks.length === 0 ? <p className="text-caption text-text-muted">No category concentration risks.</p> : (
            <ul className="space-y-1">
              {executive.categoryRisks.map((c) => (<li key={c.label} className="text-caption text-text-secondary">• <span className="font-medium text-text-primary">{c.label}</span> — {c.detail}</li>))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className={`text-h6 font-bold tabular-nums ${tone}`}>{value.toLocaleString('en-US')}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}

function RankList({ title, rows, tone }: { title: string; rows: { name: string; score: number }[]; tone: string }) {
  return (
    <div className="space-y-2">
      <h4 className="text-body-sm font-semibold text-text-primary">{title}</h4>
      {rows.length === 0 ? <p className="text-caption text-text-muted">Not enough data yet.</p> : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-2 text-body-sm">
              <span className="w-4 shrink-0 text-caption font-semibold tabular-nums text-text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{r.name}</span>
              <span className={`shrink-0 text-caption font-semibold tabular-nums ${tone}`}>{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AlertMiniList({ title, rows, tone }: { title: string; rows: AlertRow[]; tone: string }) {
  return (
    <div className="space-y-2">
      <h4 className="text-body-sm font-semibold text-text-primary">{title}</h4>
      {rows.length === 0 ? <p className="text-caption text-text-muted">None recent.</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-body-sm">
              <span className="min-w-0 flex-1 truncate text-text-secondary">{r.sourceName}</span>
              <span className={`shrink-0 text-caption ${tone}`}>{r.createdLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
