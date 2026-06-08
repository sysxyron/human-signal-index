'use client';

// =============================================================================
// HSI Phase 7 — Signal dashboard filter bar. Search + Category / Watchlist /
// Status / Date filters that write to the querystring (read server-side by the
// page). Uses router.replace so back/forward and shareable URLs work.
// =============================================================================

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input, Select } from '@hsi/ui';
import { Search, X } from 'lucide-react';
import type { HsinWatchlistRecord } from '@hsi/shared-types';

const CATEGORIES = [
  'ideology',
  'recruitment',
  'radicalization',
  'misinformation',
  'disinformation',
  'propaganda',
  'extremism',
  'coordination',
  'mobilization',
  'narrative_shift',
  'self_harm',
  'violence',
  'targeting',
  'financing',
  'technology',
  'other',
];

const STATUSES = [
  'new',
  'reviewing',
  'approved',
  'rejected',
  'needs_research',
  'published',
];

export function SignalFilters({
  watchlists,
}: {
  watchlists: HsinWatchlistRecord[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`${pathname}?${next.toString()}` as never, { scroll: false });
    },
    [params, pathname, router],
  );

  const get = (key: string) => params.get(key) ?? '';
  const hasAny =
    get('search') ||
    get('category') ||
    get('watchlistId') ||
    get('status') ||
    get('from') ||
    get('to');

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface/50 p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          defaultValue={get('search')}
          placeholder="Search signal titles & summaries…"
          className="pl-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setParam('search', (e.target as HTMLInputElement).value);
            }
          }}
          onBlur={(e) => setParam('search', e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={get('category')} onChange={(e) => setParam('category', e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <Select value={get('watchlistId')} onChange={(e) => setParam('watchlistId', e.target.value)}>
          <option value="">All watchlists</option>
          {watchlists.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select value={get('status')} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={get('from')}
          onChange={(e) => setParam('from', e.target.value)}
          aria-label="From date"
        />
        <Input
          type="date"
          value={get('to')}
          onChange={(e) => setParam('to', e.target.value)}
          aria-label="To date"
        />
      </div>
      {hasAny ? (
        <button
          onClick={() => router.replace(pathname as never, { scroll: false })}
          className="inline-flex items-center gap-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" /> Clear filters
        </button>
      ) : null}
    </div>
  );
}
