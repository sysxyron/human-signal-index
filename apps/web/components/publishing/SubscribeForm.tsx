'use client';

// =============================================================================
// HSI Phase 19 — SubscribeForm. The public subscribe flow: email, subscriber tier,
// digest cadence, topic preferences, channel. Requires sign-in (the server gates
// it). Thin wrapper over subscribeAction / unsubscribeAction.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import { PUBLIC_TOPICS } from '@/lib/publishing/view';
import type { SubscriberType } from '@hsi/shared-types';

type DbResultLike = { ok: true } | { ok: false; error: string };

const TYPES: SubscriberType[] = ['FREE', 'RESEARCHER', 'ANALYST', 'ORGANIZATION'];
const FREQS: Array<'none' | 'daily' | 'weekly'> = ['daily', 'weekly', 'none'];

export function SubscribeForm({
  subscribeAction, unsubscribeAction, signedIn, currentEmail, currentActive = false,
}: {
  subscribeAction: (input: { email: string; type?: SubscriberType; digestFrequency?: 'none' | 'daily' | 'weekly'; topics?: string[]; channels?: string[] }) => Promise<DbResultLike>;
  unsubscribeAction: () => Promise<DbResultLike>;
  signedIn: boolean;
  currentEmail?: string;
  currentActive?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(currentEmail ?? '');
  const [type, setType] = useState<SubscriberType>('FREE');
  const [freq, setFreq] = useState<'none' | 'daily' | 'weekly'>('weekly');
  const [topics, setTopics] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!signedIn) {
    return <SignInPrompt message="Sign in to manage your subscription" redirectedFrom={pathname} />;
  }

  const toggleTopic = (slug: string) => {
    setTopics((t) => (t.includes(slug) ? t.filter((x) => x !== slug) : [...t, slug]));
  };

  const submit = () => {
    setError(null); setDone(null);
    if (email.trim().length === 0) { setError('An email is required to receive digests.'); return; }
    start(async () => {
      const res = await subscribeAction({ email: email.trim(), type, digestFrequency: freq, topics, channels: ['email'] });
      if (res.ok) { setDone('Subscribed — preferences saved.'); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  const unsub = () => {
    setError(null); setDone(null);
    start(async () => {
      const res = await unsubscribeAction();
      if (res.ok) { setDone('Unsubscribed. Your history is preserved.'); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-label uppercase tracking-wide text-text-muted">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-label uppercase tracking-wide text-text-muted">Tier</label>
          <select value={type} onChange={(e) => setType(e.target.value as SubscriberType)}
            className="w-full rounded-card border border-border bg-surface px-2 py-2 text-caption text-text-primary focus:border-electric focus:outline-none">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-label uppercase tracking-wide text-text-muted">Digest cadence</label>
          <select value={freq} onChange={(e) => setFreq(e.target.value as 'none' | 'daily' | 'weekly')}
            className="w-full rounded-card border border-border bg-surface px-2 py-2 text-caption text-text-primary focus:border-electric focus:outline-none">
            {FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-label uppercase tracking-wide text-text-muted">Topics</label>
        <div className="flex flex-wrap gap-1.5">
          {PUBLIC_TOPICS.map((t) => {
            const active = topics.includes(t.slug);
            return (
              <button key={t.slug} type="button" onClick={() => toggleTopic(t.slug)}
                className="rounded-full px-2.5 py-1 text-caption font-semibold transition"
                style={active ? { backgroundColor: '#3B82F61f', color: '#3B82F6', border: '1px solid #3B82F655' } : { color: '#94A3B8', border: '1px solid #2A3A5C' }}>
                {t.title}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} {currentActive ? 'Update' : 'Subscribe'}
        </Button>
        {currentActive ? (
          <Button variant="secondary" size="sm" onClick={unsub} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />} Unsubscribe
          </Button>
        ) : null}
      </div>
      {done ? <SuccessNotice message={done} /> : null}
      {error ? <ErrorState title="Could not update your subscription" message={error} /> : null}
    </div>
  );
}
