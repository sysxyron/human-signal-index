'use client';

// =============================================================================
// HSI Phase 7 — per-alert actions for the Alert Center: View (link),
// Acknowledge, Escalate, and Create Research (on the alert's signal). Each
// mutation runs in a transition with inline error feedback. Auth-gated.
// =============================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Eye, Check, ArrowUpCircle, FlaskConical, ExternalLink } from 'lucide-react';
import {
  acknowledgeAlertAction,
  escalateAlertAction,
  createResearchFromSignalAction,
} from '@/lib/signals/actions';
import type { HsinSignalAlertRecord } from '@hsi/shared-types';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';

export function AlertActions({
  alert,
  canAct,
  demo = false,
}: {
  alert: HsinSignalAlertRecord;
  canAct: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [researchRunId, setResearchRunId] = useState<string | null>(null);

  const run = (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) => {
    setError(null);
    setBusy(key);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) {
        if (key === 'research') {
          const id =
            typeof res.data === 'string'
              ? res.data
              : ((res.data as { id?: string } | null)?.id ?? null);
          setResearchRunId(id);
        }
        router.refresh();
      } else {
        setError(res.error ?? 'Action failed.');
      }
    });
  };

  const isResolved = alert.status === 'resolved';
  const isEscalated = alert.status === 'escalated';

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {alert.signal_id ? (
          <Link
            href={`/dashboard/signals/${alert.signal_id}` as never}
            className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-surface-2/60 px-3 py-1.5 text-caption font-semibold text-text-secondary transition hover:border-electric hover:text-white"
          >
            <Eye className="h-3.5 w-3.5" /> View signal
          </Link>
        ) : alert.source_id ? (
          <Link
            href={`/dashboard/sources/${alert.source_id}` as never}
            className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-surface-2/60 px-3 py-1.5 text-caption font-semibold text-text-secondary transition hover:border-electric hover:text-white"
          >
            <Eye className="h-3.5 w-3.5" /> View source
          </Link>
        ) : null}

        {demo ? (
          <span className="text-caption text-text-muted">Read-only (demo)</span>
        ) : !canAct ? (
          <SignInPrompt message="Sign in to act" redirectedFrom={pathname} />
        ) : (
          <>
            {!isResolved ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  run('ack', () => acknowledgeAlertAction(alert.id))
                }
                disabled={pending}
              >
                <Check className="h-3.5 w-3.5" />
                {busy === 'ack' ? 'Acknowledging…' : 'Acknowledge'}
              </Button>
            ) : null}
            {!isEscalated && !isResolved ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => run('esc', () => escalateAlertAction(alert.id))}
                disabled={pending}
              >
                <ArrowUpCircle className="h-3.5 w-3.5" />
                {busy === 'esc' ? 'Escalating…' : 'Escalate'}
              </Button>
            ) : null}
            {alert.signal_id ? (
              researchRunId ? (
                <Link
                  href={`/dashboard/worldforge/research/${researchRunId}` as never}
                  className="inline-flex items-center gap-1.5 rounded-btn border border-verified/50 bg-verified/10 px-3 py-1.5 text-caption font-semibold text-verified transition hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open research
                </Link>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    run('research', () =>
                      createResearchFromSignalAction(alert.signal_id as string),
                    )
                  }
                  disabled={pending}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  {busy === 'research' ? 'Creating…' : 'Create research'}
                </Button>
              )
            ) : null}
          </>
        )}
      </div>
      {error ? <p className="text-caption text-risk">{error}</p> : null}
    </div>
  );
}
