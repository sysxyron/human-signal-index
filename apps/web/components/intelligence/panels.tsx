// =============================================================================
// HSI Phase 18 — Operations Center widget panels (server-safe, pure):
//   SystemHealthPanel · ActiveRunsPanel · ResearchQueuePanel · EscalationPanel
//   · AgentPerformancePanel · RecentFailuresPanel · TrustStatusPanel
//   · GovernanceBacklogPanel
// Each takes its slice of the OperationsDashboardData and renders one card.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import {
  Activity,
  HeartPulse,
  ListTree,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type {
  AgentPerformanceView,
  EngineHealthView,
  HsinResearchEscalationRecord,
  HsinResearchQueueRecord,
  HsinResearchRunRecord,
} from '@hsi/shared-types';
import { HealthBadge, PriorityBadge, RunStateBadge, SeverityBadge } from './badges';
import {
  agentLabel,
  engineLabel,
  formatPct,
  formatRuntime,
  formatTrust,
  healthDecor,
} from '@/lib/orchestration/view';

function PanelShell({
  title,
  icon: Icon,
  children,
  href,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Icon className="h-4 w-4 text-electric" /> {title}
        </h3>
        {href ? (
          <Link href={href as never} className="text-caption font-semibold text-electric hover:underline">
            View all →
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

export function SystemHealthPanel({ health }: { health: EngineHealthView[] }) {
  return (
    <PanelShell title="System health" icon={HeartPulse} href="/dashboard/intelligence/health">
      <div className="grid grid-cols-2 gap-2">
        {health.map((h) => (
          <div key={h.engine} className="flex items-center justify-between rounded-card border border-border bg-surface/50 px-2.5 py-1.5">
            <span className="text-caption text-text-secondary">{engineLabel(h.engine)}</span>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: healthDecor(h.status).color }} title={h.detail} />
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

export function ActiveRunsPanel({ runs }: { runs: HsinResearchRunRecord[] }) {
  return (
    <PanelShell title="Active research" icon={Activity} href="/dashboard/intelligence/runs">
      {runs.length === 0 ? (
        <p className="text-caption text-text-muted">No active runs.</p>
      ) : (
        <ul className="space-y-2">
          {runs.slice(0, 6).map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/intelligence/runs/${r.id}` as never}
                className="flex items-center justify-between rounded-card px-2 py-1.5 transition hover:bg-surface-2/50"
              >
                <span className="truncate text-caption text-text-secondary">{r.title ?? r.id}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <PriorityBadge priority={r.priority} />
                  <RunStateBadge state={r.state} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function ResearchQueuePanel({ queue, depth }: { queue: HsinResearchQueueRecord[]; depth: number }) {
  return (
    <PanelShell title="Research queue" icon={ListTree}>
      <div className="flex items-baseline gap-2">
        <span className="text-h4 font-bold tabular-nums text-text-primary">{depth}</span>
        <span className="text-caption text-text-muted">items waiting</span>
      </div>
      <ul className="space-y-1.5">
        {queue.slice(0, 5).map((q) => (
          <li key={q.id} className="flex items-center justify-between text-caption">
            <span className="text-text-secondary">{q.run_id ?? q.id}</span>
            <PriorityBadge priority={q.priority} />
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

export function EscalationPanel({ escalations }: { escalations: HsinResearchEscalationRecord[] }) {
  return (
    <PanelShell title="Escalations" icon={Siren} href="/dashboard/intelligence/escalations">
      {escalations.length === 0 ? (
        <p className="text-caption text-text-muted">No open escalations — nothing needs attention.</p>
      ) : (
        <ul className="space-y-2">
          {escalations.slice(0, 5).map((e) => (
            <li key={e.id} className="rounded-card border border-border bg-surface/50 p-2">
              <div className="flex items-center justify-between">
                <span className="text-caption font-medium text-text-primary">{e.trigger}</span>
                <SeverityBadge severity={e.severity} />
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-text-muted">{e.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function AgentPerformancePanel({ agents }: { agents: AgentPerformanceView[] }) {
  return (
    <PanelShell title="Agent performance" icon={Users}>
      <table className="w-full text-caption">
        <tbody>
          {agents.map((a) => (
            <tr key={a.agentType} className="border-b border-border/40 last:border-0">
              <td className="py-1.5 text-text-secondary">{agentLabel(a.agentType)}</td>
              <td className="py-1.5 text-right tabular-nums text-text-muted">{a.completed}✓ / {a.failed}✗</td>
              <td className="py-1.5 pl-3 text-right tabular-nums text-text-secondary">{formatPct(a.successRate)}</td>
              <td className="py-1.5 pl-3 text-right">
                <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: healthDecor(a.status).color }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

export function RecentFailuresPanel({ runs }: { runs: HsinResearchRunRecord[] }) {
  return (
    <PanelShell title="Recent failures" icon={TriangleAlert} href="/dashboard/intelligence/runs?state=FAILED">
      {runs.length === 0 ? (
        <p className="text-caption text-text-muted">No recent failures.</p>
      ) : (
        <ul className="space-y-2">
          {runs.slice(0, 5).map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/intelligence/runs/${r.id}` as never}
                className="flex items-center justify-between rounded-card px-2 py-1.5 transition hover:bg-surface-2/50"
              >
                <span className="truncate text-caption text-text-secondary">{r.title ?? r.id}</span>
                <RunStateBadge state={r.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function TrustStatusPanel({ avgTrust }: { avgTrust?: number }) {
  return (
    <PanelShell title="Trust status" icon={ShieldCheck} href="/dashboard/trust/public">
      <div className="flex items-baseline gap-2">
        <span className="text-h4 font-bold tabular-nums text-text-primary">{formatTrust(avgTrust)}</span>
        <span className="text-caption text-text-muted">avg trust across runs</span>
      </div>
    </PanelShell>
  );
}

export function GovernanceBacklogPanel({ backlog }: { backlog: number }) {
  return (
    <PanelShell title="Governance backlog" icon={ShieldCheck} href="/dashboard/trust/proposals">
      <div className="flex items-baseline gap-2">
        <span className="text-h4 font-bold tabular-nums text-text-primary">{backlog}</span>
        <span className="text-caption text-text-muted">runs awaiting governance</span>
      </div>
    </PanelShell>
  );
}

export function HealthBadgeInline({ status }: { status: EngineHealthView['status'] }) {
  return <HealthBadge status={status} />;
}
