// =============================================================================
// WorldForge Phase 4 — Evidence tab (Server Component).
// Real evidence infrastructure for a research run: a coverage header (ring +
// mode badge + color-coded counts), per-source cards, and claim → source links
// (with unsupported claims shown honestly). The labeled Chronid demo computes
// FIXTURE evidence in-process via @hsi/evidence-engine — works locally with no
// DB and no API keys, clearly labeled "Demo evidence". Writes (fetch/refresh)
// are auth-gated. force-dynamic so the DAL/action never runs during prerender.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { FileStack } from 'lucide-react';
import { getUser } from '@/lib/supabase/server';
import { resolveRunView } from '../../_resolve';
import { resolveEvidenceView } from './_resolve-evidence';
import { flattenClaims, type FlatClaim } from '@/lib/worldforge/research-view';
import { ResearchTabs } from '@/components/worldforge/research/ResearchTabs';
import { RunErrorState } from '@/components/worldforge/research/RunErrorState';
import { EvidenceCoveragePanel } from '@/components/worldforge/research/EvidenceCoveragePanel';
import { EvidenceSourceCard } from '@/components/worldforge/research/EvidenceSourceCard';
import { ClaimEvidenceList } from '@/components/worldforge/research/ClaimEvidenceList';
import { RefreshEvidenceButton } from '@/components/worldforge/research/RefreshEvidenceButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ResearchEvidencePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { demo?: string };
}) {
  const [resolvedRun, resolvedEvidence, user] = await Promise.all([
    resolveRunView(params.id, searchParams),
    resolveEvidenceView(params.id, searchParams),
    getUser(),
  ]);

  if (resolvedRun.kind === 'error') {
    return (
      <>
        <TopNav title="Research run" subtitle="Evidence" />
        <RunErrorState message={resolvedRun.message} code={resolvedRun.code} />
      </>
    );
  }

  const view = resolvedRun.view;
  const claims: FlatClaim[] = flattenClaims(view.agents);

  // Evidence load failed (DB error / not configured) but the run itself resolved
  // — render the run shell + a styled evidence error, never a white screen.
  if (resolvedEvidence.kind === 'error') {
    return (
      <>
        <TopNav title={view.title} subtitle="Evidence" />
        <main className="space-y-6 p-5 lg:p-6">
          <ResearchTabs runId={view.id} demoQuery={view.isDemo} />
          <Card className="space-y-3 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <FileStack className="h-5 w-5" /> Could not load evidence
            </h3>
            <p className="text-body-sm leading-relaxed text-text-secondary">
              {resolvedEvidence.message}
            </p>
            {resolvedEvidence.code === 'NOT_CONFIGURED' ? (
              <p className="text-caption text-text-muted">
                Tip: open the labeled Chronid demo to explore evidence without a
                database — it runs on curated fixtures and needs no API keys.
              </p>
            ) : null}
          </Card>
          <RefreshEvidenceButton
            runId={view.id}
            isAuthenticated={Boolean(user)}
            demo={view.isDemo}
          />
        </main>
      </>
    );
  }

  const { bundle } = resolvedEvidence;
  const { sources, links, coverage } = bundle;

  // claim → linked-source count, for the per-source "N claims linked" badge.
  const linkCountBySource = new Map<string, number>();
  for (const l of links) {
    linkCountBySource.set(
      l.evidence_source_id,
      (linkCountBySource.get(l.evidence_source_id) ?? 0) + 1,
    );
  }

  return (
    <>
      <TopNav title={view.title} subtitle="Evidence & citations" />
      <main className="space-y-6 p-5 lg:p-6">
        <ResearchTabs runId={view.id} demoQuery={view.isDemo} />

        <EvidenceCoveragePanel coverage={coverage} sourceCount={sources.length} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h5 font-semibold text-text-primary">
              Retrieve evidence
            </h3>
            <span className="text-caption text-text-muted">
              {links.length} claim–source link{links.length === 1 ? '' : 's'}
            </span>
          </div>
          <RefreshEvidenceButton
            runId={view.id}
            isAuthenticated={Boolean(user)}
            demo={view.isDemo}
          />
        </section>

        <ClaimEvidenceList claims={claims} links={links} sources={sources} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <FileStack className="h-5 w-5 text-electric" /> Evidence sources
            </h3>
            <span className="text-caption text-text-muted">
              {sources.length} source{sources.length === 1 ? '' : 's'}
            </span>
          </div>
          {sources.length === 0 ? (
            <Card className="space-y-1.5" padded>
              <p className="text-body-sm text-text-secondary">
                No evidence sources yet for this run.
              </p>
              <p className="text-caption text-text-muted">
                {view.isDemo
                  ? 'The demo computes fixtures in-process — if this is empty the engine returned no matches.'
                  : 'Use “Fetch / refresh evidence” above to gather citations for this run.'}
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sources.map((s) => (
                <EvidenceSourceCard
                  key={s.id}
                  source={s}
                  linkCount={linkCountBySource.get(s.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
