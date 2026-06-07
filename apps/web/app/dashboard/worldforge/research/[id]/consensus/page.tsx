// =============================================================================
// WorldForge Phase 3 — CONSENSUS report (Server Component).
// The consensus synthesis: summary, confidence/agreement, the 5-tier breakdown,
// key findings, open disputes, merged recommended parameters, blueprint notes,
// and the buildable blueprint with the Generate-world CTA. Demo special-cased.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ListChecks, MessageSquareWarning, SlidersHorizontal } from 'lucide-react';
import { getUser } from '@/lib/supabase/server';
import { resolveRunView } from '../../_resolve';
import { ResearchTabs } from '@/components/worldforge/research/ResearchTabs';
import { ConsensusSummary } from '@/components/worldforge/research/ConsensusSummary';
import { DisputeCard } from '@/components/worldforge/research/DisputeCard';
import {
  BlueprintPanel,
  ParamsTable,
} from '@/components/worldforge/research/BlueprintPanel';
import { GenerateWorldButton } from '@/components/worldforge/research/GenerateWorldButton';
import { RunErrorState } from '@/components/worldforge/research/RunErrorState';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ResearchConsensusPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { demo?: string };
}) {
  const [resolved, user] = await Promise.all([
    resolveRunView(params.id, searchParams),
    getUser(),
  ]);

  if (resolved.kind === 'error') {
    return (
      <>
        <TopNav title="Research run" subtitle="Consensus" />
        <RunErrorState message={resolved.message} code={resolved.code} />
      </>
    );
  }

  const view = resolved.view;
  const consensus = view.consensus;

  return (
    <>
      <TopNav title={view.title} subtitle="Consensus report" />
      <main className="space-y-6 p-5 lg:p-6">
        <ResearchTabs runId={view.id} demoQuery={view.isDemo} />

        {consensus ? (
          <>
            <ConsensusSummary consensus={consensus} />

            {/* Open disputes */}
            {consensus.openDisputes.length ? (
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
                  <MessageSquareWarning className="h-5 w-5 text-warning" />
                  Open disputes ({consensus.openDisputes.length})
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {consensus.openDisputes.map((d) => (
                    <DisputeCard key={d.id} dispute={d} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Merged recommended parameters */}
            {Object.keys(consensus.recommendedParameters).length ? (
              <Card className="space-y-3" padded>
                <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
                  <SlidersHorizontal className="h-5 w-5 text-electric" />
                  Merged recommended parameters
                </h3>
                <ParamsTable params={consensus.recommendedParameters} />
              </Card>
            ) : null}

            {/* Blueprint notes */}
            {consensus.blueprintNotes.length ? (
              <Card className="space-y-3" padded>
                <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
                  <ListChecks className="h-5 w-5 text-electric" />
                  Blueprint notes
                </h3>
                <ul className="space-y-1.5">
                  {consensus.blueprintNotes.map((n, i) => (
                    <li
                      key={i}
                      className="text-body-sm leading-relaxed text-text-secondary"
                    >
                      • {n}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        ) : (
          <Card padded>
            <p className="text-body-sm text-text-muted">
              No consensus report is available for this run yet.
            </p>
          </Card>
        )}

        {/* Blueprint + CTA */}
        {view.blueprint ? <BlueprintPanel blueprint={view.blueprint} /> : null}

        <section className="space-y-3">
          <h3 className="text-h5 font-semibold text-text-primary">
            Generate a world
          </h3>
          <GenerateWorldButton
            runId={view.id}
            isAuthenticated={Boolean(user)}
            demo={view.isDemo}
            existingWorldId={view.worldId}
          />
        </section>
      </main>
    </>
  );
}
