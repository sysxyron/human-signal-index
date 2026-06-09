// =============================================================================
// HSI Phase 13 — Decision Explorer (/dashboard/decisions/explorer). Server
// Component shell, force-dynamic, around an interactive client panel. A reviewer
// picks a narrative + an intervention type → exploreDecisionAction → sees the
// expected effect, risk score, a PROMINENT confidence band, the grounded
// reasoning, and explicit limitations; explored interventions accumulate into a
// side-by-side comparison so a couple of levers can be weighed at once. A
// "Generate full recommendation" link runs the full decision pipeline. Decision-
// aid framing throughout — confidence + limitations are NEVER hidden. Offline
// (NOT_CONFIGURED) → labeled demo explorer results.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Compass, Info } from 'lucide-react';
import { exploreDecisionAction } from '@/lib/decision/actions';
import { getDecisionDashboardAction } from '@/lib/decision/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoNarratives } from '@/lib/decision/view';
import { DecisionNav } from '@/components/decision/DecisionNav';
import { DemoBadge } from '@/components/signals/badges';
import { OfflineDemoBanner } from '@/components/signals/states';
import { DecisionExplorerPanel } from '@/components/decision/DecisionExplorerPanel';
import type { HsinNarrativeRecord } from '@hsi/shared-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DecisionExplorerPage() {
  // The explorer is action-driven; we only need narratives for the picker and the
  // role for gating. We probe the dashboard action solely to learn whether we are
  // offline (NOT_CONFIGURED) so the explorer can run in labeled demo mode.
  const [probe, role, user] = await Promise.all([
    getDecisionDashboardAction(),
    getSessionRole(),
    getUser(),
  ]);

  const isDemo = !probe.ok && probe.code === 'NOT_CONFIGURED';
  const canRun = canResearch(role) && Boolean(user);

  // Narrative picker: demo fixtures offline; live runs carry their own narrative
  // ids, so when configured we offer the narratives surfaced by the dashboard.
  const narratives: HsinNarrativeRecord[] = isDemo
    ? demoNarratives()
    : probe.ok
      ? dedupeNarratives(probe.data.recentRuns, probe.data.highestRiskNarratives)
      : [];

  return (
    <>
      <TopNav
        title="Decision Explorer"
        subtitle="Weigh interventions interactively — every estimate shows its confidence"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <DecisionNav />

        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Compass className="h-5 w-5 text-electric" /> Explore interventions
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            The explorer lets you probe a single intervention at a time and weigh a
            few side by side before committing to a full recommendation. Each result
            is a grounded estimate of the lever&apos;s expected effect and risk, with
            its own{' '}
            <span className="font-semibold text-text-primary">
              confidence, reasoning, and limitations
            </span>{' '}
            — an aid for human judgement, never a command. Ready to commit? Generate a
            full recommendation to get the ranked plan and audit trail.
          </p>
        </Card>

        <DecisionExplorerPanel
          narratives={narratives}
          action={exploreDecisionAction}
          canRun={canRun}
          demo={isDemo}
        />
      </main>
    </>
  );
}

/** Build a narrative-picker list from the dashboard's runs + risk rows. */
function dedupeNarratives(
  runs: { narrative_id: string }[],
  risks: { narrativeId: string; name: string }[],
): HsinNarrativeRecord[] {
  const byId = new Map<string, string>();
  for (const r of risks) byId.set(r.narrativeId, r.name);
  for (const run of runs) {
    if (!byId.has(run.narrative_id)) byId.set(run.narrative_id, run.narrative_id);
  }
  const now = new Date(0).toISOString();
  return Array.from(byId.entries()).map(([id, name]) => ({
    id,
    name,
    category: 'general',
    created_at: now,
    updated_at: now,
  }));
}
