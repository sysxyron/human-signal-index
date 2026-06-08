// =============================================================================
// HSI Phase 9 — Narrative Amplification (/dashboard/intelligence/amplification).
// Server Component, force-dynamic. Ranks narratives by a 0..100 amplification
// score with sourceCount / signalCount / velocity + rationale. getAmplification-
// Action(); researcher+ can rebuild (rebuildAmplificationAction). Offline
// (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { TrendingUp, Info } from 'lucide-react';
import type { AmplificationView } from '@hsi/shared-types';
import {
  getAmplificationAction,
  rebuildAmplificationAction,
} from '@/lib/operations/actions';
import { getSessionRole } from '@/lib/supabase/server';
import { canResearch, demoAmplificationView } from '@/lib/operations/phase9-view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { AmplificationBars } from '@/components/communities/AmplificationBars';
import { RebuildButton } from '@/components/communities/RebuildButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AmplificationPage() {
  const [res, role] = await Promise.all([getAmplificationAction(), getSessionRole()]);
  const canRebuild = canResearch(role);

  let view: AmplificationView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoAmplificationView();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  return (
    <>
      <TopNav title="Narrative Amplification" subtitle="How widely narratives are spreading" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <TrendingUp className="h-5 w-5 text-electric" /> Narrative amplification
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RebuildButton
            action={rebuildAmplificationAction}
            canRebuild={canRebuild}
            demo={isDemo}
            label="Rebuild amplification"
            pendingLabel="Rebuilding…"
            successMessage="Amplification scores rebuilt."
            signInMessage="Sign in as a researcher to rebuild amplification"
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Amplification (0–100) blends how many distinct sources carry a narrative, how
            many signals reference it, and how fast that is changing (velocity). High scores
            indicate a narrative spreading widely — a descriptive signal for human review,
            not a judgement of truth.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load amplification"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/amplification"
          />
        ) : view ? (
          view.scores.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-5 w-5" />}
              title="No amplification scores yet"
              message="Rebuild amplification once narratives have linked signals across sources."
            />
          ) : (
            <AmplificationBars view={view} />
          )
        ) : null}
      </main>
    </>
  );
}
