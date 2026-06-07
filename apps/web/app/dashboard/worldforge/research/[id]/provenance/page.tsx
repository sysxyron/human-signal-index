// =============================================================================
// WorldForge Phase 3 — TRACEABILITY / provenance (Server Component).
// Lists every claim across all agents mapped to its ProvenanceSource (the 6
// categories), grouped/filterable by source, each showing tier + confidence +
// originating agent + dependsOn links. Mirrors the HSI provenance visual style.
// Demo special-cased via the shared resolver.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Route } from 'lucide-react';
import { resolveRunView } from '../../_resolve';
import { ResearchTabs } from '@/components/worldforge/research/ResearchTabs';
import { ProvenanceExplorer } from '@/components/worldforge/research/ProvenanceExplorer';
import { RunErrorState } from '@/components/worldforge/research/RunErrorState';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ResearchProvenancePage({
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
        <TopNav title="Research run" subtitle="Provenance" />
        <RunErrorState message={resolved.message} code={resolved.code} />
      </>
    );
  }

  const view = resolved.view;
  const totalClaims = view.agents.reduce((n, a) => n + a.claims.length, 0);

  return (
    <>
      <TopNav title={view.title} subtitle="Provenance & traceability" />
      <main className="space-y-6 p-5 lg:p-6">
        <ResearchTabs runId={view.id} demoQuery={view.isDemo} />

        <Card className="relative overflow-hidden" padded>
          <div className="grid-bg absolute inset-0 opacity-30" />
          <div className="relative space-y-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Route className="h-5 w-5 text-electric" /> Where did each claim come
              from?
            </h2>
            <p className="max-w-2xl text-body-sm leading-relaxed text-text-secondary">
              {totalClaims} atomic claims across {view.agents.length} agents, each
              traced back to one of six categories — from the user&apos;s own words
              and known science, through prior-agent dependencies and model
              inference, down to explicit speculative assumptions.
            </p>
          </div>
        </Card>

        <ProvenanceExplorer agents={view.agents} />
      </main>
    </>
  );
}
