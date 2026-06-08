'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card, Select } from '@hsi/ui';
import { RefreshCw, Eye } from 'lucide-react';
import {
  republishEntityAction,
  updatePublicationVisibilityAction,
} from '@/app/dashboard/review/actions';
import {
  VISIBILITIES,
  visibilityStyle,
  roleAtLeast,
  type PublicationVisibility,
} from '@/lib/governance/view';
import { ErrorCard, SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';

/**
 * Curator/admin actions for a publication: Republish (snapshot a new version)
 * and change visibility (PRIVATE/TEAM/PUBLIC). useTransition + full
 * loading/success/error/auth/forbidden handling. Gated to curator+.
 */
export function PublicationActions({
  publicationId,
  currentVisibility,
  role,
  isAuthenticated,
}: {
  publicationId: string;
  currentVisibility: PublicationVisibility;
  role: string | null;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visibility, setVisibility] = useState<PublicationVisibility>(currentVisibility);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canCurate = isAuthenticated && roleAtLeast(role, 'curator');

  if (!isAuthenticated) {
    return (
      <Card className="space-y-2 border-electric/40 bg-electric/5" padded>
        <h3 className="text-h6 font-semibold text-electric">Sign in to manage publication</h3>
        <SignInPrompt message="Sign in" redirectedFrom={pathname} />
      </Card>
    );
  }

  if (!canCurate) {
    return (
      <Card className="space-y-1.5 border-warning/40 bg-warning/5" padded>
        <h3 className="text-h6 font-semibold text-warning">Read-only access</h3>
        <p className="text-caption text-text-secondary">
          Republishing and changing visibility require a <strong>curator</strong> role or higher.
        </p>
      </Card>
    );
  }

  const reset = () => {
    setError(null);
    setForbidden(false);
    setAuthExpired(false);
    setSuccess(null);
  };

  const handle = (fn: () => Promise<{ ok: boolean; error?: string; code?: string }>, ok: string) => {
    reset();
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setSuccess(ok);
        router.refresh();
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else if (res.code === 'FORBIDDEN') {
        setForbidden(true);
      } else {
        setError(res.error ?? 'Action failed.');
      }
    });
  };

  return (
    <Card className="space-y-4" padded>
      <h3 className="text-h6 font-semibold text-text-primary">Curator actions</h3>

      {success ? <SuccessNotice message={success} /> : null}
      {error ? <ErrorCard message={error} title="Action failed" /> : null}
      {forbidden ? (
        <ErrorCard title="Permission denied" message="Curator role or higher required." />
      ) : null}
      {authExpired ? <SignInPrompt message="Sign in again" redirectedFrom={pathname} /> : null}

      <div className="space-y-2">
        <Select
          label="Visibility"
          value={visibility}
          disabled={pending}
          onChange={(e) => setVisibility(e.target.value as PublicationVisibility)}
        >
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {visibilityStyle(v).label}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          disabled={pending || visibility === currentVisibility}
          onClick={() =>
            handle(
              () => updatePublicationVisibilityAction(publicationId, visibility),
              `Visibility updated to ${visibilityStyle(visibility).label}.`,
            )
          }
        >
          <Eye className="h-4 w-4" />
          {pending ? 'Updating…' : 'Update visibility'}
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        <Button
          disabled={pending}
          onClick={() =>
            handle(() => republishEntityAction(publicationId), 'Republished — a new version was snapshotted.')
          }
        >
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
          {pending ? 'Republishing…' : 'Republish (new version)'}
        </Button>
        <p className="mt-1.5 text-[11px] text-text-muted">
          Republishing snapshots the current entity state into a new immutable version.
        </p>
      </div>
    </Card>
  );
}
