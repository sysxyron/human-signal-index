// =============================================================================
// HSI Phase 50 — Beta Operations Center panels (server-rendered, read-only).
// Public-safe aggregates only (no PII). Honest "—" for metrics not yet collected.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import {
  Users, UserCheck, UserPlus, Microscope, ShieldCheck, Crown, Activity, Radio, FileCheck2,
  ClipboardCheck, Database, Gauge, TrendingUp, AlertTriangle, MessageSquare, Layers, Clock,
} from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type {
  BetaOverview, BetaHealth, BetaActivity, BetaEngagement, BetaWorkload, BetaAdoption, BetaRisk, BetaFeedback, BetaSummary,
} from '@/lib/beta-operations';

const n = (v: number) => v.toLocaleString('en-US');
const TONE: Record<string, string> = { green: '#10B981', amber: '#F59E0B', red: '#EF4444' };
const SEV: Record<string, string> = { low: '#3B82F6', medium: '#F59E0B', high: '#EF4444' };

export function ExecutiveSummaryPanel({ summary }: { summary: BetaSummary }) {
  const dot = TONE[summary.readinessTone];
  const items = [
    { label: 'Health', value: summary.health },
    { label: 'Growth', value: summary.growth },
    { label: 'Participation', value: summary.participation },
    { label: 'Trust', value: summary.trust },
    { label: 'Risk', value: summary.risk },
    { label: 'Readiness', value: summary.readiness },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-electric" />
        <h2 className="text-h6 font-semibold text-text-primary">Executive summary</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${dot}1f`, color: dot }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />{summary.readiness}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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

export function BetaOverviewPanel({ overview }: { overview: BetaOverview }) {
  const max = Math.max(1, ...overview.roleDistribution.map((r) => r.count));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total users" value={n(overview.totalUsers)} accent="#3B82F6" icon={Users} />
        <MetricCard label="Active users" value={n(overview.activeUsers)} accent="#10B981" icon={UserCheck} />
        <MetricCard label="New this week" value={n(overview.newThisWeek)} accent="#F59E0B" icon={UserPlus} />
        <MetricCard label="Researchers" value={n(overview.researchers)} accent="#8B5CF6" icon={Microscope} />
        <MetricCard label="Reviewers" value={n(overview.reviewers)} accent="#06B6D4" icon={ShieldCheck} />
        <MetricCard label="Contributors" value={n(overview.contributors)} accent="#3B82F6" icon={Users} />
        <MetricCard label="Admins" value={n(overview.admins)} accent="#EF4444" icon={Crown} />
      </div>
      <Card className="space-y-3">
        <h3 className="text-h6 font-semibold text-text-primary">Role distribution</h3>
        {overview.roleDistribution.length === 0 ? (
          <p className="text-caption text-text-muted">No role assignments yet.</p>
        ) : (
          <ul className="space-y-2">
            {overview.roleDistribution.map((r) => (
              <li key={r.role} className="space-y-1">
                <div className="flex items-center justify-between text-caption">
                  <span className="font-medium text-text-secondary">{r.role}</span>
                  <span className="font-semibold tabular-nums text-text-primary">{n(r.count)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-electric" style={{ width: `${Math.round((r.count / max) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <span className="text-caption text-text-muted">—</span>;
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-8 items-end gap-0.5">
      {data.map((v, i) => <div key={i} className="w-1.5 rounded-t" style={{ height: `${Math.max(8, (v / max) * 100)}%`, backgroundColor: color, opacity: 0.8 }} />)}
    </div>
  );
}

export function PlatformHealthPanel({ health }: { health: BetaHealth }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Platform health</h3><span className="ml-auto text-caption text-text-muted">recent trend</span></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <HealthStat icon={Radio} label="Signals submitted" value={n(health.signalsSubmitted)} color="#3B82F6" />
        <HealthStat icon={FileCheck2} label="Signals published" value={n(health.signalsPublished)} color="#06B6D4" />
        <HealthStat icon={FileCheck2} label="Reports published" value={n(health.reportsPublished)} color="#10B981" />
        <HealthStat icon={ClipboardCheck} label="Reviews completed" value={n(health.reviewsCompleted)} color="#F59E0B" />
        <HealthStat icon={Database} label="Sources active" value={n(health.sourcesActive)} color="#8B5CF6" />
        <HealthStat icon={ShieldCheck} label="Traceability" value={`${health.traceability.toFixed(1)}%`} color="#10B981" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-background-deep/40 p-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Signals over time</div>
          <Spark data={health.trendSignals} color="#3B82F6" />
        </div>
        <div className="rounded-card border border-border bg-background-deep/40 p-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Publications over time</div>
          <Spark data={health.trendPublications} color="#10B981" />
        </div>
      </div>
    </Card>
  );
}

function HealthStat({ icon: Icon, label, value, color }: { icon: typeof Radio; label: string; value: string; color: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
      <div className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" style={{ color }} /><span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span></div>
      <div className="mt-0.5 text-h6 font-bold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}

export function UserActivityPanel({ activity, engagement }: { activity: BetaActivity; engagement: BetaEngagement }) {
  const fmt = (v: number | null) => (v == null ? '—' : n(v));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Users className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">User activity & engagement</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Recent submissions" value={n(activity.recentSubmissions)} />
        <Cell label="Recent publications" value={n(activity.recentPublications)} />
        <Cell label="Recent reviews" value={n(activity.recentReviews)} />
        <Cell label="Recent logins" value={fmt(activity.recentLogins)} />
        <Cell label="DAU" value={fmt(engagement.dau)} />
        <Cell label="WAU" value={fmt(engagement.wau)} />
        <Cell label="Participation" value={`${engagement.participationRate}%`} />
        <Cell label="Contribution" value={`${engagement.contributionRate}%`} />
      </div>
      <p className="text-[11px] text-text-muted">Aggregate only — no individual identities. Login / DAU / WAU / retention require session analytics (not yet wired); shown as “—”.</p>
    </Card>
  );
}

export function WorkloadHealthPanel({ workload }: { workload: BetaWorkload }) {
  const pressureColor = workload.queuePressure === 'High' ? '#EF4444' : workload.queuePressure === 'Medium' ? '#F59E0B' : '#10B981';
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Workload health</h3>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${pressureColor}1f`, color: pressureColor }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pressureColor }} />{workload.queuePressure} pressure
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Review backlog" value={n(workload.reviewBacklog)} />
        <Cell label="Open investigations" value={n(workload.openInvestigations)} />
        <Cell label="Pending publication" value={n(workload.pendingPublication)} />
        <Cell label="Avg turnaround" value={workload.avgTurnaround} />
      </div>
    </Card>
  );
}

export function AdoptionDashboard({ adoption }: { adoption: BetaAdoption }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Adoption</h3></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">Most active roles</h4>
          {adoption.mostActiveRoles.length === 0 ? <p className="text-caption text-text-muted">No data yet.</p> : (
            <ol className="space-y-1.5">
              {adoption.mostActiveRoles.map((r, i) => (
                <li key={r.role} className="flex items-center gap-2 text-body-sm"><span className="w-4 text-caption font-semibold tabular-nums text-text-muted">{i + 1}</span><span className="flex-1 text-text-secondary">{r.role}</span><span className="text-caption text-text-muted">{n(r.count)}</span></li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">Most active categories</h4>
          {adoption.mostActiveCategories.length === 0 ? <p className="text-caption text-text-muted">No data yet.</p> : (
            <ol className="space-y-1.5">
              {adoption.mostActiveCategories.map((c) => (
                <li key={c.category} className="flex items-center gap-2 text-body-sm"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForBucket(c.category) }} /><span className="flex-1 text-text-secondary">{c.category}</span><span className="text-caption text-text-muted">{n(c.count)}</span></li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {!adoption.pageAnalyticsAvailable ? (
        <div className="flex items-center gap-2 rounded-card border border-dashed border-border/70 bg-background-deep/30 px-3 py-2 text-[11px] text-text-muted">
          <Layers className="h-3.5 w-3.5" /> Most/least-used page analytics require client telemetry (not yet wired). Role &amp; category adoption shown above are live.
        </div>
      ) : null}
    </Card>
  );
}

export function PlatformRisksPanel({ risks }: { risks: BetaRisk[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Platform risks</h3></div>
      {risks.length === 0 ? (
        <p className="rounded-card border border-verified/30 bg-verified/10 px-4 py-6 text-center text-caption text-verified">All clear — no platform risks flagged.</p>
      ) : (
        <ul className="space-y-2">
          {risks.map((r) => (
            <li key={r.label} className="flex items-start gap-2.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV[r.severity] }} />
              <div className="min-w-0">
                <div className="text-body-sm font-medium text-text-primary">{r.label}</div>
                <div className="text-caption text-text-muted">{r.detail}</div>
              </div>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide" style={{ color: SEV[r.severity] }}>{r.severity}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FeedbackCenter({ feedback }: { feedback: BetaFeedback }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Feedback center</h3></div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Total" value={n(feedback.total)} />
        <Cell label="Open" value={n(feedback.open)} />
        <Cell label="Resolved" value={n(feedback.resolved)} />
      </div>
      <div className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center">
        <p className="text-body-sm font-medium text-text-secondary">Beta feedback intake is coming soon.</p>
        <p className="mt-1 text-caption text-text-muted">This read-only placeholder reserves the architecture; structured tester feedback will surface here. No write actions are exposed.</p>
      </div>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className="text-h6 font-bold tabular-nums text-text-primary">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
