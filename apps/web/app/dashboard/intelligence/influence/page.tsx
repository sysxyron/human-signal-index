// =============================================================================
// HSI Phase 10 — Narrative Influence (/dashboard/intelligence/influence).
// Server Component, force-dynamic. A directed influence network (React Flow) with
// WEIGHTED edges (influence_score → stroke width + numeric label), arrows from
// the influencing narrative to the influenced one, plus a "Top influencers"
// ranked list (by out-influence). Clicking a node shows its in/out influence.
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/temporal-intelligence
// fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Zap, Info } from 'lucide-react';
import type { InfluenceView } from '@hsi/shared-types';
import { getInfluenceAction } from '@/lib/temporal/actions';
import { demoInfluenceView } from '@/lib/temporal/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { InfluenceGraphClient } from '@/components/temporal/InfluenceGraphClient';
import { TopInfluencers } from '@/components/temporal/TopInfluencers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InfluencePage() {
  const res = await getInfluenceAction();

  let view: InfluenceView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = await demoInfluenceView();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const hasGraph = view && view.edges.length > 0;

  return (
    <>
      <TopNav title="Narrative Influence" subtitle="How narratives influence one another" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Zap className="h-5 w-5 text-electric" /> Narrative influence
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Influence is a directed, weighted estimate of how strongly one PUBLIC narrative
            appears to drive another — derived from shared entities, sources, communities and
            temporal ordering. Thicker arrows mean stronger estimated influence. This is DRAFT
            descriptive structure for human review — a correlational signal, not proven causation
            or a claim of truth.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load narrative influence"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/influence"
          />
        ) : view && hasGraph ? (
          <div className="space-y-6">
            <Card className="space-y-3" padded>
              <h3 className="text-h6 font-semibold text-text-primary">Influence network</h3>
              <InfluenceGraphClient view={view} />
            </Card>
            <TopInfluencers view={view} />
          </div>
        ) : (
          <EmptyState
            icon={<Zap className="h-5 w-5" />}
            title="No influence edges detected yet"
            message="Once narratives co-occur across entities and sources over time, rebuild temporal intelligence to map their influence."
          />
        )}
      </main>
    </>
  );
}
