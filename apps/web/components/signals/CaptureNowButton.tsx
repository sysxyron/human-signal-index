'use client';

// =============================================================================
// HSI Phase 7 — "Capture now" control. Triggers runSourceCaptureAction for a
// source in a transition. Auth-gated; surfaces DbResult error / auth / success.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Radar, Check } from 'lucide-react';
import { runSourceCaptureAction } from '@/lib/signals/actions';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from './states';

export function CaptureNowButton({
  sourceId,
  canCapture,
  demo = false,
  size = 'sm',
}: {
  sourceId: string;
  canCapture: boolean;
  demo?: boolean;
  size?: 'sm' | 'md';
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (demo) {
    return (
      <Button variant="ghost" size={size} disabled title="Demo data is read-only">
        <Radar className="h-4 w-4" /> Capture now
      </Button>
    );
  }
  if (!canCapture) {
    return (
      <SignInPrompt message="Sign in to capture" redirectedFrom={pathname} />
    );
  }

  const onClick = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await runSourceCaptureAction(sourceId);
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <Button variant="secondary" size={size} onClick={onClick} disabled={pending}>
        {done ? <Check className="h-4 w-4 text-verified" /> : <Radar className="h-4 w-4" />}
        {pending ? 'Capturing…' : done ? 'Captured' : 'Capture now'}
      </Button>
      {error ? <ErrorState title="Capture failed" message={error} /> : null}
    </div>
  );
}
