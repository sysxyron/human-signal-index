// =============================================================================
// HSI Phase 7 — Source Registry (/dashboard/sources). Server Component.
// Lists monitored sources with health/signal/alert stats, filters, and
// researcher+ management (add / edit / disable / assign-watchlist / capture).
// Offline (NOT_CONFIGURED) → labeled DEMO_SOURCES view. force-dynamic.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { Database } from 'lucide-react';
import type { HsinWatchlistRecord, SourceWithStats } from '@hsi/shared-types';
import {
  listSourcesAction,
  listWatchlistsAction,
} from '@/lib/signals/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  demoSourcesWithStats,
  demoWatchlists,
  canManageSources,
  canCapture as canCaptureRole,
} from '@/lib/signals/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { SourceTable } from '@/components/signals/SourceTable';
import { SourceForm } from '@/components/signals/SourceForm';
import { DemoBadge } from '@/components/signals/badges';
import {
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SourcesPage() {
  const [sourcesRes, watchlistsRes, role, user] = await Promise.all([
    listSourcesAction(),
    listWatchlistsAction(),
    getSessionRole(),
    getUser(),
  ]);

  const authed = Boolean(user);
  const manage = canManageSources(role);
  const capture = canCaptureRole(role);

  // Resolve sources: live, demo (NOT_CONFIGURED), or a real error.
  let sources: SourceWithStats[] = [];
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (sourcesRes.ok) {
    sources = sourcesRes.data;
  } else if (sourcesRes.code === 'NOT_CONFIGURED') {
    sources = demoSourcesWithStats();
    isDemo = true;
  } else {
    errored = { message: sourcesRes.error, code: sourcesRes.code };
  }

  const watchlists: HsinWatchlistRecord[] = isDemo
    ? demoWatchlists()
    : watchlistsRes.ok
      ? watchlistsRes.data
      : [];

  return (
    <>
      <TopNav title="Source Registry" subtitle="Monitored public signal sources" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Database className="h-5 w-5 text-electric" /> Sources
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <SourceForm canManage={manage} demo={isDemo} />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState
            title="Could not load sources"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/sources"
          />
        ) : (
          <SourceTable
            sources={sources}
            watchlists={watchlists}
            canManage={manage}
            canCapture={capture && authed}
            demo={isDemo}
          />
        )}
      </main>
    </>
  );
}
