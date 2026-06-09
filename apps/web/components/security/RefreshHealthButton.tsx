'use client';

// =============================================================================
// HSI Phase 14 — RefreshHealthButton. Re-probes the dependency health checks via
// runHealthChecksAction() in a transition, then refreshes the route so the
// server component re-renders with fresh data. Surfaces DbResult errors
// (AUTH_REQUIRED → sign-in, FORBIDDEN → permission). No server-only imports.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { RefreshCw, Check } from 'lucide-react';
import { runHealthChecksAction } from '@/lib/security/actions';
import { ErrorState, type DbErrorCode } from '@/components/signals/states';

export function RefreshHealthButton({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ message: string; code?: DbErrorCode } | null>(
    null,
  );

  if (demo) {
    return (
      <Button variant="ghost" size="sm" disabled title="Demo data is read-only">
        <RefreshCw className="h-4 w-4" /> Re-run health checks
      </Button>
    );
  }

  const onClick = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      try {
        // runHealthChecksAction returns HealthCheckResult[] directly (never a
        // DbResult, never throws). We just re-probe then refresh the route so the
        // server component re-renders the health panel with fresh probes.
        await runHealthChecksAction();
        setDone(true);
        router.refresh();
      } catch (e) {
        setError({ message: e instanceof Error ? e.message : String(e) });
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={onClick} disabled={pending}>
        {done ? (
          <Check className="h-4 w-4 text-verified" />
        ) : (
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
        )}
        {pending ? 'Probing…' : done ? 'Re-probed' : 'Re-run health checks'}
      </Button>
      {error ? (
        <ErrorState
          title="Health re-probe failed"
          message={error.message}
          code={error.code}
          redirectedFrom={pathname}
        />
      ) : null}
    </div>
  );
}
