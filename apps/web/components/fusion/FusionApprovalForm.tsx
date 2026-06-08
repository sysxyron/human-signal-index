'use client';

// =============================================================================
// HSI Phase 9 — FusionApprovalForm. The researcher edits the fusion title +
// prompt draft, then Approves → approveWorldforgeFusionAction({signalId, linkId,
// title, promptDraft}). On success the action returns the created research run id
// (string or {researchRunId}/{id}) and we link to /dashboard/worldforge/research/
// [runId]. Approving is the explicit human gate — nothing auto-publishes.
// useTransition; loading / error / success. Demo + permission gated.
// =============================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@hsi/ui';
import { CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import type { WorldforgeFusionDraft } from '@hsi/shared-types';
import { approveWorldforgeFusionAction } from '@/lib/operations/actions';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

function extractRunId(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const d = data as { researchRunId?: string; research_run_id?: string; runId?: string; id?: string };
    return d.researchRunId ?? d.research_run_id ?? d.runId ?? d.id ?? null;
  }
  return null;
}

export function FusionApprovalForm({
  draft,
  linkId,
  canApprove,
  demo = false,
}: {
  draft: WorldforgeFusionDraft;
  linkId?: string;
  canApprove: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const [title, setTitle] = useState(draft.title);
  const [promptDraft, setPromptDraft] = useState(draft.promptDraft);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const inputCls =
    'w-full rounded-btn border border-border bg-surface/90 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-electric';

  const editor = (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="block text-label text-text-secondary">Research title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          disabled={demo || approved}
          placeholder="A neutral, falsifiable research question"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="block text-label text-text-secondary">Prompt draft</span>
        <textarea
          value={promptDraft}
          onChange={(e) => setPromptDraft(e.target.value)}
          rows={7}
          className={`${inputCls} resize-y font-mono text-[13px] leading-relaxed`}
          disabled={demo || approved}
          placeholder="Decompose the claim into testable drivers, ground each in cited evidence…"
        />
      </label>
    </div>
  );

  if (demo) {
    return (
      <div className="space-y-3">
        {editor}
        <Button variant="primary" disabled title="Demo data is read-only — connect Supabase to approve">
          <CheckCircle2 className="h-4 w-4" /> Approve &amp; create research run
        </Button>
        <p className="text-caption text-warning">Demo is read-only — connect Supabase to approve fusions.</p>
      </div>
    );
  }

  if (runId || approved) {
    return (
      <div className="space-y-3">
        {editor}
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-2 rounded-btn border border-verified/40 bg-verified/10 px-3 py-2 text-caption font-semibold text-verified">
            <CheckCircle2 className="h-4 w-4" /> Fusion approved — research run created
          </span>
          {runId ? (
            <Link
              href={`/dashboard/worldforge/research/${runId}` as never}
              className="inline-flex w-fit items-center gap-2 rounded-btn border border-electric/40 bg-electric/10 px-3.5 py-2 text-caption font-semibold text-electric transition hover:border-electric hover:text-white"
            >
              Open research run <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <p className="text-caption text-text-muted">
              The run was created. Open the WorldForge research list to find it.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!canApprove) {
    return (
      <div className="space-y-3">
        {editor}
        <SignInPrompt
          message="Sign in as a researcher to approve this fusion"
          redirectedFrom={pathname}
        />
      </div>
    );
  }

  const onApprove = () => {
    setError(null);
    startTransition(async () => {
      const res = await approveWorldforgeFusionAction({
        linkId,
        signalId: draft.signalId,
        title: title.trim(),
        promptDraft: promptDraft.trim(),
      });
      if (res.ok) {
        setApproved(true);
        setRunId(extractRunId(res.data));
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  const disabled = pending || title.trim().length === 0 || promptDraft.trim().length === 0;

  return (
    <div className="space-y-3">
      {editor}
      <Button variant="primary" onClick={onApprove} disabled={disabled}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {pending ? 'Approving…' : 'Approve & create research run'}
      </Button>
      <p className="text-caption text-text-muted">
        Approving is the explicit human gate. It creates a WorldForge research run from this
        prompt — it does not publish anything.
      </p>
      {error ? <ErrorState title="Could not approve fusion" message={error} /> : null}
    </div>
  );
}
