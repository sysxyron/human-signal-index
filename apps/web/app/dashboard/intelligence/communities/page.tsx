// =============================================================================
// HSI Phase 9 — Narrative Communities (/dashboard/intelligence/communities).
// Server Component, force-dynamic. Detected clusters over the narrative graph:
// a list of communities (label, size, members) + a React Flow graph coloring
// narratives by community membership. getCommunitiesAction(); researcher+ can
// rebuild (rebuildCommunitiesAction). Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Users, Info } from 'lucide-react';
import type { CommunitiesView } from '@hsi/shared-types';
import {
  getCommunitiesAction,
  rebuildCommunitiesAction,
} from '@/lib/operations/actions';
import { getSessionRole } from '@/lib/supabase/server';
import { canResearch, demoCommunitiesView } from '@/lib/operations/phase9-view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { CommunityList, CommunityLegend } from '@/components/communities/CommunityList';
import { CommunityGraphClient } from '@/components/communities/CommunityGraphClient';
import { RebuildButton } from '@/components/communities/RebuildButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CommunitiesPage() {
  const [res, role] = await Promise.all([getCommunitiesAction(), getSessionRole()]);
  const canRebuild = canResearch(role);

  let view: CommunitiesView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoCommunitiesView();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const hasGraph = view && view.communities.length > 0;

  return (
    <>
      <TopNav title="Narrative Communities" subtitle="Clusters detected over the narrative graph" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Users className="h-5 w-5 text-electric" /> Narrative communities
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RebuildButton
            action={rebuildCommunitiesAction}
            canRebuild={canRebuild}
            demo={isDemo}
            label="Rebuild communities"
            pendingLabel="Rebuilding…"
            successMessage="Communities rebuilt from the narrative graph."
            signInMessage="Sign in as a researcher to rebuild communities"
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Community detection groups narratives that link densely to one another in the
            narrative graph (via label propagation). Each community is one color, shared
            between the list and the graph below. This is DRAFT analytic structure over
            PUBLIC narratives for human review — never an auto-published claim.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load communities"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/communities"
          />
        ) : view ? (
          hasGraph ? (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <CommunityList view={view} />
                <Card className="space-y-3" padded>
                  <h3 className="text-h6 font-semibold text-text-primary">Community graph</h3>
                  <CommunityLegend communities={view.communities} />
                  <CommunityGraphClient view={view} />
                </Card>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No communities detected yet"
              message="Once the narrative graph has enough edges, rebuild communities to cluster related narratives."
            />
          )
        ) : null}
      </main>
    </>
  );
}
