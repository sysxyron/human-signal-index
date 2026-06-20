'use client';

// =============================================================================
// HSI Phase 70.3 — Source discovery client controls. CSV import (admin), agent
// runs (admin), candidate review (reviewer+), signal review (reviewer+). Every
// action is human-initiated; nothing auto-activates or auto-publishes.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Upload, Compass, Radar, Check, X, AlertTriangle } from 'lucide-react';
import { uploadCsvAction, runDiscoveryAction, runSignalScoutAction, approveCandidateAction, rejectCandidateAction, requestChangesAction, reviewSignalCandidateAction } from '@/lib/source-discovery/actions';
import type { CandidateRecord, SignalCandidateRow } from '@/lib/source-discovery/persistence';

export function ImportPanel({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filename, setFilename] = useState('import.csv');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!isAdmin) return null;

  const onFile = async (file: File | undefined) => { if (!file) return; setFilename(file.name); setText(await file.text()); };
  const submit = () => start(async () => { setMsg(null); const r = await uploadCsvAction(filename, text); setMsg(r.ok ? `Imported: ${r.data.valid} valid, ${r.data.invalid} invalid, ${r.data.duplicates} duplicate(s).` : (r.error ?? 'Failed.')); if (r.ok) { setText(''); router.refresh(); } });

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Upload className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Import sources (CSV)</h3></div>
      <p className="text-caption text-text-muted">Columns: source_name, source_type, primary_url, feed_or_api_url, category, tags, … Rows are validated, classified, and de-duplicated into the review queue. No source is activated.</p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} className="block text-caption text-text-secondary" aria-label="CSV file" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="…or paste CSV here (first row = headers)" className="w-full rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="CSV text" />
      <div className="flex items-center gap-3"><Button variant="primary" disabled={pending || !text.trim()} onClick={submit}><Upload className="h-4 w-4" /> Validate &amp; stage</Button>{msg ? <span className="text-caption text-text-muted">{msg}</span> : null}</div>
    </Card>
  );
}

export function AgentRunButtons({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!isAdmin) return null;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Failed.')); if (r.ok) router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => runDiscoveryAction(), 'Discovery complete.')}><Compass className="h-4 w-4" /> Run source discovery</Button>
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => runSignalScoutAction(), 'Scout complete.')}><Radar className="h-4 w-4" /> Run signal scout</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}

const DUP_STYLE: Record<string, string> = {
  none: 'border-border bg-surface-2/50 text-text-secondary', exact_duplicate: 'border-risk/40 bg-risk/10 text-risk',
  domain_duplicate: 'border-warning/40 bg-warning/10 text-warning', feed_duplicate: 'border-warning/40 bg-warning/10 text-warning', related_source: 'border-electric/40 bg-electric/10 text-electric',
};

export function CandidateRow({ c }: { c: CandidateRecord }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const needsConfirm = c.duplicateStatus === 'domain_duplicate' || c.duplicateStatus === 'feed_duplicate' || c.duplicateStatus === 'related_source';
  const blocked = c.duplicateStatus === 'exact_duplicate';
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Failed.')); if (r.ok) router.refresh(); });

  return (
    <li className="space-y-1 rounded-card border border-border bg-background-deep/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-body-sm">
        <span className="min-w-0 flex-1 truncate font-medium text-text-primary" title={c.primaryUrl ?? ''}>{c.sourceName}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">{c.classificationCategory ?? '—'} · {c.classificationType ?? c.sourceType ?? '—'}{c.classificationConfidence != null ? ` · ${Math.round(c.classificationConfidence * 100)}%` : ''}</span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${DUP_STYLE[c.duplicateStatus] ?? DUP_STYLE.none}`}>{c.duplicateStatus.replace('_', ' ')}</span>
      </div>
      {c.duplicateReason ? <p className="text-[11px] text-text-muted">{c.duplicateReason}{c.existingSourceName ? ` (→ ${c.existingSourceName})` : ''}</p> : null}
      {c.status === 'pending_review' || c.status === 'needs_changes' ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {blocked ? <span className="inline-flex items-center gap-1 text-caption text-risk"><AlertTriangle className="h-3.5 w-3.5" /> exact duplicate — approval blocked</span> : (
            <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => approveCandidateAction(c.id, needsConfirm), needsConfirm ? 'Approved (duplicate confirmed) → paused source.' : 'Approved → paused source.')}><Check className="h-3.5 w-3.5" /> {needsConfirm ? 'Confirm & approve' : 'Approve'}</Button>
          )}
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => rejectCandidateAction(c.id, 'Rejected by reviewer'), 'Rejected.')}><X className="h-3.5 w-3.5" /> Reject</Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => requestChangesAction(c.id, 'Needs changes'), 'Marked needs-changes.')}>Needs changes</Button>
          {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
        </div>
      ) : <p className="text-[11px] text-text-muted">{c.status}</p>}
    </li>
  );
}

export function SignalRow({ s }: { s: SignalCandidateRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (decision: 'approved' | 'rejected') => start(async () => { setMsg(null); const r = await reviewSignalCandidateAction(s.id, decision); setMsg(r.ok ? `${decision}.` : (r.error ?? 'Failed.')); if (r.ok) router.refresh(); });
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
      <span className="min-w-0 flex-1 truncate text-text-secondary" title={s.reason ?? ''}>{s.title}</span>
      {s.category ? <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">{s.category}</span> : null}
      {s.confidence != null ? <span className="shrink-0 text-caption text-text-muted">{Math.round(s.confidence * 100)}%</span> : null}
      <Button variant="primary" size="sm" disabled={pending} onClick={() => run('approved')}><Check className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run('rejected')}><X className="h-3.5 w-3.5" /></Button>
      {msg ? <span className="shrink-0 text-caption text-text-muted">{msg}</span> : null}
    </li>
  );
}
