// =============================================================================
// HSI Phase 10 — Narrative Genealogy (/dashboard/intelligence/genealogy).
// Server Component, force-dynamic. An interactive ancestry tree (React Flow):
// narrative nodes; directed edges (parent → child) colored + labeled by
// relationship (derived_from / split_from / merged_from / contradicts /
// amplifies). Clicking a node shows its parents + children. Offline
// (NOT_CONFIGURED) → labeled demo from the @hsi/temporal-intelligence fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { GitBranch, Info } from 'lucide-react';
import type { GenealogyView } from '@hsi/shared-types';
import { getGenealogyAction } from '@/lib/temporal/actions';
import { demoGenealogyView } from '@/lib/temporal/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { GenealogyTreeClient } from '@/components/temporal/GenealogyTreeClient';
import { GenealogyLegend } from '@/components/temporal/GenealogyLegend';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GenealogyPage() {
  const res = await getGenealogyAction();

  let view: GenealogyView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = await demoGenealogyView();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const hasGraph = view && view.edges.length > 0;

  return (
    <>
      <TopNav title="Narrative Genealogy" subtitle="The family tree of ideas" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <GitBranch className="h-5 w-5 text-electric" /> Narrative genealogy
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Genealogy traces lineage between PUBLIC narratives: which narrative was{' '}
            <span className="font-semibold text-text-primary">derived from</span>,{' '}
            <span className="font-semibold text-text-primary">split from</span> or{' '}
            <span className="font-semibold text-text-primary">merged from</span> another, plus{' '}
            contradiction and amplification links. Edges point parent → child. This is DRAFT
            analytic structure for human review — never an auto-published claim.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load narrative genealogy"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/genealogy"
          />
        ) : view && hasGraph ? (
          <Card className="space-y-3" padded>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-h6 font-semibold text-text-primary">Ancestry tree</h3>
              <GenealogyLegend />
            </div>
            <GenealogyTreeClient view={view} />
          </Card>
        ) : (
          <EmptyState
            icon={<GitBranch className="h-5 w-5" />}
            title="No genealogy edges detected yet"
            message="Once narratives share enough entities, sources and semantics, rebuild temporal intelligence to map their lineage."
          />
        )}
      </main>
    </>
  );
}
