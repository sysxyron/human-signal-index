'use client';

// =============================================================================
// HSI Phase 21 — forecasting client controls:
//   CreateScenarioControl     — curator+ open a scenario.
//   ScenarioTransitionControl — curator+ advance a scenario state (validated).
//   RecomputeAccuracyButton   — curator+ recompute forecast reliability metrics.
//   ResolveWarningControl     — curator+ acknowledge/resolve an early warning.
// Thin wrappers over the role-gated server actions. Demo is read-only. Nothing
// auto-acts / auto-escalates / auto-predicts.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Check, Eye, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import type { ScenarioState } from '@hsi/shared-types';

type DbResultLike = { ok: true } | { ok: false; error: string };

function Gate({ demo, canAct, what, children }: { demo: boolean; canAct: boolean; what: string; children: React.ReactNode }) {
  const pathname = usePathname();
  if (demo) return <span className="inline-flex items-center gap-1.5 text-caption text-warning"><Sparkles className="h-3.5 w-3.5" /> Demo is read-only.</span>;
  if (!canAct) return <SignInPrompt message={`Sign in as a curator to ${what}`} redirectedFrom={pathname} />;
  return <>{children}</>;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scenario';
}

export function CreateScenarioControl({
  action, canAct, demo = false,
}: {
  action: (input: { slug: string; title: string; description: string }) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = () => {
    setError(null); setDone(false);
    if (title.trim().length === 0) { setError('A title is required.'); return; }
    start(async () => {
      const res = await action({ slug: slugify(title), title: title.trim(), description: description.trim() });
      if (res.ok) { setDone(true); setTitle(''); setDescription(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="open a scenario">
      <div className="flex flex-wrap items-end gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scenario title…"
          className="min-w-[200px] flex-1 rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description…"
          className="min-w-[200px] flex-1 rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Open
        </Button>
      </div>
      {done ? <SuccessNotice message="Scenario opened." /> : null}
      {error ? <ErrorState title="Could not open" message={error} /> : null}
    </Gate>
  );
}

const NEXT_STATES: Record<string, ScenarioState[]> = {
  EMERGING: ['ACTIVE', 'MONITORING', 'INVALIDATED', 'ARCHIVED'],
  ACTIVE: ['MONITORING', 'CONFIRMED', 'INVALIDATED', 'ARCHIVED'],
  MONITORING: ['ACTIVE', 'CONFIRMED', 'INVALIDATED', 'ARCHIVED'],
  CONFIRMED: ['ARCHIVED', 'MONITORING'],
  INVALIDATED: ['ARCHIVED'],
  ARCHIVED: ['MONITORING'],
};

export function ScenarioTransitionControl({
  scenarioId, state, action, canAct, demo = false,
}: {
  scenarioId: string;
  state?: string;
  action: (id: string, to: ScenarioState, reason?: string) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const targets = NEXT_STATES[state ?? 'EMERGING'] ?? [];

  const go = (to: ScenarioState) => {
    setError(null); setDone(null);
    start(async () => {
      const res = await action(scenarioId, to, reason.trim() || undefined);
      if (res.ok) { setDone(`Moved to ${to}.`); setReason(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="advance a scenario">
      <div className="space-y-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, logged)…"
          className="w-full rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        <div className="flex flex-wrap items-center gap-2">
          {targets.map((to) => (
            <Button key={to} variant="secondary" size="sm" onClick={() => go(to)} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {to}
            </Button>
          ))}
        </div>
        {done ? <SuccessNotice message={done} /> : null}
        {error ? <ErrorState title="Could not advance" message={error} /> : null}
      </div>
    </Gate>
  );
}

export function RecomputeAccuracyButton({
  action, canAct, demo = false,
}: {
  action: () => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <Gate demo={demo} canAct={canAct} what="recompute forecast reliability">
      <div className="flex flex-col items-end gap-1.5">
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => {
          setError(null); setDone(false);
          start(async () => {
            const res = await action();
            if (res.ok) { setDone(true); router.refresh(); } else setError(formatErrorMessage(res.error));
          });
        }}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recompute reliability
        </Button>
        {done ? <SuccessNotice message="Forecast reliability recomputed." /> : null}
        {error ? <ErrorState title="Could not recompute" message={error} /> : null}
      </div>
    </Gate>
  );
}

export function ResolveWarningControl({
  warningId, status, action, canAct, demo = false,
}: {
  warningId: string;
  status?: string;
  action: (id: string, status: 'acknowledged' | 'resolved') => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (status === 'resolved') return <span className="text-caption text-text-muted">Resolved.</span>;
  if (demo) return <span className="inline-flex items-center gap-1.5 text-caption text-warning"><Sparkles className="h-3.5 w-3.5" /> Demo is read-only.</span>;
  if (!canAct) return null;

  const act = (next: 'acknowledged' | 'resolved') => {
    setError(null); setDone(null);
    start(async () => {
      const res = await action(warningId, next);
      if (res.ok) { setDone(next === 'resolved' ? 'Resolved.' : 'Acknowledged.'); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => act('acknowledged')} disabled={pending || status === 'acknowledged'}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Acknowledge
        </Button>
        <Button variant="primary" size="sm" onClick={() => act('resolved')} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Resolve
        </Button>
      </div>
      {done ? <SuccessNotice message={done} /> : null}
      {error ? <ErrorState title="Could not update" message={error} /> : null}
    </div>
  );
}
