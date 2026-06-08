// =============================================================================
// HSI Phase 11 — Causal Intelligence Dashboard (/dashboard/intelligence/causal).
// Server Component, force-dynamic. "Why did the narrative move?": top causal
// CHAINS (ordered vertical event cascades + summary + confidence), the most
// influential EVENTS (ranked by strength × confidence), growth-cause / decline-
// cause lists, a timeline of major events, and a per-narrative EXPLANATION
// (explainNarrativeChangeAction for the selected ?narrativeId). Researcher+ can
// rebuild causal intelligence. Offline (NOT_CONFIGURED) → labeled demo derived
// from the @hsi/causal-intelligence causalDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { GitBranch, Info, Sparkles, TrendingUp, TrendingDown, Clock3 } from 'lucide-react';
import type {
  CausalExplanation,
  CausalHighlights,
  CausalView,
} from '@hsi/shared-types';
import {
  getCausalAction,
  getCausalHighlightsAction,
  explainNarrativeChangeAction,
  rebuildCausalAction,
} from '@/lib/causal/actions';
import { getSessionRole } from '@/lib/supabase/server';
import {
  canResearch,
  demoCausalView,
  demoCausalHighlights,
  demoCausalExplanation,
  rankChains,
  rankEvents,
  growthCauses,
  declineCauses,
  eventsByTime,
} from '@/lib/causal/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { CausalChainFlow } from '@/components/causal/CausalChainFlow';
import { EventList } from '@/components/causal/EventList';
import { ChangeExplanation } from '@/components/causal/ChangeExplanation';
import { CausalHighlightCards } from '@/components/causal/CausalHighlightCards';
import { RebuildCausalButton } from '@/components/causal/RebuildCausalButton';
import { NarrativePicker } from '@/components/causal/NarrativePicker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CausalPage({
  searchParams,
}: {
  searchParams: { narrativeId?: string };
}) {
  const [res, role] = await Promise.all([getCausalAction(), getSessionRole()]);
  const canRebuild = canResearch(role);

  let view: CausalView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoCausalView();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  // Highlights strip (defensive — failure simply hides it).
  let highlights: CausalHighlights | null = null;
  let highlightsDemo = false;
  try {
    if (isDemo) {
      highlights = demoCausalHighlights();
      highlightsDemo = true;
    } else {
      const hRes = await getCausalHighlightsAction();
      if (hRes.ok) {
        highlights = hRes.data;
      } else if (hRes.code === 'NOT_CONFIGURED') {
        highlights = demoCausalHighlights();
        highlightsDemo = true;
      }
    }
  } catch {
    highlights = null;
  }

  const narrativeNames = new Map(view?.narratives.map((n) => [n.id, n.name]) ?? []);

  // Selected narrative for the explanation (defaults to the first available).
  const selectedId =
    searchParams.narrativeId?.trim() || view?.narratives[0]?.id || undefined;

  // Per-narrative explanation (defensive).
  let explanation: CausalExplanation | null = null;
  let explanationErr: { message: string; code?: DbErrorCode } | null = null;
  if (selectedId) {
    try {
      if (isDemo) {
        explanation = demoCausalExplanation(selectedId);
      } else {
        const eRes = await explainNarrativeChangeAction(selectedId);
        if (eRes.ok) {
          explanation = eRes.data;
        } else if (eRes.code === 'NOT_CONFIGURED') {
          explanation = demoCausalExplanation(selectedId);
        } else {
          explanationErr = { message: eRes.error, code: eRes.code };
        }
      }
    } catch {
      explanation = null;
    }
  }

  const chains = view ? rankChains(view.chains) : [];
  const topEvents = view ? rankEvents(view.events) : [];
  const grow = view ? growthCauses(view.events) : [];
  const decline = view ? declineCauses(view.events) : [];
  const timeline = view ? eventsByTime(view.events) : [];

  const hasData = view && (chains.length > 0 || topEvents.length > 0);

  return (
    <>
      <TopNav title="Causal Intelligence" subtitle="Why narratives move — events, chains & explanations" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <GitBranch className="h-5 w-5 text-electric" /> Causal intelligence
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RebuildCausalButton
            action={rebuildCausalAction}
            canRebuild={canRebuild}
            demo={isDemo}
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Causal intelligence detects discrete events in a narrative&apos;s history
            (surges, source/community expansion, amplification spikes, contradiction
            shifts, forecast moves, influence transfers), orders them into explainable
            chains, and renders a data-grounded explanation of why it moved. Every
            statement is tied to a concrete number from the narrative&apos;s own
            snapshots — this is a descriptive aid for human review, never an
            auto-published claim or a judgement of truth.
          </p>
        </Card>

        {/* Highlights strip */}
        {highlights ? (
          <CausalHighlightCards highlights={highlights} demo={highlightsDemo} />
        ) : null}

        {errored ? (
          <ErrorState
            title="Could not load causal intelligence"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/causal"
          />
        ) : hasData ? (
          <div className="space-y-6">
            {/* Per-narrative explanation */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                  <Sparkles className="h-4 w-4 text-electric" /> Narrative explanation
                </h3>
                {view && view.narratives.length > 0 ? (
                  <NarrativePicker
                    narratives={view.narratives}
                    selectedId={selectedId}
                  />
                ) : null}
              </div>
              {explanationErr ? (
                <ErrorState
                  title="Could not explain this narrative"
                  message={explanationErr.message}
                  code={explanationErr.code}
                  redirectedFrom="/dashboard/intelligence/causal"
                />
              ) : explanation ? (
                <ChangeExplanation
                  explanation={explanation}
                  narrativeName={
                    selectedId ? narrativeNames.get(selectedId) : undefined
                  }
                />
              ) : (
                <p className="text-caption text-text-muted">
                  Select a narrative to see a data-grounded explanation of why it moved.
                </p>
              )}
            </section>

            {/* Top causal chains */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <GitBranch className="h-4 w-4 text-electric" /> Top causal chains
              </h3>
              {chains.length === 0 ? (
                <p className="text-caption text-text-muted">
                  No causal chains detected yet.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {chains.slice(0, 4).map((chain) => (
                    <CausalChainFlow
                      key={chain.id}
                      chain={chain}
                      narrativeName={narrativeNames.get(chain.narrative_id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Most influential events + causes */}
            <section className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-3" padded>
                <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                  <Sparkles className="h-4 w-4 text-electric" /> Most influential events
                </h3>
                <EventList
                  events={topEvents}
                  narrativeNames={narrativeNames}
                  showNarrative
                  limit={6}
                  emptyHint="No causal events detected."
                />
              </Card>

              <div className="space-y-6">
                <Card className="space-y-3" padded>
                  <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                    <TrendingUp className="h-4 w-4 text-[#10B981]" /> Largest growth causes
                  </h3>
                  <EventList
                    events={grow}
                    narrativeNames={narrativeNames}
                    showNarrative
                    limit={4}
                    emptyHint="No growth-driving events detected."
                  />
                </Card>
                <Card className="space-y-3" padded>
                  <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                    <TrendingDown className="h-4 w-4 text-[#F59E0B]" /> Largest decline causes
                  </h3>
                  <EventList
                    events={decline}
                    narrativeNames={narrativeNames}
                    showNarrative
                    limit={4}
                    emptyHint="No decline-driving events detected."
                  />
                </Card>
              </div>
            </section>

            {/* Timeline of major events */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Clock3 className="h-4 w-4 text-electric" /> Timeline of major events
              </h3>
              <Card padded>
                <EventList
                  events={timeline}
                  narrativeNames={narrativeNames}
                  showNarrative
                  limit={12}
                  emptyHint="No events on the timeline yet."
                />
              </Card>
            </section>
          </div>
        ) : (
          <EmptyState
            icon={<GitBranch className="h-5 w-5" />}
            title="No causal intelligence yet"
            message="Once narratives accumulate snapshots, rebuild causal intelligence to detect the events and chains that explain why each one moved."
          />
        )}
      </main>
    </>
  );
}
