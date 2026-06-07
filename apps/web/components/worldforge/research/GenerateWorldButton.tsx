'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Orbit, ArrowRight } from 'lucide-react';
import { generateWorldFromBlueprintAction } from '@/app/dashboard/worldforge/research/actions';
import {
  ErrorCard,
  SuccessNotice,
  SignInPrompt,
} from '@/components/worldforge/PersistenceUI';

export interface GenerateWorldButtonProps {
  runId: string;
  isAuthenticated: boolean;
  /** When true, the action is disabled with an explanation (e.g. the demo run). */
  demo?: boolean;
  /** If a world was already generated for this run, link straight to it. */
  existingWorldId?: string | null;
  className?: string;
}

/** Auth-gated CTA that turns a run's blueprint into a real WorldState. */
export function GenerateWorldButton({
  runId,
  isAuthenticated,
  demo = false,
  existingWorldId = null,
  className = '',
}: GenerateWorldButtonProps) {
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [worldId, setWorldId] = useState<string | null>(existingWorldId);
  const [pending, startTransition] = useTransition();

  if (demo) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Button variant="secondary" disabled title="The demo run is read-only">
          <Orbit className="h-4 w-4" />
          Generate world from blueprint
        </Button>
        <p className="text-caption text-text-muted">
          World generation is disabled for the labeled demo run. Start your own
          research run to generate a real, savable world.
        </p>
      </div>
    );
  }

  if (worldId) {
    return (
      <div className={`space-y-2 ${className}`}>
        <SuccessNotice message="World generated from this blueprint." />
        <Link
          href={'/dashboard/worldforge/simulations' as never}
          className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
        >
          Open in Simulations
          <span className="font-mono text-text-muted">({worldId})</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const canWrite = isAuthenticated && !authExpired;

  const onGenerate = () => {
    setError(null);
    startTransition(async () => {
      const res = await generateWorldFromBlueprintAction(runId);
      if (res.ok) {
        setWorldId(res.data.worldId);
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {error ? (
        <ErrorCard message={error} title="Could not generate world" />
      ) : null}
      {canWrite ? (
        <Button variant="primary" onClick={onGenerate} disabled={pending}>
          <Orbit className="h-4 w-4" />
          {pending ? 'Generating world…' : 'Generate world from blueprint'}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-caption text-text-secondary">
            {authExpired
              ? 'Your session expired. Sign in again to generate worlds.'
              : 'Generating a world saves it to your account.'}
          </p>
          <SignInPrompt
            message="Sign in to generate worlds"
            redirectedFrom={pathname}
          />
        </div>
      )}
    </div>
  );
}
