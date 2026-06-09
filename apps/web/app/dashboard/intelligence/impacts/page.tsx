// =============================================================================
// HSI Phase 13 — Cross-Narrative Impact Dashboard (/dashboard/intelligence/
// impacts). Server Component, force-dynamic. getCrossNarrativeImpactsAction():
// the directed impacts between narratives — source → target with an impact-type
// badge (amplifies / dampens / triggers / competes / reinforces / neutral), a
// 0..100 impact-strength bar, a confidence chip, and the grounded reasoning.
// Renders an interactive React-Flow impact graph (ssr:false) alongside a readable
// grouped list. Couplings are estimates — confidence + reasoning are always
// shown. Offline (NOT_CONFIGURED) → labeled demo from the decisionDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Network, Info } from 'lucide-react';
import type { CrossNarrativeImpactView } from '@hsi/shared-types';
import { getCrossNarrativeImpactsAction } from '@/lib/decision/actions';
import { demoCrossImpacts } from '@/lib/decision/view';
import { DecisionNav } from '@/components/decision/DecisionNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { CrossImpactList } from '@/components/decision/CrossImpactList';
import { CrossImpactGraph } from '@/components/decision/CrossImpactGraph';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CrossImpactsPage() {
  const res = await getCrossNarrativeImpactsAction();

  let view: CrossNarrativeImpactView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoCrossImpacts();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const impacts = view?.impacts ?? [];
  const narratives = view?.narratives ?? [];
  const hasData = impacts.length > 0;

  return (
    <>
      <TopNav
        title="Cross-Narrative Impacts"
        subtitle="How one narrative moves another — estimated couplings, never certainties"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <DecisionNav />

        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Network className="h-5 w-5 text-electric" /> Cross-narrative impact graph
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Narratives do not move in isolation. This view estimates how a SOURCE
            narrative affects a TARGET — amplifying, dampening, triggering, competing
            with, or reinforcing it — from shared sources / communities, influence
            edges, and co-movement in their real histories. Each directed coupling
            carries an{' '}
            <span className="font-semibold text-text-primary">
              impact strength, a confidence, and a reasoning line
            </span>
            . Treat the graph as a map of plausible second-order effects, not a
            certainty.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load cross-narrative impacts"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/impacts"
          />
        ) : !hasData ? (
          <EmptyState
            icon={<Network className="h-5 w-5" />}
            title="No cross-narrative impacts yet"
            message="Cross-narrative couplings appear here once multiple narratives have accumulated overlapping signal, source, and community history. Rebuild the decision pipeline to compute them."
          />
        ) : (
          <div className="space-y-6">
            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Network className="h-4 w-4 text-electric" /> Impact graph
              </h3>
              <CrossImpactGraph impacts={impacts} narratives={narratives} />
              <p className="text-caption text-text-muted">
                Edge color = impact type; edge thickness scales with impact strength;
                animated edges are the strongest couplings. Drag nodes to explore.
              </p>
            </Card>

            <CrossImpactList impacts={impacts} narratives={narratives} />
          </div>
        )}
      </main>
    </>
  );
}
