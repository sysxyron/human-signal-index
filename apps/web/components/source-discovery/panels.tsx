// =============================================================================
// HSI Phase 70.3 — Source discovery panels (server). Overview, candidate queues,
// signal candidates, import batches, discovery runs. Display only; review buttons
// are the client CandidateRow/SignalRow components.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Inbox, CheckCircle2, XCircle, Copy, Radio, Upload } from 'lucide-react';
import type { SourceDiscoveryDashboard } from '@/lib/source-discovery/data';
import type { CandidateRecord, SignalCandidateRow, BatchRow, RunRow } from '@/lib/source-discovery/persistence';
import { CandidateRow, SignalRow } from './Controls';

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

export function BatchList({ batches }: { batches: BatchRow[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Upload className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Import batches</h3></div>
      {batches.length === 0 ? <p className="text-caption text-text-muted">No imports yet.</p> : (
        <ul className="space-y-1 text-caption text-text-muted">
          {batches.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-2"><span className="w-40 shrink-0">{b.createdLabel}</span><span className="text-text-secondary">{b.filename ?? 'import.csv'}</span><span>· {b.rowCount} rows</span><span className="text-verified">· {b.validCount} valid</span>{b.invalidCount > 0 ? <span className="text-risk">· {b.invalidCount} invalid</span> : null}{b.duplicateCount > 0 ? <span className="text-warning">· {b.duplicateCount} dup</span> : null}</li>)}
        </ul>
      )}
    </Card>
  );
}

export function RunList({ runs }: { runs: RunRow[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Discovery runs</h3></div>
      {runs.length === 0 ? <p className="text-caption text-text-muted">No discovery runs yet.</p> : (
        <ul className="space-y-1 text-caption text-text-muted">
          {runs.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2"><span className="w-40 shrink-0">{r.startedLabel}</span><span className="text-text-secondary">{r.agentKey.replace(/_AGENT$/, '')}</span><span className={r.status === 'succeeded' ? 'text-verified' : 'text-risk'}>· {r.status}</span><span>· {r.findingsCount} findings · {r.candidatesCreated} candidates</span></li>)}
        </ul>
      )}
    </Card>
  );
}
