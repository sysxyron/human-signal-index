// =============================================================================
// HSI Phase 65 — Narrative panels (server). Dashboard overview + executive lists
// + alert feed; detail health/timeline/members/relationships. All values computed.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import {
  Layers, Sparkles, Crown, TrendingDown, Activity, ShieldAlert, GitFork,
  Network, ShieldCheck, XOctagon, Clock, ArrowRight,
} from 'lucide-react';
import type { NarrativeDashboard, NarrativeListItem } from '@/lib/narrative-intelligence/data';
import type { AlertFeedRow } from '@/lib/narrative-intelligence/persistence';
import type {
  Narrative, NarrativeStatus, MemberComposition, NarrativeHealth, NarrativeMember,
  NarrativeTimeline, NarrativeRelationship,
} from '@/lib/narrative-intelligence/types';

const n = (v: number) => v.toLocaleString('en-US');
const href = (id: string) => `/dashboard/narratives/${id}`;

const STATUS_STYLE: Record<NarrativeStatus, string> = {
  emerging: 'border-electric/40 bg-electric/10 text-electric',
  active: 'border-verified/40 bg-verified/10 text-verified',
  dominant: 'border-warning/40 bg-warning/10 text-warning',
  fragmenting: 'border-risk/40 bg-risk/10 text-risk',
  declining: 'border-border bg-surface-2/50 text-text-secondary',
  archived: 'border-border bg-surface-2/40 text-text-muted',
};
export function StatusBadge({ status }: { status: NarrativeStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[status]}`}>{status}</span>;
}

const SEV_STYLE: Record<string, string> = {
  INFO: 'border-border bg-surface-2/50 text-text-secondary', NOTICE: 'border-electric/40 bg-electric/10 text-electric',
  WARNING: 'border-warning/40 bg-warning/10 text-warning', CRITICAL: 'border-risk/40 bg-risk/10 text-risk',
};

export function NarrativeOverview({ d }: { d: NarrativeDashboard }) {
  const s = (k: string) => d.byStatus[k] ?? 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Narratives" value={n(d.total)} accent="#3B82F6" icon={Layers} />
      <MetricCard label="Emerging" value={n(s('emerging'))} accent="#0EA5E9" icon={Sparkles} />
      <MetricCard label="Dominant" value={n(s('dominant'))} accent="#F59E0B" icon={Crown} />
      <MetricCard label="Declining" value={n(s('declining'))} accent="#94A3B8" icon={TrendingDown} />
      <MetricCard label="Active" value={n(s('active'))} accent="#10B981" icon={Activity} />
      <MetricCard label="Fragmenting" value={n(s('fragmenting'))} accent="#EF4444" icon={GitFork} />
    </div>
  );
}

function ItemList({ title, rows, metric }: { title: string; rows: NarrativeListItem[]; metric: (i: NarrativeListItem) => string }) {
  return (
    <div className="space-y-2">
      <h4 className="text-body-sm font-semibold text-text-primary">{title}</h4>
      {rows.length === 0 ? <p className="text-caption text-text-muted">None yet.</p> : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.narrative.id} className="flex items-center gap-2 text-body-sm">
              <span className="w-4 shrink-0 text-caption font-semibold tabular-nums text-text-muted">{i + 1}</span>
              <a href={href(r.narrative.id)} className="min-w-0 flex-1 truncate text-electric hover:underline">{r.narrative.name}</a>
              <span className="shrink-0 text-caption text-text-muted">{metric(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ExecutiveNarrativeMetrics({ d }: { d: NarrativeDashboard }) {
  const e = d.executive;
  return (
    <Card className="space-y-5 border-electric/30">
      <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Executive intelligence</h3></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ItemList title="Top narratives" rows={e.topNarratives} metric={(i) => `${i.members} members`} />
        <ItemList title="Fastest growing" rows={e.fastestGrowing} metric={(i) => `+${Math.round(i.growth * 100)}%`} />
        <ItemList title="Most stable" rows={e.mostStable} metric={(i) => `${i.stability}`} />
        <ItemList title="Most contested" rows={e.mostContested} metric={(i) => `${Math.round(i.contradiction * 100)}%`} />
        <ItemList title="Most fragmented" rows={e.mostFragmented} metric={(i) => `${Math.round(i.contradiction * 100)}%`} />
        <ItemList title="Largest evidence base" rows={e.largestEvidenceBase} metric={(i) => `${i.members} members`} />
      </div>
    </Card>
  );
}

export function RecentNarratives({ d }: { d: NarrativeDashboard }) {
  const NameList = ({ title, rows }: { title: string; rows: Narrative[] }) => (
    <Card className="space-y-3">
      <h3 className="text-h6 font-semibold text-text-primary">{title}</h3>
      {rows.length === 0 ? <p className="text-caption text-text-muted">None yet.</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-body-sm">
              <a href={href(r.id)} className="min-w-0 flex-1 truncate text-electric hover:underline">{r.name}</a>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <NameList title="Recently created" rows={d.recentlyCreated} />
      <NameList title="Recently changed" rows={d.recentlyChanged} />
    </div>
  );
}

export function NarrativeAlertFeed({ alerts }: { alerts: AlertFeedRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Narrative alerts</h3><span className="ml-auto text-caption text-text-muted">{n(alerts.length)} recent</span></div>
      {alerts.length === 0 ? <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No narrative alerts yet.</p> : (
        <ul className="space-y-1.5">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEV_STYLE[a.severity] ?? SEV_STYLE.INFO}`}>{a.severity}</span>
              <a href={href(a.narrativeId)} className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted hover:text-electric">{a.alertType.replace('NARRATIVE_', '')}</a>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{a.reason}</span>
              {a.notificationId ? <span className="shrink-0 text-caption text-verified" title="notification sent">✓</span> : null}
              <span className="shrink-0 text-caption text-text-muted">{a.createdLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NarrativeList({ items }: { items: NarrativeListItem[] }) {
  return (
    <Card className="space-y-3">
      <h3 className="text-h6 font-semibold text-text-primary">All narratives</h3>
      {items.length === 0 ? <p className="text-caption text-text-muted">No narratives yet. Seed one from an Evidence Graph node.</p> : (
        <ul className="space-y-1.5">
          {items.map((r) => (
            <li key={r.narrative.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
              <a href={href(r.narrative.id)} className="min-w-0 flex-1 truncate text-electric hover:underline">{r.narrative.name}</a>
              <span className="shrink-0 text-caption text-text-muted">{r.members} members</span>
              <span className="shrink-0 text-caption text-text-muted">stab {r.stability}</span>
              <StatusBadge status={r.narrative.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- detail ----------------------------------------------------------------

export function NarrativeHealthPanel({ composition, health }: { composition: MemberComposition; health: NarrativeHealth }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Network className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Narrative health</h3><span className="ml-auto text-h6 font-bold tabular-nums text-text-primary">{health.stabilityScore}<span className="text-caption font-normal text-text-muted">/100</span></span></div>
      <p className="text-caption text-text-muted">{health.explanation}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Members" value={composition.total} />
        <Stat label="Sources" value={composition.distinctSources} />
        <Stat label="Evidence" value={composition.evidence} />
        <Stat label="Supporting" value={composition.supporting} tone="text-verified" />
        <Stat label="Contradicting" value={composition.contradicting} tone="text-risk" />
        <Stat label="Failing src" value={health.failingSources} tone="text-warning" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {health.factors.map((f) => (
          <div key={f.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-text-muted">{f.label}</div>
            <div className="text-body-sm font-semibold text-text-primary">{f.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function NarrativeTimelinePanel({ timeline }: { timeline: NarrativeTimeline }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Timeline</h3><span className="ml-auto text-caption font-semibold capitalize text-text-secondary">{timeline.phase}</span></div>
      {timeline.points.length === 0 ? <p className="text-caption text-text-muted">No snapshots yet — recompute to start the timeline.</p> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <KV label="First seen" value={fmt(timeline.firstAppearance)} />
            <KV label="Peak members" value={String(timeline.peakMembers)} />
            <KV label="Latest" value={fmt(timeline.latestActivity)} />
          </div>
          <ul className="space-y-1">
            {timeline.points.slice(-12).map((p) => (
              <li key={p.at} className="flex items-center gap-2 text-caption">
                <span className="w-24 shrink-0 text-text-muted">{fmt(p.at)}</span>
                <span className="text-text-secondary">{p.members} members</span>
                <span className="text-text-muted">· {p.signals} sig · {p.evidence} ev · {p.sources} src</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function NarrativeMembersPanel({ members }: { members: NarrativeMember[] }) {
  const groups = new Map<string, NarrativeMember[]>();
  for (const m of members) (groups.get(m.memberType) ?? groups.set(m.memberType, []).get(m.memberType)!).push(m);
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Connected members</h3><span className="ml-auto text-caption text-text-muted">{members.length}</span></div>
      {members.length === 0 ? <p className="text-caption text-text-muted">No members — recompute this narrative.</p> : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([type, rows]) => (
            <div key={type} className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">{type} ({rows.length})</p>
              <ul className="space-y-1">
                {rows.slice(0, 25).map((m) => (
                  <li key={m.nodeId} className="flex items-center gap-2 text-caption">
                    {m.stance === 'supporting' ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-verified" /> : m.stance === 'contradicting' ? <XOctagon className="h-3.5 w-3.5 shrink-0 text-risk" /> : <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
                    <span className="min-w-0 flex-1 truncate text-text-secondary" title={m.reason}>{m.label}</span>
                    <span className="shrink-0 text-text-muted">{Math.round(m.confidence * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function NarrativeRelationshipsPanel({ relationships }: { relationships: NarrativeRelationship[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><GitFork className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Related narratives</h3></div>
      {relationships.length === 0 ? <p className="text-caption text-text-muted">No overlapping narratives.</p> : (
        <ul className="space-y-1.5">
          {relationships.map((r) => (
            <li key={r.narrativeId} className="flex items-center gap-2 text-body-sm">
              <a href={href(r.narrativeId)} className="min-w-0 flex-1 truncate text-electric hover:underline">{r.name}</a>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{r.relationship.replace('_', ' ')}</span>
              <span className="shrink-0 text-caption text-text-muted">{r.sharedCount} shared</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value, tone = 'text-text-primary' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className={`text-h6 font-bold tabular-nums ${tone}`}>{value.toLocaleString('en-US')}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
function KV({ label, value }: { label: string; value: string }) {
  return <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div><div className="text-body-sm font-semibold text-text-primary">{value}</div></div>;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; }
