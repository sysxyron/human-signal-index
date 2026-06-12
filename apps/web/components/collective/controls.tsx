'use client';

// =============================================================================
// HSI Phase 20 — collective-intelligence client controls:
//   CreateInvestigationControl — researcher+ start an investigation.
//   SubmitFindingControl       — researcher+ submit a finding (position + summary).
//   SubmitChallengeControl     — researcher+ challenge a finding (required reason).
//   RecomputeConsensusButton   — curator+ recompute the consensus snapshot.
//   GovernanceDecisionPanel    — reviewer/curator approve/reject/escalate/archive a
//                                forming consensus (required reason). NEVER auto-acts.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Check, Loader2, Plus, RefreshCw, Send, Sparkles, Swords, X, ArrowUpRight, Archive } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import type { ConsensusDecision } from '@hsi/shared-types';

type DbResultLike = { ok: true } | { ok: false; error: string };

function Gate({ demo, canAct, what, children }: { demo: boolean; canAct: boolean; what: string; children: React.ReactNode }) {
  const pathname = usePathname();
  if (demo) return <span className="inline-flex items-center gap-1.5 text-caption text-warning"><Sparkles className="h-3.5 w-3.5" /> Demo is read-only.</span>;
  if (!canAct) return <SignInPrompt message={`Sign in to ${what}`} redirectedFrom={pathname} />;
  return <>{children}</>;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'investigation';
}

export function CreateInvestigationControl({
  action, canAct, demo = false,
}: {
  action: (input: { slug: string; title: string; question: string }) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () => {
    setError(null); setDone(false);
    if (title.trim().length === 0) { setError('A title is required.'); return; }
    start(async () => {
      const res = await action({ slug: slugify(title), title: title.trim(), question: question.trim() });
      if (res.ok) { setDone(true); setTitle(''); setQuestion(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="start an investigation (researcher+)">
      <div className="flex flex-wrap items-end gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Investigation title…"
          className="min-w-[200px] flex-1 rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Research question…"
          className="min-w-[200px] flex-1 rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Start
        </Button>
      </div>
      {done ? <SuccessNotice message="Investigation created." /> : null}
      {error ? <ErrorState title="Could not create" message={error} /> : null}
    </Gate>
  );
}

export function SubmitFindingControl({
  investigationId, action, canAct, demo = false,
}: {
  investigationId: string;
  action: (input: { investigationId: string; position: string; summary: string; confidence?: number }) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [position, setPosition] = useState('');
  const [summary, setSummary] = useState('');
  const [confidence, setConfidence] = useState(70);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () => {
    setError(null); setDone(false);
    if (position.trim().length === 0 || summary.trim().length === 0) { setError('Position and summary are required.'); return; }
    start(async () => {
      const res = await action({ investigationId, position: position.trim(), summary: summary.trim(), confidence: confidence / 100 });
      if (res.ok) { setDone(true); setPosition(''); setSummary(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="submit a finding (researcher+)">
      <div className="space-y-2">
        <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position / conclusion…"
          className="w-full rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Finding summary…"
          className="w-full resize-none rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-text-muted">Confidence {confidence}%</label>
          <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="flex-1" />
          <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
          </Button>
        </div>
      </div>
      {done ? <SuccessNotice message="Finding submitted." /> : null}
      {error ? <ErrorState title="Could not submit" message={error} /> : null}
    </Gate>
  );
}

export function SubmitChallengeControl({
  investigationId, findings, action, canAct, demo = false,
}: {
  investigationId: string;
  findings: { id: string; position?: string }[];
  action: (input: { investigationId: string; targetFindingId: string; reason: string }) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState(findings[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (findings.length === 0) return null;

  const submit = () => {
    setError(null); setDone(false);
    if (reason.trim().length === 0) { setError('A challenge requires a reason.'); return; }
    start(async () => {
      const res = await action({ investigationId, targetFindingId: target, reason: reason.trim() });
      if (res.ok) { setDone(true); setReason(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="challenge a finding (researcher+)">
      <div className="space-y-2">
        <select value={target} onChange={(e) => setTarget(e.target.value)}
          className="w-full rounded-card border border-border bg-surface px-2 py-1.5 text-caption text-text-primary focus:border-electric focus:outline-none">
          {findings.map((f) => <option key={f.id} value={f.id}>{f.position ?? f.id}</option>)}
        </select>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why do you challenge this finding?"
          className="w-full resize-none rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <Button variant="secondary" size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />} Challenge
        </Button>
      </div>
      {done ? <SuccessNotice message="Challenge raised." /> : null}
      {error ? <ErrorState title="Could not challenge" message={error} /> : null}
    </Gate>
  );
}

export function RecomputeConsensusButton({
  investigationId, action, canAct, demo = false,
}: {
  investigationId: string;
  action: (id: string) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <Gate demo={demo} canAct={canAct} what="recompute consensus (curator+)">
      <div className="flex flex-col items-end gap-1.5">
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => {
          setError(null); setDone(false);
          start(async () => {
            const res = await action(investigationId);
            if (res.ok) { setDone(true); router.refresh(); } else setError(formatErrorMessage(res.error));
          });
        }}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recompute consensus
        </Button>
        {done ? <SuccessNotice message="Consensus snapshot recomputed." /> : null}
        {error ? <ErrorState title="Could not recompute" message={error} /> : null}
      </div>
    </Gate>
  );
}

export function GovernanceDecisionPanel({
  investigationId, action, canAct, demo = false,
}: {
  investigationId: string;
  action: (id: string, decision: ConsensusDecision, reason: string) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const decide = (decision: ConsensusDecision, label: string) => {
    setError(null); setDone(null);
    if (reason.trim().length === 0) { setError('A governance decision requires a reason — it is logged.'); return; }
    start(async () => {
      const res = await action(investigationId, decision, reason.trim());
      if (res.ok) { setDone(label); setReason(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="decide consensus (reviewer/curator)">
      <div className="space-y-2">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Decision reason (required, logged)…"
          className="w-full resize-none rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => decide('approved', 'Approved — consensus forming.')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
          </Button>
          <Button variant="secondary" size="sm" onClick={() => decide('rejected', 'Rejected — sent back.')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
          </Button>
          <Button variant="secondary" size="sm" onClick={() => decide('escalated', 'Escalated.')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />} Escalate
          </Button>
          <Button variant="secondary" size="sm" onClick={() => decide('archived', 'Archived.')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Archive
          </Button>
        </div>
        {done ? <SuccessNotice message={done} /> : null}
        {error ? <ErrorState title="Could not record the decision" message={error} /> : null}
      </div>
    </Gate>
  );
}
