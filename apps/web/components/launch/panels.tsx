// =============================================================================
// HSI Phase 23 — Launch Operations panels (server-safe presentational):
//   ReadinessScoreCard — overall status + 0-100 score + READY/NOT READY.
//   LaunchAreaGrid     — the six readiness areas as RED/YELLOW/GREEN cards.
//   ReadinessChecklist — every check with status + detail; blockers first.
//   EnvPanel           — required/optional env + masked values.
//   HealthPanel        — Supabase/auth/storage probe lines.
//   TesterPanel        — active tester count + RBAC source.
// =============================================================================

import { Card } from '@hsi/ui';
import { Gauge, ListChecks, ServerCog, Database, Users, ShieldCheck, AlertOctagon } from 'lucide-react';
import type { LaunchStatus } from '@/lib/launch/types';
import type { ReadinessReport, Status, AreaKey } from '@/lib/launch/readiness';
import { areaLabel, statusColor, statusLabel } from '@/lib/launch/view';

function Dot({ status }: { status: Status }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor(status), boxShadow: `0 0 8px ${statusColor(status)}` }} />;
}

export function ReadinessScoreCard({ readiness }: { readiness: ReadinessReport }) {
  const color = statusColor(readiness.overall);
  const ready = readiness.recommendation === 'READY';
  return (
    <Card className="space-y-4 border-border" padded>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1f` }}>
            <Gauge className="h-6 w-6" style={{ color }} />
          </span>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-h3 font-bold tabular-nums text-text-primary">{readiness.score}</span>
              <span className="text-caption text-text-muted">/ 100 readiness</span>
            </div>
            <div className="flex items-center gap-1.5"><Dot status={readiness.overall} /><span className="text-caption font-semibold" style={{ color }}>{statusLabel(readiness.overall)}</span></div>
          </div>
        </div>
        <span
          className="rounded-full px-3 py-1.5 text-caption font-bold uppercase tracking-wide"
          style={{ backgroundColor: ready ? '#10B98122' : '#EF444422', color: ready ? '#10B981' : '#EF4444', border: `1px solid ${ready ? '#10B98155' : '#EF444455'}` }}
        >
          {readiness.recommendation === 'READY' ? 'Beta: READY' : 'Beta: NOT READY'}
        </span>
      </div>
      {readiness.blockers.length > 0 ? (
        <div className="space-y-1.5 rounded-card border border-risk/40 bg-risk/5 p-3">
          <div className="flex items-center gap-1.5 text-caption font-semibold text-risk"><AlertOctagon className="h-4 w-4" /> {readiness.blockers.length} launch blocker(s)</div>
          <ul className="space-y-0.5 text-caption text-text-secondary">
            {readiness.blockers.map((b) => <li key={b.key} className="flex gap-1.5"><span className="text-risk">•</span> {b.label}: {b.detail}</li>)}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

export function LaunchAreaGrid({ readiness }: { readiness: ReadinessReport }) {
  const order: AreaKey[] = ['production', 'migration', 'role', 'tester', 'deployment', 'security'];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {order.map((k) => {
        const status = readiness.areas[k];
        return (
          <Card key={k} className="space-y-1.5 border-border" padded>
            <div className="flex items-center justify-between">
              <span className="text-label uppercase tracking-wide text-text-muted">{areaLabel(k)}</span>
              <Dot status={status} />
            </div>
            <div className="text-h6 font-bold" style={{ color: statusColor(status) }}>{statusLabel(status)}</div>
          </Card>
        );
      })}
    </div>
  );
}

export function ReadinessChecklist({ readiness }: { readiness: ReadinessReport }) {
  const sorted = [...readiness.checks].sort((a, b) => {
    const rank = { RED: 0, YELLOW: 1, GREEN: 2 } as const;
    return rank[a.status] - rank[b.status];
  });
  return (
    <Card className="space-y-2 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ListChecks className="h-4 w-4 text-electric" /> Readiness checks</h3>
      <ul className="divide-y divide-border/60">
        {sorted.map((c) => (
          <li key={c.key} className="flex items-start gap-2.5 py-2">
            <span className="mt-1"><Dot status={c.status} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-caption font-semibold text-text-primary">{c.label}</span>
                {c.blocker ? <span className="rounded-full bg-risk/15 px-1.5 py-0.5 text-[10px] font-semibold text-risk">blocker</span> : null}
              </div>
              <p className="text-caption text-text-secondary">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function EnvPanel({ env }: { env: LaunchStatus['env'] }) {
  return (
    <Card className="space-y-2 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ServerCog className="h-4 w-4 text-electric" /> Environment</h3>
      {env.requiredMissing.length === 0 ? (
        <p className="text-caption text-verified">All required environment variables present.</p>
      ) : (
        <p className="text-caption text-risk">Missing required: {env.requiredMissing.join(', ')}</p>
      )}
      {env.optionalMissing.length > 0 ? (
        <p className="text-caption text-warning">Optional not set (features degraded): {env.optionalMissing.join(', ')}</p>
      ) : null}
      {Object.keys(env.masked).length > 0 ? (
        <div className="space-y-0.5 pt-1">
          {Object.entries(env.masked).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-label">
              <span className="font-mono text-text-muted">{k}</span>
              <span className="font-mono text-text-secondary">{v}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function HealthPanel({ health }: { health: LaunchStatus['health'] }) {
  return (
    <Card className="space-y-2 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Database className="h-4 w-4 text-electric" /> Connectivity</h3>
      {health.length === 0 ? (
        <p className="text-caption text-text-muted">No health probes available.</p>
      ) : (
        <ul className="space-y-1">
          {health.map((h) => (
            <li key={h.service} className="flex items-center justify-between text-caption">
              <span className="capitalize text-text-secondary">{h.service}</span>
              <span className="font-semibold" style={{ color: h.ok ? '#10B981' : '#EF4444' }}>{h.ok ? 'healthy' : 'down'}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TesterPanel({ status }: { status: LaunchStatus }) {
  return (
    <Card className="space-y-2 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Users className="h-4 w-4 text-electric" /> Testers &amp; roles</h3>
      <div className="flex items-center justify-between text-caption">
        <span className="text-text-secondary">Users with a role</span>
        <span className="font-semibold tabular-nums text-text-primary">{status.testerCount ?? '—'}</span>
      </div>
      <div className="flex items-center justify-between text-caption">
        <span className="text-text-secondary">Your role</span>
        <span className="font-semibold text-text-primary">{status.rbac.resolvedRole ?? '—'}</span>
      </div>
      <p className="flex items-center gap-1.5 text-label text-text-muted"><ShieldCheck className="h-3 w-3 text-verified" /> Role source: {status.rbac.source}</p>
    </Card>
  );
}
