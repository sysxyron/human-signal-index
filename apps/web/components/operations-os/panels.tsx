// =============================================================================
// HSI Phase 24 — Human Operations panels (server-safe presentational).
// =============================================================================

import { Card } from '@hsi/ui';
import type {
  HsinOpsAlertRecord, OpsCaseView, OpsTeamWorkloadView, OpsWorkloadRowView, WorkloadsData,
} from '@hsi/shared-types';
import { alertSeverityColor, escalationColor, opsStatusColor, titleize } from '@/lib/operations-os/view';

export function StatCards({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((s) => (
        <Card key={s.label} className="space-y-1 border-border" padded>
          <div className="text-h5 font-bold tabular-nums" style={{ color: s.color ?? '#E5E7EB' }}>{s.value}</div>
          <div className="text-label uppercase tracking-wide text-text-muted">{s.label}</div>
        </Card>
      ))}
    </div>
  );
}

export function TeamWorkloadGrid({ teams }: { teams: OpsTeamWorkloadView[] }) {
  if (teams.length === 0) return <EmptyCard message="No team workload data yet." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {teams.map((t) => (
        <Card key={t.team} className="space-y-1.5 border-border" padded>
          <div className="flex items-center justify-between">
            <span className="text-body font-semibold text-text-primary">{titleize(String(t.team))}</span>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: opsStatusColor(t.status) }} />
          </div>
          <div className="text-caption text-text-secondary">{t.open} open · {t.overdue} overdue · {t.members} member(s)</div>
          <div className="text-label uppercase tracking-wide" style={{ color: opsStatusColor(t.status) }}>{t.status}</div>
        </Card>
      ))}
    </div>
  );
}

export function WorkloadTable({ rows }: { rows: OpsWorkloadRowView[] }) {
  if (rows.length === 0) return <EmptyCard message="No assignee workload data yet." />;
  return (
    <Card className="overflow-hidden border-border p-0" padded={false}>
      <table className="w-full text-caption">
        <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
          <tr><th className="px-4 py-2 text-left">Assignee</th><th className="px-4 py-2 text-right">Assigned</th><th className="px-4 py-2 text-right">Open</th><th className="px-4 py-2 text-right">Overdue</th><th className="px-4 py-2 text-right">Escalated</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assignee} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2 font-medium text-text-primary">{r.assignee}</td>
              <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{r.assigned}</td>
              <td className="px-4 py-2 text-right tabular-nums text-text-primary">{r.open}</td>
              <td className="px-4 py-2 text-right tabular-nums" style={{ color: r.overdue > 0 ? '#F59E0B' : undefined }}>{r.overdue}</td>
              <td className="px-4 py-2 text-right tabular-nums" style={{ color: r.escalated > 0 ? '#EF4444' : undefined }}>{r.escalated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function CaseList({ cases, emptyMessage }: { cases: OpsCaseView[]; emptyMessage: string }) {
  if (cases.length === 0) return <EmptyCard message={emptyMessage} />;
  return (
    <div className="space-y-2">
      {cases.map((c) => (
        <Card key={c.id} className="flex items-center justify-between gap-3 border-border" padded>
          <div className="min-w-0">
            <div className="truncate text-body font-medium text-text-primary">{c.title}</div>
            <div className="flex flex-wrap items-center gap-2 text-label text-text-muted">
              <span>{titleize(String(c.state))}</span>
              <span>· {titleize(String(c.team))}</span>
              {c.assignee ? <span>· {c.assignee}</span> : <span>· unassigned</span>}
              {c.overdue ? <span className="text-warning">· overdue</span> : null}
            </div>
          </div>
          {c.escalation && c.escalation !== 'LOW' ? (
            <span className="rounded-full px-2 py-0.5 text-label font-semibold uppercase" style={{ backgroundColor: `${escalationColor(c.escalation)}1f`, color: escalationColor(c.escalation) }}>{c.escalation}</span>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

export function AlertList({ alerts }: { alerts: HsinOpsAlertRecord[] }) {
  if (alerts.length === 0) return <EmptyCard message="No operational alerts. Everything is on track." />;
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <Card key={a.id} className="flex items-start gap-3 border-border" padded>
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: alertSeverityColor(a.severity) }} />
          <div className="min-w-0">
            <div className="text-body font-medium text-text-primary">{a.title}</div>
            <div className="text-caption text-text-secondary">{a.detail}</div>
            <div className="text-label uppercase tracking-wide text-text-muted">{titleize(String(a.kind ?? ''))} · advisory</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function WorkloadTotals({ data }: { data: WorkloadsData }) {
  return (
    <StatCards items={[
      { label: 'Open', value: data.totals.open, color: '#3B82F6' },
      { label: 'Overdue', value: data.totals.overdue, color: '#F59E0B' },
      { label: 'Escalated', value: data.totals.escalated, color: '#EF4444' },
      { label: 'Review backlog', value: data.totals.reviewBacklog, color: '#8B5CF6' },
      { label: 'Publication backlog', value: data.totals.publicationBacklog, color: '#06B6D4' },
    ]} />
  );
}

function EmptyCard({ message }: { message: string }) {
  return <Card className="border-border p-6 text-center text-caption text-text-muted" padded>{message}</Card>;
}
