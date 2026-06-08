'use client';

// =============================================================================
// HSI Phase 8 — RebuildGraphButton. Researcher+ rebuilds the narrative/entity
// graph from recent signals via buildNarrativeGraphAction. The result is DRAFT
// research structure for human review — nothing is published. Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { RefreshCw, Loader2 } from 'lucide-react';
import { buildNarrativeGraphAction } from '@/lib/operations/actions';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';

export function RebuildGraphButton({
  canBuild,
  demo = false,
}: {
  canBuild: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const rebuild = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await buildNarrativeGraphAction();
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  if (demo) {
    return (
      <span className="text-caption text-warning">
        Demo graph is read-only — connect Supabase to rebuild.
      </span>
    );
  }

  if (!canBuild) {
    return (
      <SignInPrompt
        message="Sign in as a researcher to rebuild the graph"
        redirectedFrom={pathname}
      />
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="primary" size="sm" onClick={rebuild} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {pending ? 'Rebuilding…' : 'Rebuild graph'}
      </Button>
      {done ? <SuccessNotice message="Graph rebuilt from recent signals." /> : null}
      {error ? <ErrorState title="Could not rebuild graph" message={error} /> : null}
    </div>
  );
}
