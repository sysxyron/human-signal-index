// =============================================================================
// HSI Phase 7 — Signal Dashboard (/dashboard/signals). Server Component.
// Search + Category / Watchlist / Status / Date filters (read from the
// querystring), rendered as signal cards. Offline (NOT_CONFIGURED) → labeled
// DEMO_SIGNALS view. force-dynamic.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { Inbox, LayoutGrid, Rows3 } from 'lucide-react';
import Link from 'next/link';
import type {
  HsinWatchlistRecord,
  SignalWithContext,
} from '@hsi/shared-types';
import {
  listSignalsAction,
  listWatchlistsAction,
} from '@/lib/signals/actions';
import {
  demoSignalsWithContext,
  demoWatchlists,
} from '@/lib/signals/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { SignalFilters } from '@/components/signals/SignalFilters';
import { SignalCard } from '@/components/signals/SignalCard';
import { SignalTable } from '@/components/signals/SignalTable';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SignalSearch {
  search?: string;
  category?: string;
  watchlistId?: string;
  status?: string;
  sourceId?: string;
  from?: string;
  to?: string;
  view?: string;
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: SignalSearch;
}) {
  const filters = {
    search: searchParams.search,
    category: searchParams.category,
    watchlistId: searchParams.watchlistId,
    status: searchParams.status,
    sourceId: searchParams.sourceId,
    from: searchParams.from,
    to: searchParams.to,
  };

  const [signalsRes, watchlistsRes] = await Promise.all([
    listSignalsAction(filters),
    listWatchlistsAction(),
  ]);

  let signals: SignalWithContext[] = [];
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (signalsRes.ok) {
    // listSignals returns flat signal rows; wrap each into SignalWithContext
    // so the table renders identically to the demo path.
    signals = signalsRes.data.map((row) => ({
      signal: row,
      versionCount: 0,
      tags: [],
      alerts: [],
      researchRunIds: [],
    }));
  } else if (signalsRes.code === 'NOT_CONFIGURED') {
    signals = applyDemoFilters(demoSignalsWithContext(), filters);
    isDemo = true;
  } else {
    errored = { message: signalsRes.error, code: signalsRes.code };
  }

  const watchlists: HsinWatchlistRecord[] = isDemo
    ? demoWatchlists()
    : watchlistsRes.ok
      ? watchlistsRes.data
      : [];

  const asTable = searchParams.view === 'table';

  return (
    <>
      <TopNav title="Signal Dashboard" subtitle="Captured public signals for review" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Inbox className="h-5 w-5 text-electric" /> Signals
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <ViewToggle asTable={asTable} search={searchParams} />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <SignalFilters watchlists={watchlists} />

        {errored ? (
          <ErrorState
            title="Could not load signals"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/signals"
          />
        ) : signals.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="No signals match"
            message="No captured signals match the current filters. Adjust them or capture a source from the Source Registry."
          />
        ) : (
          <>
            <p className="text-caption text-text-muted">
              {signals.length} signal{signals.length === 1 ? '' : 's'}
            </p>
            {asTable ? (
              <SignalTable items={signals} demo={isDemo} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {signals.map((s) => (
                  <SignalCard key={s.signal.id} item={s} demo={isDemo} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function ViewToggle({
  asTable,
  search,
}: {
  asTable: boolean;
  search: SignalSearch;
}) {
  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (v && k !== 'view') base.set(k, v);
  }
  const cardsHref = `/dashboard/signals?${base.toString()}`;
  base.set('view', 'table');
  const tableHref = `/dashboard/signals?${base.toString()}`;
  return (
    <div className="inline-flex overflow-hidden rounded-btn border border-border">
      <Link
        href={cardsHref as never}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-caption font-semibold ${
          !asTable ? 'bg-primary/15 text-white' : 'text-text-secondary hover:text-white'
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" /> Cards
      </Link>
      <Link
        href={tableHref as never}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-caption font-semibold ${
          asTable ? 'bg-primary/15 text-white' : 'text-text-secondary hover:text-white'
        }`}
      >
        <Rows3 className="h-3.5 w-3.5" /> Table
      </Link>
    </div>
  );
}

/** Apply the same filters to demo data so the demo view feels real. */
function applyDemoFilters(
  items: SignalWithContext[],
  f: {
    search?: string;
    category?: string;
    status?: string;
    sourceId?: string;
    from?: string;
    to?: string;
  },
): SignalWithContext[] {
  return items.filter(({ signal }) => {
    if (
      f.search &&
      !`${signal.title} ${signal.summary ?? ''}`
        .toLowerCase()
        .includes(f.search.toLowerCase())
    ) {
      return false;
    }
    if (f.category && String(signal.signal_category) !== f.category) return false;
    if (f.status && signal.status !== f.status) return false;
    if (f.sourceId && signal.source_id !== f.sourceId) return false;
    const at = signal.captured_at ?? signal.created_at;
    if (f.from && at && at.slice(0, 10) < f.from) return false;
    if (f.to && at && at.slice(0, 10) > f.to) return false;
    return true;
  });
}
