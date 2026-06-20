// =============================================================================
// HSI Phase 70.1 — Infrastructure dashboard panels (server). Health board, backup
// & recovery, deployment ledger, migration verification, operational metrics,
// uptime, incidents, and the infra event log. All values computed. Display only.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Server, Database, ShieldCheck, AlertTriangle, XOctagon, HardDrive, Rocket, GitBranch, Activity, Clock } from 'lucide-react';
import type {
  InfraDashboard, UptimeSummary, CurrentDeployment,
} from '@/lib/infra/data';
import type { SubsystemHealth, HealthState, BackupRecord, BackupRecovery, DeploymentRecord, IncidentRecord, InfraEventRecord, OperationalMetrics } from '@/lib/infra/types';
import type { MigrationAuditResult } from '@/lib/launch/migration-audit';

const n = (v: number) => v.toLocaleString('en-US');
const STATE_DOT: Record<HealthState, string> = { ok: 'bg-verified', degraded: 'bg-warning', down: 'bg-risk', unconfigured: 'bg-text-muted', unknown: 'bg-text-muted' };
const STATE_TONE: Record<HealthState, string> = { ok: 'text-verified', degraded: 'text-warning', down: 'text-risk', unconfigured: 'text-text-muted', unknown: 'text-text-muted' };

function bytes(b: number | null): string { if (b == null) return '—'; if (b < 1024) return `${b} B`; if (b < 1048576) return `${Math.round(b / 1024)} KB`; if (b < 1073741824) return `${Math.round(b / 1048576)} MB`; return `${(b / 1073741824).toFixed(1)} GB`; }
function mins(m: number | null): string { if (m == null) return '—'; if (m < 60) return `${m}m`; if (m < 1440) return `${Math.round(m / 60)}h`; return `${Math.round(m / 1440)}d`; }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso?: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`; }

export function HealthBoard({ health, overall }: { health: SubsystemHealth[]; overall: HealthState }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Server className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Infrastructure health</h3><span className={`ml-auto text-caption font-semibold uppercase ${STATE_TONE[overall]}`}>{overall}</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {health.map((s) => (
          <div key={s.name} className="flex items-start gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATE_DOT[s.state]}`} />
            <div className="min-w-0"><div className="text-body-sm font-medium text-text-primary">{s.name}</div><div className="truncate text-[11px] text-text-muted" title={s.detail}>{s.state} · {s.detail}</div></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function BackupRecoveryPanel({ recovery, backups }: { recovery: BackupRecovery; backups: BackupRecord[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Backup &amp; recovery</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <KV label="Last backup" value={fmt(recovery.lastBackupAt)} />
        <KV label="Status" value={recovery.lastStatus ?? '—'} />
        <KV label="Size" value={bytes(recovery.lastSizeBytes)} />
        <KV label="Restore-tested" value={recovery.restoreTested ? `yes (${fmt(recovery.restoreTestedAt)})` : 'no'} />
        <KV label="RPO" value={`${mins(recovery.actualRpoMinutes)} / ${mins(recovery.rpoTargetMinutes)} target`} tone={recovery.withinRpo === false ? 'text-risk' : recovery.withinRpo ? 'text-verified' : 'text-text-muted'} />
        <KV label="RTO target" value={mins(recovery.rtoTargetMinutes)} />
      </div>
      {backups.length === 0 ? <p className="text-caption text-text-muted">No backups recorded yet. Record backup events to populate this ledger.</p> : (
        <ul className="space-y-1 text-caption">
          {backups.slice(0, 8).map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-text-muted"><span className="w-40 shrink-0">{fmt(b.backedUpAt)}</span><span className={b.status === 'success' ? 'text-verified' : 'text-risk'}>{b.status}</span><span>· {b.kind} · {bytes(b.sizeBytes)}</span>{b.restoreTested ? <span className="text-verified">· restore-tested</span> : null}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DeploymentLedger({ deployments, current }: { deployments: DeploymentRecord[]; current: CurrentDeployment }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Rocket className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Deployment ledger</h3><span className="ml-auto text-caption text-text-muted">running: v{current.version} · {current.commitSha} · {current.environment}</span></div>
      {deployments.length === 0 ? <p className="text-caption text-text-muted">No deployments recorded. Record a deployment to start the ledger.</p> : (
        <ul className="space-y-1 text-caption">
          {deployments.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-text-muted"><span className="w-40 shrink-0">{fmt(d.deployedAt)}</span><span className="font-semibold text-text-secondary">v{d.version ?? '—'}</span><span>{d.commitSha?.slice(0, 12) ?? '—'}</span><span>· {d.environment}</span><span className={d.status === 'success' ? 'text-verified' : 'text-risk'}>· {d.status}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MigrationVerification({ migrations }: { migrations: MigrationAuditResult | null }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Migration verification</h3></div>
      {!migrations ? <p className="text-caption text-text-muted">Migration status unavailable.</p> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KV label="Repo migrations" value={String(migrations.total)} />
            <KV label="Applied" value={migrations.verifiable ? String(migrations.applied) : 'not verifiable'} />
            <KV label="Missing" value={migrations.verifiable ? String(migrations.missing) : '—'} tone={migrations.missing > 0 ? 'text-risk' : 'text-verified'} />
            <KV label="Drift" value={migrations.extra.length > 0 ? `${migrations.extra.length}` : (migrations.outOfOrder > 0 ? `${migrations.outOfOrder} out-of-order` : 'none')} tone={migrations.extra.length || migrations.outOfOrder ? 'text-warning' : 'text-verified'} />
          </div>
          {!migrations.verifiable ? <p className="text-caption text-text-muted">Applied status not verifiable from this environment — verify via the Supabase CLI / schema_migrations.</p> : null}
        </>
      )}
    </Card>
  );
}

export function OperationalMetricsPanel({ metrics }: { metrics: OperationalMetrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Sources" value={n(metrics.sources)} accent="#3B82F6" icon={Database} />
      <MetricCard label="Signals" value={n(metrics.signals)} accent="#6366F1" icon={Activity} />
      <MetricCard label="Evidence" value={n(metrics.evidence)} accent="#0EA5E9" icon={ShieldCheck} />
      <MetricCard label="Narratives" value={n(metrics.narratives)} accent="#8B5CF6" icon={Activity} />
      <MetricCard label="Forecasts" value={n(metrics.forecasts)} accent="#10B981" icon={Activity} />
      <MetricCard label="Marketplace" value={n(metrics.marketplaceProducts)} accent="#F59E0B" icon={Server} />
      <MetricCard label="Notifications" value={n(metrics.notifications)} accent="#A855F7" icon={Activity} />
      <MetricCard label="Agents" value={n(metrics.agents)} accent="#0EA5E9" icon={Server} />
    </div>
  );
}

export function UptimePanel({ uptime, incidents }: { uptime: UptimeSummary[]; incidents: IncidentRecord[] }) {
  const open = incidents.filter((i) => i.status === 'open');
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Uptime monitoring</h3>{open.length > 0 ? <span className="ml-auto text-caption font-semibold text-risk">{open.length} open incident(s)</span> : <span className="ml-auto text-caption font-semibold text-verified">all clear</span>}</div>
      {uptime.length === 0 ? <p className="text-caption text-text-muted">No uptime checks recorded yet. Run a check (or wait for the scheduled run).</p> : (
        <ul className="space-y-2">
          {uptime.map((u) => (
            <li key={u.endpoint} className="space-y-1">
              <div className="flex items-center justify-between text-caption"><span className="flex items-center gap-2 text-text-secondary"><span className={`h-2 w-2 rounded-full ${u.lastOk ? 'bg-verified' : 'bg-risk'}`} />{u.endpoint}</span><span className="text-text-muted">{u.pct == null ? '—' : `${u.pct}%`} ({u.total} checks)</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-verified" style={{ width: `${u.pct ?? 0}%`, opacity: 0.8 }} /></div>
            </li>
          ))}
        </ul>
      )}
      {incidents.length > 0 ? (
        <div className="space-y-1 pt-1">
          <p className="text-label uppercase tracking-wide text-text-muted">Incidents</p>
          {incidents.slice(0, 6).map((i) => <p key={i.id} className="text-caption text-text-muted"><span className={i.status === 'open' ? 'text-risk' : 'text-verified'}>{i.status}</span> · {i.endpoint} · {fmt(i.startedAt)}{i.resolvedAt ? ` → ${fmt(i.resolvedAt)}` : ''}</p>)}
        </div>
      ) : null}
    </Card>
  );
}

export function InfraEventsPanel({ events }: { events: InfraEventRecord[] }) {
  const tone: Record<string, string> = { info: 'text-text-muted', warning: 'text-warning', error: 'text-risk', critical: 'text-risk' };
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Infrastructure events</h3></div>
      {events.length === 0 ? <p className="text-caption text-text-muted">No infrastructure events recorded.</p> : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-1.5 text-caption">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{e.category}</span>
              <span className={`shrink-0 ${tone[e.severity] ?? 'text-text-muted'}`}>{e.severity}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{e.detail ?? e.eventType}</span>
              <span className="shrink-0 text-text-muted">{fmt(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function KV({ label, value, tone = 'text-text-primary' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div><div className={`truncate text-body-sm font-semibold ${tone}`} title={value}>{value}</div></div>;
}
