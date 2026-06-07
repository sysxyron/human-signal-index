// =============================================================================
// WorldForge Phase 3 — per-agent DETAIL (Server Component).
// Full breakdown for every agent output: summary, assumptions, equations, tiered
// findings, counterarguments, dependencies, recommended parameters, and the
// traceable claims list. Demo special-cased via the shared resolver.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { resolveRunView } from '../../_resolve';
import { ResearchTabs } from '@/components/worldforge/research/ResearchTabs';
import { AgentDetail } from '@/components/worldforge/research/AgentDetail';
import { RunErrorState } from '@/components/worldforge/research/RunErrorState';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ResearchAgentsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { demo?: string };
}) {
  const resolved = await resolveRunView(params.id, searchParams);

  if (resolved.kind === 'error') {
    return (
      <>
        <TopNav title="Research run" subtitle="Agents" />
        <RunErrorState message={resolved.message} code={resolved.code} />
      </>
    );
  }

  const view = resolved.view;

  return (
    <>
      <TopNav title={view.title} subtitle="Agent detail" />
      <main className="space-y-6 p-5 lg:p-6">
        <ResearchTabs runId={view.id} demoQuery={view.isDemo} />

        {/* Jump-to nav across the agents */}
        <nav className="flex flex-wrap gap-1.5">
          {view.agents.map((a) => (
            <a
              key={a.domain}
              href={`#${a.domain}`}
              className="rounded-full border border-border bg-surface-2/50 px-3 py-1.5 text-caption font-semibold text-text-secondary transition hover:border-electric hover:text-white"
            >
              {a.title}
            </a>
          ))}
        </nav>

        <div className="space-y-6">
          {view.agents.map((agent) => (
            <AgentDetail
              key={agent.domain}
              output={agent}
              disputes={view.disputes.filter(
                (d) => d.targetDomain === agent.domain,
              )}
            />
          ))}
        </div>
      </main>
    </>
  );
}
