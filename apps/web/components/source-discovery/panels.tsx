// =============================================================================
// HSI Phase 70.3 — Source discovery panels (server). Overview, candidate queues,
// signal candidates, import batches, discovery runs. Display only; review buttons
// are the client CandidateRow/SignalRow components.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Inbox, CheckCircle2, XCircle, Copy, Radio, Upload, AlertTriangle, BarChart3 } from 'lucide-react';
import type { SourceDiscoveryDashboard } from '@/lib/source-discovery/data';
import type { CandidateRecord, SignalCandidateRow, RunRow, InvalidRowRecord, RegistryStatistics } from '@/lib/source-discovery/persistence';
import { CandidateRow, SignalRow, BatchRow } from './Controls';

const n = (v: number) => v.toLocaleString('en-US');

export function DiscoveryOverview({ d }: { d: SourceDiscoveryDashboard }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Pending review" value={n(d.counts.pending)} accent="#3B82F6" icon={Inbox} />
      <MetricCard label="Duplicates" value={n(d.counts.duplicates)} accent="#F59E0B" icon={Copy} />
      <MetricCard label="Approved" value={n(d.counts.approved)} accent="#10B981" icon={CheckCircle2} />
      <MetricCard label="Rejected" value={n(d.counts.rejected)} accent="#94A3B8" icon={XCircle} />
      <MetricCard label="Signal candidates" value={n(d.counts.signals)} accent="#8B5CF6" icon={Radio} />
    </div>
  );
}

export function CandidateQueue({ title, candidates, empty }: { title: string; candidates: CandidateRecord[]; empty: string }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Inbox className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{title}</h3><span className="ml-auto text-caption text-text-muted">{candidates.length}</span></div>
      {candidates.length === 0 ? <p className="text-caption text-text-muted">{empty}</p> : <ul className="space-y-1.5">{candidates.map((c) => <CandidateRow key={c.id} c={c} />)}</ul>}
    </Card>
  );
}

export function SignalCandidateQueue({ signals }: { signals: SignalCandidateRow[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Signal candidates</h3><span className="ml-auto text-caption text-text-muted">{signals.length}</span></div>
      <p className="text-caption text-text-muted">Suggested links between real signals and narratives/watchlists. Approving records the review — it never publishes.</p>
      {signals.length === 0 ? <p className="text-caption text-text-muted">No signal candidates. Run the signal scout.</p> : <ul className="space-y-1.5">{signals.map((s) => <SignalRow key={s.id} s={s} />)}</ul>}
    </Card>
  );
}

export function BatchList({ batches, isAdmin }: { batches: SourceDiscoveryDashboard['batches']; isAdmin: boolean }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Upload className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Import batches</h3></div>
      {batches.length === 0 ? <p className="text-caption text-text-muted">No imports yet.</p> : (
        <ul className="space-y-1">{batches.map((b) => <BatchRow key={b.id} b={b} isAdmin={isAdmin} />)}</ul>
      )}
    </Card>
  );
}

const RUN_REASON: Record<string, string> = {
  NO_APPROVED_SOURCES: 'No approved sources to seed discovery.',
  NO_PUBLIC_FEEDS_FOUND: 'No public feed URLs found in evidence.',
  ALL_DUPLICATES: 'All referenced domains are already in the registry.',
  INSUFFICIENT_INPUTS: 'Insufficient inputs to suggest candidates.',
};
export function RunList({ runs }: { runs: RunRow[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Discovery runs</h3></div>
      {runs.length === 0 ? <p className="text-caption text-text-muted">No discovery runs yet.</p> : (
        <ul className="space-y-1.5">
          {runs.map((r) => (
            <li key={r.id} className="rounded-card border border-border bg-background-deep/40 px-3 py-1.5 text-caption text-text-muted">
              <div className="flex flex-wrap items-center gap-2"><span className="w-40 shrink-0">{r.startedLabel}</span><span className="text-text-secondary">{r.agentKey.replace(/_AGENT$/, '')}</span><span className={r.status === 'succeeded' ? 'text-verified' : 'text-risk'}>· {r.status}</span><span>· considered {r.considered} · {r.findingsCount} findings · {r.candidatesCreated} candidates</span></div>
              {r.candidatesCreated === 0 && r.reason ? <p className="mt-0.5 text-[11px] text-warning">{r.reason}: {RUN_REASON[r.reason] ?? 'no candidates produced.'}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function InvalidRowsPanel({ rows }: { rows: InvalidRowRecord[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /><h3 className="text-h6 font-semibold text-text-primary">Invalid rows</h3><span className="ml-auto text-caption text-text-muted">{rows.length}</span></div>
      {rows.length === 0 ? <p className="text-caption text-text-muted">No invalid rows — all imported rows validated.</p> : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={`${r.batchId}-${r.rowNumber}-${i}`} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-caption">
              <div className="flex items-center gap-2"><span className="shrink-0 text-text-muted">row {r.rowNumber}</span><span className="min-w-0 flex-1 truncate text-text-secondary">{r.sourceName || '(no name)'}</span><span className="shrink-0 truncate text-text-muted" title={r.primaryUrl || r.feedUrl}>{r.primaryUrl || r.feedUrl || '(no url)'}</span></div>
              <ul className="mt-1 space-y-0.5">{r.errors.map((e, j) => <li key={j} className="text-[11px] text-risk">• {e}</li>)}</ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RegistryStatsPanel({ stats }: { stats: RegistryStatistics }) {
  const n = (v: number) => v.toLocaleString('en-US');
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Registry statistics</h3><span className="ml-auto text-caption text-text-muted">Phase 71 readiness</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { l: 'Total sources', v: stats.totalSources }, { l: 'Active', v: stats.activeSources }, { l: 'Paused', v: stats.pausedSources },
          { l: 'Pending', v: stats.candidatesPending }, { l: 'Duplicates', v: stats.duplicatesFound }, { l: 'Invalid rows', v: stats.invalidRows },
          { l: 'With feed/API', v: stats.withFeed }, { l: 'Missing feed', v: stats.missingFeed }, { l: 'Geo-ready', v: stats.geoReady }, { l: 'Missing geo', v: stats.missingGeo },
        ].map((s) => <div key={s.l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(s.v)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{s.l}</div></div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatGroup title="By type" rows={stats.byType.map((t) => ({ label: t.type, count: t.count }))} />
        <StatGroup title="By category" rows={stats.byCategory.map((t) => ({ label: t.category, count: t.count }))} />
        <StatGroup title="By platform" rows={stats.byPlatform.map((t) => ({ label: t.platform, count: t.count }))} />
      </div>
    </Card>
  );
}

function StatGroup({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{title}</p>
      {rows.length === 0 ? <p className="text-caption text-text-muted">—</p> : <ul className="space-y-0.5">{rows.slice(0, 8).map((r) => <li key={r.label} className="flex items-center justify-between text-caption"><span className="truncate text-text-secondary">{r.label}</span><span className="tabular-nums text-text-muted">{r.count}</span></li>)}</ul>}
    </div>
  );
}
