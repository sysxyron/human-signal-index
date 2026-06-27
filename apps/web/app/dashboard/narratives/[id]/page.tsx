// =============================================================================
// HSI Phase 65 — Narrative detail (/dashboard/narratives/[id]). Server Component,
// force-dynamic, reviewer+ (admins also recompute). Summary, health (explainable),
// timeline, connected members (with stance), related narratives, and the alert
// feed. All computed; RLS-gated.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../../components/dashboard-shell';
import { getNarrativeSummary, getNarrativeTimeline, getNarrativeRelationships, getNarrativeGeography } from '@/lib/narrative-intelligence/service';
import { getRecentAlertsDal } from '@/lib/narrative-intelligence/persistence';
import { createClient } from '@/lib/supabase/server';
import {
  StatusBadge, NarrativeHealthPanel, NarrativeGeographyPanel, NarrativeTimelinePanel, NarrativeMembersPanel,
  NarrativeRelationshipsPanel, NarrativeAlertFeed,
} from '@/components/narratives/panels';
import { RecomputeNarrativeButton } from '@/components/narratives/NarrativeControls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NarrativeDetailPage({ params }: { params: { id: string } }) {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Narrative" subtitle="Narrative intelligence" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Restricted to reviewers and admins.' : 'Sign in to continue.'} redirectedFrom={`/dashboard/narratives/${params.id}`} />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const [summaryRes, timelineRes, relRes, geoRes, alerts] = await Promise.all([
    getNarrativeSummary(params.id),
    getNarrativeTimeline(params.id),
    getNarrativeRelationships(params.id),
    getNarrativeGeography(params.id),
    getRecentAlertsDal(createClient(), params.id, 30),
  ]);

  if (!summaryRes.ok) {
    return (
      <>
        <TopNav title="Narrative" subtitle="Narrative intelligence" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code="DB_ERROR" title="Narrative not found" message={summaryRes.error} redirectedFrom="/dashboard/narratives" />
        </main>
      </>
    );
  }

  const { narrative, composition, health, members } = summaryRes.data;
  const timeline = timelineRes.ok ? timelineRes.data : { points: [], firstAppearance: null, peakAt: null, peakMembers: 0, latestActivity: null, phase: 'insufficient' as const };
  const relationships = relRes.ok ? relRes.data : [];

  return (
    <DashboardPage
      title={narrative.name}
      subtitle={narrative.summary ?? 'Observable narrative structure'}
      actions={admin ? <RecomputeNarrativeButton id={narrative.id} /> : undefined}
    >
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <StatusBadge status={narrative.status} />
          <span className="text-caption text-text-muted">Seeded narrative · {composition.total} connected members</span>
        </div>
        <NarrativeHealthPanel composition={composition} health={health} />
        {geoRes.ok ? <NarrativeGeographyPanel narrativeId={narrative.id} geography={geoRes.data.geography} /> : null}
        <div className="grid gap-6 xl:grid-cols-2">
          <NarrativeTimelinePanel timeline={timeline} />
          <NarrativeRelationshipsPanel relationships={relationships} />
        </div>
        <NarrativeMembersPanel members={members} />
        <NarrativeAlertFeed alerts={alerts} />
      </div>
    </DashboardPage>
  );
}
