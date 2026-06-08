// =============================================================================
// HSI Phase 9 — Providers Console (/dashboard/providers). Server Component,
// force-dynamic. The provider-adapter control surface: account status, recent
// adapter RUNS (with observability counters + outcome badges), rate-limit
// windows, and per-source RELIABILITY profiles. getProvidersOverviewAction().
// Offline (NOT_CONFIGURED) → labeled demo derived from offline fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Plug, Info } from 'lucide-react';
import type { ProvidersOverview } from '@hsi/shared-types';
import { getProvidersOverviewAction } from '@/lib/operations/actions';
import { demoProvidersOverview } from '@/lib/operations/phase9-view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';
import { ProviderAccountStatus } from '@/components/providers/ProviderAccountStatus';
import { ProviderRunsTable } from '@/components/providers/ProviderRunsTable';
import { RateLimitGrid } from '@/components/providers/RateLimitGrid';
import { ReliabilityTable } from '@/components/providers/ReliabilityTable';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProvidersPage() {
  const res = await getProvidersOverviewAction();

  let overview: ProvidersOverview | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    overview = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    overview = demoProvidersOverview();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  return (
    <>
      <TopNav title="Providers" subtitle="Provider-adapter health, runs, limits & reliability" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Plug className="h-5 w-5 text-electric" /> Providers
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Provider adapters fetch each source (RSS, HTML, search, …). This console shows
            which adapters are configured, every recent run with its outcome and counters,
            the live rate-limit budget per provider, and a derived reliability profile per
            source. Blocked, timed-out and low-reliability results are surfaced, never hidden.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load the providers overview"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/providers"
          />
        ) : overview ? (
          <>
            <ProviderAccountStatus runs={overview.runs} rateLimits={overview.rateLimits} />
            <ProviderRunsTable runs={overview.runs} />
            <RateLimitGrid limits={overview.rateLimits} />
            <ReliabilityTable reliabilities={overview.reliabilities} />
          </>
        ) : null}
      </main>
    </>
  );
}
