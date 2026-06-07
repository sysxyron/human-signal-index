// =============================================================================
// WorldForge Phase 3 — Research RUNS list (Server Component).
// Lists the user's research runs as a grid of cards. Degrades cleanly when
// Supabase is not configured (OfflineNotice + the labeled Chronid demo card) and
// surfaces DB errors instead of a white screen. force-dynamic so `next build`
// never executes the query during static prerender.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card, Button } from '@hsi/ui';
import { FlaskConical, Plus, Sparkles } from 'lucide-react';
import { chronidResearchDemo } from '@hsi/research-agents';
import { listResearchRunsAction } from './actions';
import { OfflineNotice, ErrorCard } from '@/components/worldforge/PersistenceUI';
import { RunCard } from '@/components/worldforge/research/RunCard';
import {
  DEMO_RUN_ID,
  type ResearchRunRecord,
} from '@/lib/worldforge/research-view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Synthesize a record-shaped row for the read-only Chronid demo card. */
function demoRunRecord(): ResearchRunRecord {
  const demo = chronidResearchDemo();
  const now = new Date().toISOString();
  return {
    id: DEMO_RUN_ID,
    title: demo.concept.title ?? 'Chronid Prime',
    concept_text: demo.concept.text,
    status: 'complete',
    overall_confidence: demo.consensus.overallConfidence,
    agreement_score: demo.consensus.agreementScore,
    is_public: true,
    created_at: now,
    updated_at: now,
  };
}

export default async function ResearchListPage() {
  const res = await listResearchRunsAction();
  const demoRecord = demoRunRecord();
  const demoHref = `/dashboard/worldforge/research/${DEMO_RUN_ID}?demo=1`;

  const notConfigured = !res.ok && res.code === 'NOT_CONFIGURED';
  const dbError = !res.ok && res.code !== 'NOT_CONFIGURED';
  const runs = res.ok ? res.data : [];
  const isEmpty = res.ok && runs.length === 0;

  return (
    <>
      <TopNav
        title="Research"
        subtitle="Multi-agent scientific research → buildable world blueprints"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="relative overflow-hidden" padded>
          <div className="grid-bg absolute inset-0 opacity-40" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 text-label text-electric">
                <span className="h-1 w-1 rounded-full bg-electric" />
                WorldForge · Phase 3
              </span>
              <h2 className="max-w-2xl text-h4 font-semibold text-text-primary">
                Turn a concept into a debate-tested,{' '}
                <span className="text-gradient">fully-traceable</span> blueprint.
              </h2>
              <p className="max-w-2xl text-body-sm leading-relaxed text-text-secondary">
                Nine domain agents reason in dependency order, a skeptic
                falsifies the weakest claims, and a consensus agent synthesizes a
                buildable world — every claim carrying its source and scientific
                confidence.
              </p>
            </div>
            <Link href={'/dashboard/worldforge/research/new' as never}>
              <Button variant="primary">
                <Plus className="h-4 w-4" /> New research
              </Button>
            </Link>
          </div>
        </Card>

        {dbError && !res.ok ? (
          <ErrorCard message={res.error} title="Could not load research runs" />
        ) : null}

        {notConfigured ? (
          <OfflineNotice message="Offline — Supabase persistence is not configured. Showing the labeled Chronid demo." />
        ) : null}

        {/* User runs */}
        {runs.length ? (
          <section className="space-y-3">
            <h3 className="text-h5 font-semibold text-text-primary">
              Your research runs
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {runs.map((run) => (
                <RunCard key={run.id} run={run} />
              ))}
            </div>
          </section>
        ) : null}

        {isEmpty ? (
          <Card className="space-y-3 text-center" padded>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-electric/15 text-electric">
              <FlaskConical className="h-6 w-6" />
            </span>
            <h3 className="text-h5 font-semibold text-text-primary">
              No research runs yet
            </h3>
            <p className="mx-auto max-w-md text-body-sm text-text-secondary">
              Start by describing a world or being. Or explore the flagship
              Chronid demo below to see the full pipeline.
            </p>
            <div className="flex justify-center">
              <Link href={'/dashboard/worldforge/research/new' as never}>
                <Button variant="primary">
                  <Plus className="h-4 w-4" /> New research
                </Button>
              </Link>
            </div>
          </Card>
        ) : null}

        {/* Demo card — always available, clearly labeled */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Sparkles className="h-4 w-4 text-accent" />
            Flagship demo
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <RunCard run={demoRecord} href={demoHref} demo />
          </div>
        </section>
      </main>
    </>
  );
}
