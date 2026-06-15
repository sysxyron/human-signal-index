// =============================================================================
// Auth error — /auth/error
//
// Friendly terminal page for failed auth links (primarily email confirmation
// from /auth/confirm). It never echoes tokens or raw GoTrue errors — only a
// coarse, human-readable reason derived from the `reason` query param.
// =============================================================================

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const REASONS: Record<string, string> = {
  'email-confirmation-failed':
    'The link may be expired, already used, or invalid.',
  'missing-confirmation-token':
    'The confirmation link was incomplete. Please use the link from your most recent email.',
};

const DEFAULT_REASON = 'The link may be expired, already used, or invalid.';

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const reason = searchParams.reason;
  const detail = (reason && REASONS[reason]) || DEFAULT_REASON;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-3 rounded-card border border-border bg-surface/60 p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-risk" />
        <h1 className="text-body font-semibold text-text-primary">
          Confirmation failed
        </h1>
        <p className="text-body-sm text-text-secondary">{detail}</p>
        <Link
          href="/sign-in"
          className="inline-block text-caption font-semibold text-electric hover:text-white"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
