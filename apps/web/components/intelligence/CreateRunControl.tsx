'use client';

// =============================================================================
// HSI Phase 18 — CreateRunControl. Curator/admin control to start a new research
// run from a workflow template + priority. Enqueues the run (never auto-advances).
// Thin wrapper over createResearchRunAction. Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import type { ResearchPriority } from '@hsi/shared-types';

type DbResultLike = { ok: true } | { ok: false; error: string };

const TEMPLATES = [
  'historical-investigation',
  'narrative-validation',
  'evidence-verification',
  'signal-analysis',
  'trust-recovery',
  'calibration-review',
  'counterfactual-analysis',
];
const PRIORITIES: ResearchPriority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

export function CreateRunControl({
  action,
  canCreate,
  demo = false,
}: {
  action: (input: { title?: string; priority?: ResearchPriority; workflowKey?: string }) => Promise<DbResultLike>;
  canCreate: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [workflow, setWorkflow] = useState(TEMPLATES[0]);
  const [priority, setPriority] = useState<ResearchPriority>('NORMAL');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (demo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to start runs.
      </span>
    );
  }
  if (!canCreate) {
    return <SignInPrompt message="Sign in as a curator to start research runs" redirectedFrom={pathname} />;
  }

  const onClick = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await action({ title: title.trim() || undefined, priority, workflowKey: workflow });
      if (res.ok) {
        setDone(true);
        setTitle('');
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Run title (optional)…"
        className="min-w-[180px] flex-1 rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none"
      />
      <select
        value={workflow}
        onChange={(e) => setWorkflow(e.target.value)}
        className="rounded-card border border-border bg-surface px-2 py-1.5 text-caption text-text-primary focus:border-electric focus:outline-none"
      >
        {TEMPLATES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as ResearchPriority)}
        className="rounded-card border border-border bg-surface px-2 py-1.5 text-caption text-text-primary focus:border-electric focus:outline-none"
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <Button variant="primary" size="sm" onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Start run
      </Button>
      {done ? <SuccessNotice message="Research run created and queued." /> : null}
      {error ? <ErrorState title="Could not start the run" message={error} /> : null}
    </div>
  );
}
