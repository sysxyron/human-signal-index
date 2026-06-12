'use client';

// =============================================================================
// HSI Phase 19 — curator/admin publishing governance controls:
//   ReviewControl   — approve / reject a publication (required reason).
//   PublishControl  — publish / unpublish / archive a publication.
//   RetractControl  — retract a published report (reason + required detail).
// Each is a thin wrapper over the role-gated server actions. Demo is read-only.
// Nothing auto-publishes; every action is logged + reversible.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Check, Loader2, Send, Sparkles, Undo2, X } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import type { PublicationState, RetractionReason } from '@hsi/shared-types';

type DbResultLike = { ok: true } | { ok: false; error: string };

function Gate({ demo, canAct, what, children }: { demo: boolean; canAct: boolean; what: string; children: React.ReactNode }) {
  const pathname = usePathname();
  if (demo) {
    return <span className="inline-flex items-center gap-1.5 text-caption text-warning"><Sparkles className="h-3.5 w-3.5" /> Demo is read-only.</span>;
  }
  if (!canAct) return <SignInPrompt message={`Sign in as a curator to ${what}`} redirectedFrom={pathname} />;
  return <>{children}</>;
}

export function ReviewControl({
  publicationId, action, canAct, demo = false,
}: {
  publicationId: string;
  action: (id: string, decision: 'approved' | 'rejected', reason: string) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const decide = (decision: 'approved' | 'rejected') => {
    setError(null); setDone(null);
    if (reason.trim().length === 0) { setError('A review decision requires a reason — it is logged.'); return; }
    start(async () => {
      const res = await action(publicationId, decision, reason.trim());
      if (res.ok) { setDone(decision === 'approved' ? 'Approved.' : 'Rejected — sent back to draft.'); setReason(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="review publications">
      <div className="space-y-2">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Review reason (required, logged)…"
          className="w-full resize-none rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => decide('approved')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
          </Button>
          <Button variant="secondary" size="sm" onClick={() => decide('rejected')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
          </Button>
        </div>
        {done ? <SuccessNotice message={done} /> : null}
        {error ? <ErrorState title="Could not record the review" message={error} /> : null}
      </div>
    </Gate>
  );
}

export function PublishControl({
  publicationId, state, action, canAct, demo = false,
}: {
  publicationId: string;
  state?: PublicationState;
  action: (id: string, to: PublicationState, reason?: string) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const go = (to: PublicationState, label: string) => {
    setError(null); setDone(null);
    start(async () => {
      const res = await action(publicationId, to);
      if (res.ok) { setDone(label); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="publish reports">
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {state === 'APPROVED' ? (
            <Button variant="primary" size="sm" onClick={() => go('PUBLISHED', 'Published.')} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish
            </Button>
          ) : null}
          {state === 'DRAFT' ? (
            <Button variant="secondary" size="sm" onClick={() => go('UNDER_REVIEW', 'Sent for review.')} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for review
            </Button>
          ) : null}
          {state === 'PUBLISHED' ? (
            <Button variant="secondary" size="sm" onClick={() => go('UNDER_REVIEW', 'Unpublished.')} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Unpublish
            </Button>
          ) : null}
        </div>
        {done ? <SuccessNotice message={done} /> : null}
        {error ? <ErrorState title="Could not update the publication" message={error} /> : null}
      </div>
    </Gate>
  );
}

const RETRACTION_REASONS: { value: RetractionReason; label: string }[] = [
  { value: 'evidence_error', label: 'Evidence error' },
  { value: 'trust_collapse', label: 'Trust collapse' },
  { value: 'governance_decision', label: 'Governance decision' },
  { value: 'data_quality_issue', label: 'Data quality issue' },
  { value: 'methodology_issue', label: 'Methodology issue' },
];

export function RetractControl({
  publicationId, action, canAct, demo = false,
}: {
  publicationId: string;
  action: (id: string, reason: RetractionReason, detail: string) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<RetractionReason>('evidence_error');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const retract = () => {
    setError(null); setDone(null);
    if (detail.trim().length === 0) { setError('A retraction requires a detail — it stays visible.'); return; }
    start(async () => {
      const res = await action(publicationId, reason, detail.trim());
      if (res.ok) { setDone('Retracted — kept visible for the record.'); setDetail(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="retract reports">
      <div className="space-y-2">
        <select value={reason} onChange={(e) => setReason(e.target.value as RetractionReason)}
          className="rounded-card border border-border bg-surface px-2 py-1.5 text-caption text-text-primary focus:border-electric focus:outline-none">
          {RETRACTION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder="Retraction detail (required, stays visible)…"
          className="w-full resize-none rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <Button variant="danger" size="sm" onClick={retract} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Retract
        </Button>
        {done ? <SuccessNotice message={done} /> : null}
        {error ? <ErrorState title="Could not retract" message={error} /> : null}
      </div>
    </Gate>
  );
}
