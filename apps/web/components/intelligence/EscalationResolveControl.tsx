'use client';

// =============================================================================
// HSI Phase 18 — EscalationResolveControl. The curator/admin governance action for
// an OPEN escalation: ACKNOWLEDGE or RESOLVE (resolution note required to resolve).
// Escalations are never auto-resolved. Thin wrapper over resolveEscalationAction.
// Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Check, Eye, Loader2, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function EscalationResolveControl({
  escalationId,
  status,
  action,
  canResolve,
  demo = false,
}: {
  escalationId: string;
  status?: string;
  action: (id: string, status: 'acknowledged' | 'resolved', resolution: string) => Promise<DbResultLike>;
  canResolve: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (status === 'resolved') {
    return <span className="text-caption text-text-muted">Resolved.</span>;
  }
  if (demo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only.
      </span>
    );
  }
  if (!canResolve) {
    return <SignInPrompt message="Sign in as a curator to resolve escalations" redirectedFrom={pathname} />;
  }

  const act = (next: 'acknowledged' | 'resolved') => {
    setError(null);
    setDone(null);
    if (next === 'resolved' && note.trim().length === 0) {
      setError('Resolving requires a non-blank resolution note — it is logged.');
      return;
    }
    startTransition(async () => {
      const res = await action(escalationId, next, note.trim());
      if (res.ok) {
        setDone(next === 'resolved' ? 'Resolved and audited.' : 'Acknowledged.');
        setNote('');
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <div className="space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (required to resolve)…"
        className="w-full rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => act('acknowledged')} disabled={pending || status === 'acknowledged'}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Acknowledge
        </Button>
        <Button variant="primary" size="sm" onClick={() => act('resolved')} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Resolve
        </Button>
      </div>
      {done ? <SuccessNotice message={done} /> : null}
      {error ? <ErrorState title="Could not update the escalation" message={error} /> : null}
    </div>
  );
}
