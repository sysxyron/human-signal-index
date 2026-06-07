// =============================================================================
// WorldForge Phase 3 — Research run OVERVIEW (Server Component).
// Run header + consensus summary + a grid of agent cards (with disagreement
// markers) + the Generate-world CTA. Special-cases the labeled Chronid demo
// (id === 'demo-chronid' or ?demo=1). force-dynamic so the action is never run
// during static prerender.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getUser } from '@/lib/supabase/server';
import { resolveRunView } from '../_resolve';
import { disputesByDomain } from '@/lib/worldforge/research-view';
import { RunHeader } from '@/components/worldforge/research/RunHeader';
import { ResearchTabs } from '@/components/worldforge/research/ResearchTabs';
import { ConsensusSummary } from '@/components/worldforge/research/ConsensusSummary';
import { ResearchAgentCard } from '@/components/worldforge/research/ResearchAgentCard';
import { GenerateWorldButton } from '@/components/worldforge/research/GenerateWorldButton';
import { RunErrorState } from '@/components/worldforge/research/RunErrorState';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ResearchRunOverviewPage({
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
        <TopNav title="Research run" subtitle="Overview" />
        <RunErrorState message={resolved.message} code={resolved.code} />
      </>
    );
  }

  const view = resolved.view;
  const disputeMap = disputesByDomain(view.disputes);

  return (
    <>
      <TopNav title={view.title} subtitle="Research run overview" />
      <main className="space-y-6 p-5 lg:p-6">
        <ResearchTabs runId={view.id} demoQuery={view.isDemo} />
        <RunHeader view={view} />

        {view.consensus ? (
          <ConsensusSummary consensus={view.consensus} compactFindings />
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h5 font-semibold text-text-primary">
              Domain agents
            </h3>
            <span className="text-caption text-text-muted">
              {view.agents.length} agents ·{' '}
              {view.disputes.length} skeptic disputes
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {view.agents.map((agent) => {
              const info = disputeMap.get(agent.domain);
              return (
                <ResearchAgentCard
                  key={agent.domain}
                  output={agent}
                  disputeCount={info?.count ?? 0}
                  disputeSeverity={info?.severity ?? 'medium'}
                />
              );
            })}
          </div>
        </section>

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
