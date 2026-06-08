// =============================================================================
// HSI Phase 10 — Narrative Evolution (/dashboard/intelligence/evolution).
// Server Component, force-dynamic. "Git history for ideas": per narrative shows
// net growth/decline, velocity & trend, change-type badges (growth/decline/
// mutation/split/merge), a snapshot TIMELINE + a LineChart of signal_count /
// amplification over snapshots, with the growth % prominent. Researcher+ can
// rebuild temporal intelligence (rebuildTemporalAction). Offline (NOT_CONFIGURED)
// → labeled demo derived from the @hsi/temporal-intelligence fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { History, Info } from 'lucide-react';
import type { EvolutionView } from '@hsi/shared-types';
import { getEvolutionAction, rebuildTemporalAction } from '@/lib/temporal/actions';
import { getSessionRole } from '@/lib/supabase/server';
import { canResearch, demoEvolutionView } from '@/lib/temporal/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { EvolutionNarrativeCard } from '@/components/temporal/EvolutionNarrativeCard';
import { RebuildTemporalButton } from '@/components/temporal/RebuildTemporalButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EvolutionPage() {
  const [res, role] = await Promise.all([getEvolutionAction(), getSessionRole()]);
  const canRebuild = canResearch(role);

  let view: EvolutionView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = await demoEvolutionView();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  // Only show narratives that actually have snapshots, ordered by net activity.
  const narrativesWithData =
    view?.narratives
      .map((n) => ({
        narrative: n,
        snapshots: view!.snapshots.filter((s) => s.narrative_id === n.id),
        evolution: view!.evolution.filter((e) => e.narrative_id === n.id),
      }))
      .filter((row) => row.snapshots.length > 0)
      .sort((a, b) => b.snapshots.length - a.snapshots.length) ?? [];

  return (
    <>
      <TopNav title="Narrative Evolution" subtitle="How narratives change over time" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <History className="h-5 w-5 text-electric" /> Narrative evolution
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RebuildTemporalButton
            action={rebuildTemporalAction}
            canRebuild={canRebuild}
            demo={isDemo}
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Evolution diffs consecutive point-in-time snapshots of each PUBLIC narrative into an
            explainable change log — growth, decline, mutation, split or merge — with a percent
            change in signal volume. This is DRAFT descriptive structure for human review, never
            an auto-published claim or a judgement of truth.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load narrative evolution"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/evolution"
          />
        ) : narrativesWithData.length > 0 ? (
          <div className="space-y-6">
            {narrativesWithData.map((row) => (
              <EvolutionNarrativeCard
                key={row.narrative.id}
                narrative={row.narrative}
                snapshots={row.snapshots}
                evolution={row.evolution}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No narrative snapshots yet"
            message="Once narratives accumulate snapshots over time, rebuild temporal intelligence to chart how each one evolves."
          />
        )}
      </main>
    </>
  );
}
