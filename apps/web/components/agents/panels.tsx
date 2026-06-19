// =============================================================================
// HSI Phase 66 — Agent panels (server). Dashboard overview + agent grid + runs +
// alerts; detail summary + findings. All values computed from persisted records.
// =============================================================================

import { Card, MetricCard, Table } from '@hsi/ui';
import { Bot, CalendarClock, ShieldCheck, AlertTriangle, Play, ListChecks, ShieldAlert } from 'lucide-react';
import type { AgentsDashboard, AgentDashboardItem } from '@/lib/agents/data';
import type { Agent, AgentRun, AgentMetrics, AgentResultRow } from '@/lib/agents/types';
import type { AgentAlertRow } from '@/lib/agents/persistence';

const n = (v: number) => v.toLocaleString('en-US');
const href = (k: string) => `/dashboard/agents/${k}`;

const STATUS_TONE: Record<string, string> = { succeeded: 'text-verified', failed: 'text-risk', running: 'text-electric', cancelled: 'text-text-muted' };
const SEV_STYLE: Record<string, string> = {
  INFO: 'border-border bg-surface-2/50 text-text-secondary', NOTICE: 'border-electric/40 bg-electric/10 text-electric',
  WARNING: 'border-warning/40 bg-warning/10 text-warning', CRITICAL: 'border-risk/40 bg-risk/10 text-risk',
};
function fmtMs(ms: number | null): string { return ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`; }

export function AgentsOverview({ totals }: { totals: AgentsDashboard['totals'] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Registered" value={n(totals.registered)} accent="#3B82F6" icon={Bot} />
      <MetricCard label="Scheduled" value={n(totals.scheduled)} accent="#6366F1" icon={CalendarClock} />
      <MetricCard label="Healthy" value={n(totals.healthy)} accent="#10B981" icon={ShieldCheck} />
      <MetricCard label="Failing" value={n(totals.failing)} accent="#EF4444" icon={AlertTriangle} />
      <MetricCard label="Total runs" value={n(totals.totalRuns)} accent="#8B5CF6" icon={Play} />
    </div>
  );
}

export function AgentGrid({ items }: { items: AgentDashboardItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map(({ agent, metrics, healthy }) => (
        <a key={agent.agentKey} href={href(agent.agentKey)} className="block rounded-card border border-border bg-surface/80 p-4 transition hover:border-electric/60">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${healthy ? 'bg-verified' : 'bg-risk'}`} />
            <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text-primary">{agent.name}</span>
            <span className="shrink-0 rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-semibold capitalize text-text-secondary">{agent.cadence}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-caption text-text-muted">{agent.description}</p>
          <div className="mt-2 flex items-center gap-3 text-caption text-text-muted">
            <span>{metrics ? `${metrics.successRate}% ok` : 'no runs'}</span>
            <span>·</span>
            <span>{metrics?.totalRuns ?? 0} runs</span>
            {metrics?.lastStatus ? <><span>·</span><span className={STATUS_TONE[metrics.lastStatus] ?? ''}>{metrics.lastStatus}</span></> : null}
          </div>
        </a>
      ))}
    </div>
  );
}

export function AgentRunsTable({ runs }: { runs: AgentRun[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Play className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Recent runs</h3></div>
      {runs.length === 0 ? <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No runs yet.</p> : (
        <Table
          data={runs}
          rowKey={(r) => r.id}
          columns={[
            { key: 'agent', header: 'Agent', render: (r) => <a href={href(r.agentKey)} className="text-electric hover:underline">{r.agentKey.replace(/_AGENT$/, '')}</a> },
            { key: 'status', header: 'Status', render: (r) => <span className={`font-semibold ${STATUS_TONE[r.status] ?? ''}`}>{r.status}</span> },
            { key: 'trigger', header: 'Trigger', render: (r) => <span className="text-text-muted">{r.trigger}</span> },
            { key: 'findings', header: 'Findings', align: 'right', render: (r) => <span className="tabular-nums">{r.findingsCount}</span> },
            { key: 'alerts', header: 'Alerts', align: 'right', render: (r) => <span className="tabular-nums text-warning">{r.alertsCount}</span> },
            { key: 'dur', header: 'Duration', align: 'right', render: (r) => <span className="text-caption text-text-muted">{fmtMs(r.durationMs)}</span> },
          ]}
        />
      )}
    </Card>
  );
}

export function AgentAlertsPanel({ alerts }: { alerts: AgentAlertRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Agent alerts</h3><span className="ml-auto text-caption text-text-muted">{n(alerts.length)} recent</span></div>
      {alerts.length === 0 ? <p className="text-caption text-text-muted">No agent alerts.</p> : (
        <ul className="space-y-1.5">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEV_STYLE[a.severity] ?? SEV_STYLE.INFO}`}>{a.severity}</span>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{a.alertType.replace('AGENT_', '')}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{a.reason}</span>
              {a.notificationId ? <span className="shrink-0 text-caption text-verified" title="notified">✓</span> : null}
              <span className="shrink-0 text-caption text-text-muted">{a.createdLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AgentSummaryPanel({ agent, metrics }: { agent: Agent; metrics: AgentMetrics | null }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{agent.name}</h3><span className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-semibold capitalize text-text-secondary">{agent.cadence}</span></div>
      <p className="text-caption text-text-muted">{agent.description}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Runs" value={metrics?.totalRuns ?? 0} />
        <Stat label="Success" value={metrics?.successes ?? 0} tone="text-verified" />
        <Stat label="Failures" value={metrics?.failures ?? 0} tone="text-risk" />
        <Stat label="Success rate" value={metrics?.successRate ?? 0} suffix="%" />
        <Stat label="Avg time" value={metrics?.avgDurationMs ?? 0} suffix=" ms" />
        <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
          <div className="text-body-sm font-semibold capitalize text-text-primary">{metrics?.lastStatus ?? 'never'}</div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Last status</div>
        </div>
      </div>
    </Card>
  );
}

export function AgentFindingsPanel({ results }: { results: AgentResultRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Generated findings</h3><span className="ml-auto text-caption text-text-muted">{n(results.length)}</span></div>
      {results.length === 0 ? <p className="text-caption text-text-muted">No findings yet — run this agent.</p> : (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
              <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEV_STYLE[r.severity] ?? SEV_STYLE.INFO}`}>{r.severity}</span>
              <div className="min-w-0 flex-1">
                <p className="text-text-secondary">{r.finding}</p>
                <p className="text-[11px] text-text-muted">{r.category} · {r.source}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value, tone = 'text-text-primary', suffix = '' }: { label: string; value: number; tone?: string; suffix?: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className={`text-h6 font-bold tabular-nums ${tone}`}>{value.toLocaleString('en-US')}{suffix}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
