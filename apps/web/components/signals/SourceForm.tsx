'use client';

// =============================================================================
// HSI Phase 40 — Add / Edit source form. Researcher+ creates/edits. DYNAMIC fields
// by source type with client-side validation via @hsi/source-collectors (rejects
// Spotify-as-podcast, suggests reddit .rss, requires feeds where needed) so the
// user gets a clear reason BEFORE saving instead of a silent zero-signal source.
// PUBLIC sources only (ethics). RBAC untouched.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Textarea } from '@hsi/ui';
import { Plus, X, Pencil } from 'lucide-react';
import { createSourceAction, updateSourceAction } from '@/lib/signals/actions';
import type { HsinSourceRecord } from '@hsi/shared-types';
// Client-safe deep imports: validation/types only (NOT the barrel, which pulls the
// capture engines → node:crypto/RSS and shouldn't ship in the browser bundle).
import { SOURCE_TYPES, type SourceDraft } from '@hsi/source-collectors/src/types';
import { validateSource } from '@hsi/source-collectors/src/validate';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from './states';

const TYPE_LABELS: Record<string, string> = {
  website: 'Website', rss: 'RSS / Atom feed', youtube: 'YouTube', tiktok: 'TikTok',
  podcast: 'Podcast (RSS)', forum: 'Forum', document: 'Document', manual: 'Manual',
  news: 'News (RSS)', research: 'Research (RSS)', reddit: 'Reddit', social: 'Social page',
  government: 'Government', watchlist: 'Watchlist (no RSS)', email: 'Email', api: 'API (foundation)',
  webhook: 'Webhook (inbound)', archive: 'Archive', intelligence_feed: 'Intelligence feed',
};

export function SourceForm({
  canManage, demo = false, mode = 'create', existing,
}: { canManage: boolean; demo?: boolean; mode?: 'create' | 'edit'; existing?: HsinSourceRecord }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const existingConfig = (existing?.config ?? {}) as Record<string, unknown>;
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [sourceType, setSourceType] = useState<string>(String(existing?.source_type ?? 'rss'));
  const [platform, setPlatform] = useState(existing?.platform ?? '');
  const [homepageUrl, setHomepageUrl] = useState(existing?.homepage_url ?? '');
  const [rssUrl, setRssUrl] = useState(existing?.rss_url ?? '');
  const [url, setUrl] = useState<string>(String((existingConfig.captureUrl as string) ?? ''));
  const [subreddit, setSubreddit] = useState<string>(String((existingConfig.subreddit as string) ?? ''));
  const [captureInterval, setCaptureInterval] = useState<string>(existingConfig.captureIntervalMinutes ? String(existingConfig.captureIntervalMinutes) : '720');
  const [contentSelector, setContentSelector] = useState<string>(String((existingConfig.contentSelector as string) ?? ''));
  const [apiMethod, setApiMethod] = useState<string>(String((existingConfig.apiMethod as string) ?? 'GET'));
  const [riskLevel, setRiskLevel] = useState<string>(existing?.risk_level != null ? String(existing.risk_level) : '3');
  // Phase 41B (beta bug D): status + monitoring are now editable and persisted.
  const [status, setStatus] = useState<string>(String(existing?.status ?? 'active'));
  const [monitoringEnabled, setMonitoringEnabled] = useState<boolean>(existing?.monitoring_enabled ?? true);

  const triggerLabel = mode === 'edit' ? 'Edit' : 'Add source';
  const TriggerIcon = mode === 'edit' ? Pencil : Plus;

  if (!open) {
    return (
      <Button variant={mode === 'edit' ? 'ghost' : 'primary'} size="sm" onClick={() => setOpen(true)}>
        <TriggerIcon className="h-4 w-4" /> {triggerLabel}
      </Button>
    );
  }

  const draft = (): SourceDraft => ({
    sourceType, name, url: url.trim() || undefined, rssUrl: rssUrl.trim() || undefined,
    homepageUrl: homepageUrl.trim() || undefined, subreddit: subreddit.trim() || undefined,
    captureIntervalMinutes: captureInterval ? Number(captureInterval) : undefined,
    contentSelector: contentSelector.trim() || undefined, apiMethod,
  });

  const submit = () => {
    setError(null); setHint(null); setDone(false);
    const validation = validateSource(draft());
    if (!validation.ok) {
      const first = validation.issues[0];
      setError(first.message);
      if (first.suggestion) setHint(`Suggestion: ${first.suggestion}`);
      return;
    }
    const n = validation.normalized!;
    const base = {
      name: name.trim(), description: description.trim() || undefined, sourceType,
      platform: platform.trim() || undefined,
      homepageUrl: n.homepageUrl ?? undefined, rssUrl: n.rssUrl ?? undefined,
      riskLevel: Number(riskLevel), config: n.config as Record<string, unknown>,
    };
    startTransition(async () => {
      const res = mode === 'edit' && existing
        ? await updateSourceAction(existing.id, { ...base, status, monitoringEnabled })
        : await createSourceAction(base);
      if (res.ok) {
        setDone(true); router.refresh();
        if (mode === 'create') { setName(''); setDescription(''); }
        setTimeout(() => setOpen(false), 600);
      } else { setError(res.error); }
    });
  };

  // Which fields show for the selected type.
  const isFeed = ['rss', 'news', 'research', 'intelligence_feed', 'podcast'].includes(sourceType);
  const isReddit = sourceType === 'reddit';
  const isWatchlist = sourceType === 'watchlist';
  const isPage = ['website', 'forum', 'social', 'archive', 'youtube', 'tiktok'].includes(sourceType);
  const isGov = sourceType === 'government';
  const isApi = sourceType === 'api';
  const isWebhook = sourceType === 'webhook';
  const isFoundation = ['document', 'manual', 'email'].includes(sourceType);

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between">
        <h3 className="text-h6 font-semibold text-text-primary">{mode === 'edit' ? 'Edit source' : 'Add a monitored source'}</h3>
        <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-text-muted hover:text-text-primary" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      <p className="rounded-btn border border-border bg-surface-2/40 px-3 py-2 text-caption text-text-muted">
        Public sources only. Never add anything behind a login or a private community — the capture policy enforces this.
      </p>

      {demo ? (
        <p className="text-caption text-warning">Demo data is read-only — connect Supabase to add real sources.</p>
      ) : !canManage ? (
        <SignInPrompt message="Sign in as a researcher to add sources" redirectedFrom={pathname} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Public movement wiki" />
          <Select label="Type" value={sourceType} onChange={(e) => { setSourceType(e.target.value); setError(null); setHint(null); }}>
            {SOURCE_TYPES.map((t) => (<option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>))}
          </Select>

          {/* Dynamic fields by type */}
          {isFeed ? (
            <Input label={sourceType === 'podcast' ? 'Podcast RSS feed URL (required)' : 'RSS / Atom feed URL (required)'} value={rssUrl} onChange={(e) => setRssUrl(e.target.value)} placeholder="https://example.org/feed.xml" />
          ) : null}
          {isReddit ? (
            <Input label="Subreddit (name or URL)" value={subreddit} onChange={(e) => setSubreddit(e.target.value)} placeholder="r/antinatalism" />
          ) : null}
          {isWatchlist ? (
            <>
              <Input label="Page URL (required)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.org/manifesto" />
              <Input label="Capture interval (minutes)" value={captureInterval} onChange={(e) => setCaptureInterval(e.target.value)} placeholder="720" />
              <Input label="Content selector (optional)" value={contentSelector} onChange={(e) => setContentSelector(e.target.value)} placeholder="main, .article-body" />
            </>
          ) : null}
          {isPage ? (
            <Input label="Page / homepage URL (required)" value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} placeholder="https://example.org/" />
          ) : null}
          {isGov ? (
            <>
              <Input label="RSS feed URL (or leave blank to monitor a page)" value={rssUrl} onChange={(e) => setRssUrl(e.target.value)} placeholder="https://agency.gov/feed.xml" />
              <Input label="Page URL (used if no feed)" value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} placeholder="https://agency.gov/news" />
            </>
          ) : null}
          {isApi ? (
            <>
              <Input label="Endpoint URL (required)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.org/v1/items" />
              <Select label="Method" value={apiMethod} onChange={(e) => setApiMethod(e.target.value)}>{['GET', 'POST'].map((m) => (<option key={m} value={m}>{m}</option>))}</Select>
            </>
          ) : null}
          {isWebhook ? (
            <p className="sm:col-span-2 rounded-btn border border-border bg-surface-2/40 px-3 py-2 text-caption text-text-muted">Inbound webhook source — after saving, an external system can push signed payloads to HSI. No URL to fetch; signing keys are managed server-side.</p>
          ) : null}
          {isFoundation ? (
            <Input label="Reference URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.org/document" />
          ) : null}

          <Input label="Platform (optional)" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="e.g. Web, YouTube" />
          <Select label="Baseline risk (1–5)" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>{[1, 2, 3, 4, 5].map((n) => (<option key={n} value={n}>{n}</option>))}</Select>
          {mode === 'edit' ? (
            <>
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {['active', 'paused', 'disabled'].map((s) => (<option key={s} value={s}>{s}</option>))}
              </Select>
              <label className="flex items-center gap-2 self-end pb-2 text-body-sm text-text-secondary">
                <input type="checkbox" checked={monitoringEnabled} onChange={(e) => setMonitoringEnabled(e.target.checked)} className="accent-electric" />
                Monitoring enabled
              </label>
            </>
          ) : null}
          <div className="sm:col-span-2">
            <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button variant="primary" size="sm" onClick={submit} disabled={pending || !name.trim()}>
              {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create source'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {done ? <SuccessNotice message="Source saved." /> : null}
          {error ? <div className="sm:col-span-2"><ErrorState title="Could not save source" message={error} />{hint ? <p className="mt-1 text-caption text-electric">{hint}</p> : null}</div> : null}
        </div>
      )}
    </Card>
  );
}
