'use client';

import Link from 'next/link';
import { Card, Button } from '@hsi/ui';
import { AlertTriangle, SearchX, CloudOff } from 'lucide-react';
import type { DbResultCode } from '@/lib/worldforge/research-view';
import { formatErrorMessage } from '@/lib/errors/format-error';

export interface RunErrorStateProps {
  message?: unknown;
  code?: DbResultCode;
}

/** Styled error / not-found state for a run detail page — never a white screen. */
export function RunErrorState({ message, code }: RunErrorStateProps) {
  const text =
    message === null || message === undefined ? '' : formatErrorMessage(message);
  const notFound = !code && /not.?found|no rows|missing/i.test(text);
  const offline = code === 'NOT_CONFIGURED';
  const Icon = offline ? CloudOff : notFound ? SearchX : AlertTriangle;
  const title = offline
    ? 'Persistence not configured'
    : notFound
      ? 'Research run not found'
      : 'Could not load this research run';

  return (
    <main className="space-y-6 p-5 lg:p-6">
      <Card className="space-y-3 border-risk/40 bg-risk/5" padded>
        <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
          <Icon className="h-5 w-5" /> {title}
        </h3>
        <p className="text-body-sm leading-relaxed text-text-secondary">
          {text}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={'/dashboard/worldforge/research' as never}>
            <Button variant="primary">Back to research</Button>
          </Link>
          <Link href={'/dashboard/worldforge/research/demo-chronid?demo=1' as never}>
            <Button variant="secondary">View the Chronid demo</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
