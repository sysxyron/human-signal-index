'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@hsi/ui';
import { RefreshCw, Sparkles } from 'lucide-react';
import { runEvidenceForRunAction } from '@/app/dashboard/worldforge/research/evidence-actions';
import {
  modeStyle,
  type EvidenceCoverageSummary,
} from '@/lib/worldforge/evidence-view';
import { ErrorCard, SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';

export interface RefreshEvidenceButtonProps {
  runId: string;
  isAuthenticated: boolean;
  /** Disabled with an explanation for the read-only demo run. */
  demo?: boolean;
  className?: string;
}

/**
 * Auth-gated control to fetch / refresh evidence for a run. Runs the evidence
 * engine + persistence via runEvidenceForRunAction in a transition, with full
 * loading / error / auth states. On success it shows the new coverage + mode.
 */
export function RefreshEvidenceButton({
  runId,
  isAuthenticated,
  demo = false,
  className = '',
}: RefreshEvidenceButtonProps) {
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [result, setResult] = useState<EvidenceCoverageSummary | null>(null);
  const [pending, startTransition] = useTransition();

  if (demo) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Button variant="secondary" disabled title="The demo run is read-only">
          <Sparkles className="h-4 w-4" />
          Fetch evidence
        </Button>
        <p className="text-caption text-text-muted">
          The labeled Chronid demo already shows curated demo evidence (fixtures,
          no API keys). Start your own research run to fetch and persist live
          evidence.
        </p>
      </div>
    );
  }

  const canWrite = isAuthenticated && !authExpired;

  const onRefresh = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await runEvidenceForRunAction(runId);
      if (res.ok) {
        setResult(res.data);
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else {
        setError(res.error);
      }
    });
  };

  if (result) {
    const m = modeStyle(result.mode);
    return (
      <div className={`space-y-2 ${className}`}>
        <SuccessNotice
          message={`Evidence gathered — ${Math.round(result.coverageScore)}/100 coverage across ${result.totalClaims} claims (${m.label.toLowerCase()}). Reload to view.`}
        />
        <Button variant="secondary" onClick={onRefresh} disabled={pending}>
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
          {pending ? 'Refreshing…' : 'Refresh again'}
        </Button>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {error ? <ErrorCard message={error} title="Could not fetch evidence" /> : null}
      {canWrite ? (
        <Button variant="primary" onClick={onRefresh} disabled={pending}>
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
          {pending ? 'Gathering evidence…' : 'Fetch / refresh evidence'}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-caption text-text-secondary">
            {authExpired
              ? 'Your session expired. Sign in again to fetch evidence.'
              : 'Fetching evidence saves citations to this run.'}
          </p>
          <SignInPrompt
            message="Sign in to fetch evidence"
            redirectedFrom={pathname}
          />
        </div>
      )}
    </div>
  );
}
