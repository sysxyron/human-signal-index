'use client';

// =============================================================================
// HSI Phase 7 — Add / Edit source form. Researcher+ creates via
// createSourceAction or patches via updateSourceAction. Collapsible inline
// panel; auth-gated; full loading / error / success states. PUBLIC sources only
// (ethics: no logins / private communities) — surfaced as a reminder.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Textarea } from '@hsi/ui';
import { Plus, X, Pencil } from 'lucide-react';
import { createSourceAction, updateSourceAction } from '@/lib/signals/actions';
import type { HsinSourceRecord, HsinSourceType } from '@hsi/shared-types';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from './states';

const SOURCE_TYPES: HsinSourceType[] = [
  'website',
  'rss',
  'youtube',
  'tiktok',
  'podcast',
  'forum',
  'document',
  'manual',
];

export interface SourceFormInput {
  name: string;
  description?: string;
  source_type: string;
  platform?: string;
  homepage_url?: string;
  rss_url?: string;
  risk_level?: number;
}

export function SourceForm({
  canManage,
  demo = false,
  mode = 'create',
  existing,
}: {
  canManage: boolean;
  demo?: boolean;
  mode?: 'create' | 'edit';
  existing?: HsinSourceRecord;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [sourceType, setSourceType] = useState<string>(
    String(existing?.source_type ?? 'website'),
  );
  const [platform, setPlatform] = useState(existing?.platform ?? '');
  const [homepageUrl, setHomepageUrl] = useState(existing?.homepage_url ?? '');
  const [rssUrl, setRssUrl] = useState(existing?.rss_url ?? '');
  const [riskLevel, setRiskLevel] = useState<string>(
    existing?.risk_level != null ? String(existing.risk_level) : '3',
  );

  const triggerLabel = mode === 'edit' ? 'Edit' : 'Add source';
  const TriggerIcon = mode === 'edit' ? Pencil : Plus;

  if (!open) {
    return (
      <Button
        variant={mode === 'edit' ? 'ghost' : 'primary'}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <TriggerIcon className="h-4 w-4" /> {triggerLabel}
      </Button>
    );
  }

  const submit = () => {
    setError(null);
    setDone(false);
    const input = {
      name: name.trim(),
      description: description.trim() || undefined,
      sourceType,
      platform: platform.trim() || undefined,
      homepageUrl: homepageUrl.trim() || undefined,
      rssUrl: rssUrl.trim() || undefined,
      riskLevel: Number(riskLevel),
    };
    startTransition(async () => {
      const res =
        mode === 'edit' && existing
          ? await updateSourceAction(existing.id, input)
          : await createSourceAction(input);
      if (res.ok) {
        setDone(true);
        router.refresh();
        if (mode === 'create') {
          setName('');
          setDescription('');
        }
        setTimeout(() => setOpen(false), 600);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between">
        <h3 className="text-h6 font-semibold text-text-primary">
          {mode === 'edit' ? 'Edit source' : 'Add a monitored source'}
        </h3>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-text-muted hover:text-text-primary"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="rounded-btn border border-border bg-surface-2/40 px-3 py-2 text-caption text-text-muted">
        Public sources only. Never add anything behind a login or a private
        community — the capture policy enforces this.
      </p>

      {demo ? (
        <p className="text-caption text-warning">
          Demo data is read-only — connect Supabase to add real sources.
        </p>
      ) : !canManage ? (
        <SignInPrompt
          message="Sign in as a researcher to add sources"
          redirectedFrom={pathname}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Public movement wiki"
          />
          <Select
            label="Type"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Input
            label="Platform (optional)"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="e.g. Web, YouTube"
          />
          <Select
            label="Baseline risk (1–5)"
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Input
            label="Homepage URL (optional)"
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            placeholder="https://example.org/"
          />
          <Input
            label="RSS URL (optional)"
            value={rssUrl}
            onChange={(e) => setRssUrl(e.target.value)}
            placeholder="https://example.org/feed.xml"
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={pending || !name.trim()}
            >
              {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create source'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {done ? <SuccessNotice message="Source saved." /> : null}
          {error ? <ErrorState title="Could not save source" message={error} /> : null}
        </div>
      )}
    </Card>
  );
}
