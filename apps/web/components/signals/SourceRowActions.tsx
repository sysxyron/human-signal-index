'use client';

// =============================================================================
// HSI Phase 7 — inline per-source mutations: Disable (disableSourceAction) and
// Assign-to-watchlist (addSourceToWatchlistAction / addWatchlistSourceAction).
// Researcher+; auth-gated; transitions with inline feedback.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Select } from '@hsi/ui';
import { Ban, ListPlus, Archive } from 'lucide-react';
import {
  disableSourceAction,
  addSourceToWatchlistAction,
  archiveSourceAction,
} from '@/lib/signals/actions';
import type { HsinWatchlistRecord } from '@hsi/shared-types';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';

export function DisableSourceButton({
  sourceId,
  canManage,
  demo = false,
  disabled = false,
}: {
  sourceId: string;
  canManage: boolean;
  demo?: boolean;
  /** Already disabled — render a static label. */
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (disabled) {
    return <span className="text-caption text-text-muted">Disabled</span>;
  }
  if (demo) {
    return (
      <Button variant="ghost" size="sm" disabled title="Demo is read-only">
        <Ban className="h-4 w-4" /> Disable
      </Button>
    );
  }
  if (!canManage) {
    return <SignInPrompt message="Sign in" redirectedFrom={pathname} />;
  }
  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await disableSourceAction(sourceId);
            if (res.ok) router.refresh();
            else setError(res.error);
          });
        }}
        disabled={pending}
      >
        <Ban className="h-4 w-4" /> {pending ? 'Disabling…' : 'Disable'}
      </Button>
      {error ? <p className="text-caption text-risk">{error}</p> : null}
    </div>
  );
}

export function AssignWatchlistControl({
  sourceId,
  watchlists,
  canManage,
  demo = false,
}: {
  sourceId: string;
  watchlists: HsinWatchlistRecord[];
  canManage: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (demo) {
    return (
      <span className="text-caption text-text-muted">Assign (demo read-only)</span>
    );
  }
  if (!canManage) {
    return <SignInPrompt message="Sign in" redirectedFrom={pathname} />;
  }
  if (watchlists.length === 0) {
    return <span className="text-caption text-text-muted">No watchlists</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-40">
        <Select
          value={value}
          onChange={(e) => {
            const wid = e.target.value;
            setValue(wid);
            if (!wid) return;
            setError(null);
            setDone(false);
            startTransition(async () => {
              const res = await addSourceToWatchlistAction(sourceId, wid);
              if (res.ok) {
                setDone(true);
                router.refresh();
              } else {
                setError(res.error);
              }
              setValue('');
            });
          }}
          disabled={pending}
        >
          <option value="">
            <ListPlus className="h-3 w-3" /> Assign watchlist…
          </option>
          {watchlists.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>
      {done ? <span className="text-caption text-verified">Added</span> : null}
      {error ? <span className="text-caption text-risk">{error}</span> : null}
    </div>
  );
}

/**
 * Phase 41B — admin-only Archive (soft delete). Confirms first, then archives
 * the source while KEEPING existing signals + audit history. Archived sources
 * drop out of the active list.
 */
export function ArchiveSourceButton({
  sourceId,
  canArchive,
  demo = false,
  archived = false,
}: {
  sourceId: string;
  canArchive: boolean;
  demo?: boolean;
  archived?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!canArchive) return null;
  if (archived) return <span className="text-caption text-text-muted">Archived</span>;
  if (demo) {
    return (
      <Button variant="ghost" size="sm" disabled title="Demo is read-only">
        <Archive className="h-4 w-4" /> Archive
      </Button>
    );
  }

  if (confirming) {
    return (
      <div className="space-y-1">
        <p className="max-w-[14rem] text-caption text-text-secondary">
          This will archive the source but keep existing signals and audit history.
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await archiveSourceAction(sourceId);
                if (res.ok) { setConfirming(false); router.refresh(); }
                else setError(res.error);
              });
            }}
          >
            {pending ? 'Archiving…' : 'Confirm archive'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
        {error ? <p className="text-caption text-risk">{error}</p> : null}
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
      <Archive className="h-4 w-4" /> Delete / Archive
    </Button>
  );
}
