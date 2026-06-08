// =============================================================================
// HSI Phase 7 — Watchlists (/dashboard/watchlists). Server Component.
// Lists watchlists (severity, terms, source count), researcher+ create. Offline
// (NOT_CONFIGURED) → labeled DEFAULT_WATCHLISTS view. force-dynamic.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { ListChecks } from 'lucide-react';
import type { HsinWatchlistRecord } from '@hsi/shared-types';
import { listWatchlistsAction } from '@/lib/signals/actions';
import { getSessionRole } from '@/lib/supabase/server';
import {
  canResearch,
  demoWatchlists,
  demoWatchlistSourceCount,
} from '@/lib/signals/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { WatchlistCard } from '@/components/signals/WatchlistCard';
import { WatchlistForm } from '@/components/signals/WatchlistForm';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** A watchlist row may carry a denormalized source count from the action. */
type WatchlistRow = HsinWatchlistRecord & { sourceCount?: number };

export default async function WatchlistsPage() {
  const [res, role] = await Promise.all([
    listWatchlistsAction(),
    getSessionRole(),
  ]);

  const manage = canResearch(role);

  let watchlists: WatchlistRow[] = [];
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    watchlists = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    watchlists = demoWatchlists().map((w) => ({
      ...w,
      sourceCount: demoWatchlistSourceCount(),
    }));
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  return (
    <>
      <TopNav title="Watchlists" subtitle="Neutral, research-oriented term sets" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <ListChecks className="h-5 w-5 text-electric" /> Watchlists
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <WatchlistForm canManage={manage} demo={isDemo} />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState
            title="Could not load watchlists"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/watchlists"
          />
        ) : watchlists.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-5 w-5" />}
            title="No watchlists yet"
            message="Create a watchlist of neutral public terms to route matching signals for human review."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {watchlists.map((w) => (
              <WatchlistCard
                key={w.id}
                watchlist={w}
                sourceCount={w.sourceCount ?? 0}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
