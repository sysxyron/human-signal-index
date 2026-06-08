'use client';

// =============================================================================
// HSI Phase 7 — Create watchlist form. Researcher+ creates via
// createWatchlistAction. Terms entered comma/newline separated. Auth-gated;
// loading / error / success. Watchlists are NEUTRAL public-term sets, never
// targeting private individuals (reminder surfaced).
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Textarea } from '@hsi/ui';
import { Plus, X } from 'lucide-react';
import { createWatchlistAction } from '@/lib/signals/actions';
import type { HsinAlertSeverity } from '@hsi/shared-types';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from './states';

const SEVERITIES: HsinAlertSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export interface WatchlistFormInput {
  name: string;
  description?: string;
  severity: HsinAlertSeverity;
  terms: string[];
}

export function WatchlistForm({
  canManage,
  demo = false,
}: {
  canManage: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<HsinAlertSeverity>('MEDIUM');
  const [termsText, setTermsText] = useState('');

  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New watchlist
      </Button>
    );
  }

  const submit = () => {
    setError(null);
    setDone(false);
    const terms = termsText
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const input: WatchlistFormInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      severity,
      terms,
    };
    startTransition(async () => {
      const res = await createWatchlistAction(input);
      if (res.ok) {
        setDone(true);
        setName('');
        setTermsText('');
        router.refresh();
        setTimeout(() => setOpen(false), 600);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between">
        <h3 className="text-h6 font-semibold text-text-primary">New watchlist</h3>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-text-muted hover:text-text-primary"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="rounded-btn border border-border bg-surface-2/40 px-3 py-2 text-caption text-text-muted">
        Watchlists are neutral, research-oriented keyword sets that route public
        signals for human review — never used to target private individuals.
      </p>

      {demo ? (
        <p className="text-caption text-warning">
          Demo data is read-only — connect Supabase to create watchlists.
        </p>
      ) : !canManage ? (
        <SignInPrompt
          message="Sign in as a researcher to create watchlists"
          redirectedFrom={pathname}
        />
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Collapse narratives"
            />
            <Select
              label="Severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as HsinAlertSeverity)}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="Terms (comma or newline separated)"
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
            rows={3}
            placeholder="collapse, depopulation, societal breakdown"
          />
          <Textarea
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={pending || !name.trim() || !termsText.trim()}
            >
              {pending ? 'Creating…' : 'Create watchlist'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {done ? <SuccessNotice message="Watchlist created." /> : null}
          {error ? (
            <ErrorState title="Could not create watchlist" message={error} />
          ) : null}
        </div>
      )}
    </Card>
  );
}
