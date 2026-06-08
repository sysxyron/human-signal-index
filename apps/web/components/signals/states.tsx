// =============================================================================
// HSI Phase 7 — shared state cards for fetch outcomes (server-safe).
// DbResult error → ErrorState (AUTH_REQUIRED → sign-in prompt, FORBIDDEN →
// permission notice), empty → EmptyState, plus an OfflineDemoBanner. These keep
// every fetching page from ever rendering a blank screen.
// =============================================================================

import Link from 'next/link';
import { type ReactNode } from 'react';
import { Card } from '@hsi/ui';
import { AlertTriangle, Inbox, LogIn, ShieldX, CloudOff } from 'lucide-react';
import { formatErrorMessage } from '@/lib/errors/format-error';

export type DbErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_CONFIGURED'
  | 'DB_ERROR';

/**
 * Render a DbResult failure. AUTH_REQUIRED shows a sign-in link (with
 * redirectedFrom); FORBIDDEN shows a permission notice; everything else shows
 * the raw error message in a styled card.
 */
export function ErrorState({
  message,
  code,
  redirectedFrom,
  title = 'Could not load',
}: {
  message?: unknown;
  code?: DbErrorCode;
  redirectedFrom?: string;
  title?: string;
}) {
  // Coerce ANY value (incl. raw Supabase/PostgREST objects) to a readable
  // string so an error panel can never render "[object Object]".
  const text = message === null || message === undefined ? '' : formatErrorMessage(message);
  if (code === 'AUTH_REQUIRED') {
    const href = `/sign-in?redirectedFrom=${encodeURIComponent(redirectedFrom ?? '/dashboard')}`;
    return (
      <Card className="space-y-3 border-electric/40 bg-electric/5" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-electric">
          <LogIn className="h-4 w-4" /> Sign in required
        </h3>
        <p className="text-body-sm leading-relaxed text-text-secondary">
          {text || 'You need to be signed in to view this.'}
        </p>
        <Link
          href={href as never}
          className="inline-flex w-fit items-center gap-2 rounded-btn border border-electric/40 bg-electric/10 px-3.5 py-2 text-caption font-semibold text-electric transition hover:border-electric hover:text-white"
        >
          <LogIn className="h-3.5 w-3.5" /> Sign in
        </Link>
      </Card>
    );
  }
  if (code === 'FORBIDDEN') {
    return (
      <Card className="space-y-2 border-warning/40 bg-warning/5" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-warning">
          <ShieldX className="h-4 w-4" /> Insufficient permissions
        </h3>
        <p className="text-body-sm leading-relaxed text-text-secondary">
          {text ||
            'Your role does not have access to this. Contact an administrator if you believe this is an error.'}
        </p>
      </Card>
    );
  }
  return (
    <Card className="space-y-2 border-risk/40 bg-risk/5" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-risk">
        <AlertTriangle className="h-4 w-4" /> {title}
      </h3>
      <p className="text-body-sm leading-relaxed text-text-secondary">{text}</p>
      {code === 'NOT_CONFIGURED' ? (
        <p className="text-caption text-text-muted">
          Supabase is not configured — a labeled demo view is shown instead where
          available.
        </p>
      ) : null}
    </Card>
  );
}

/** Empty-result card. */
export function EmptyState({
  title = 'Nothing here yet',
  message,
  icon,
  action,
}: {
  title?: string;
  message: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center" padded>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <div className="space-y-1">
        <h3 className="text-h6 font-semibold text-text-primary">{title}</h3>
        <p className="mx-auto max-w-md text-body-sm text-text-secondary">{message}</p>
      </div>
      {action}
    </Card>
  );
}

/** Banner shown above a labeled demo view. */
export function OfflineDemoBanner({
  message = 'Supabase is not configured — showing a labeled demo view derived from offline fixtures. This is not live data.',
}: {
  message?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning/10 px-4 py-3 text-caption font-medium text-warning">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
