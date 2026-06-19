// =============================================================================
// HSI Phase 65 — Narrative dashboard data (SERVER-ONLY, read). Counts by status,
// emerging/dominant/declining lists, recent activity, the executive intelligence
// lists, and the alert feed — all computed from persisted narratives + their
// latest snapshots/metrics. Reviewer+ via RLS. Never throws.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import {
  listNarrativesDal, countByStatusDal, recentlyChangedDal, latestSnapshotByNarrative,
  growthByNarrative, latestMetricsByNarrative, getRecentAlertsDal, type AlertFeedRow,
} from './persistence';
import type { Narrative, NarrativeStatus } from './types';

export interface NarrativeListItem { narrative: Narrative; members: number; stability: number; contradiction: number; growth: number }

export interface NarrativeDashboard {
  total: number;
  byStatus: Record<string, number>;
  all: NarrativeListItem[];
  emerging: Narrative[];
  dominant: Narrative[];
  declining: Narrative[];
  recentlyCreated: Narrative[];
  recentlyChanged: Narrative[];
  executive: {
    topNarratives: NarrativeListItem[];
    fastestGrowing: NarrativeListItem[];
    mostStable: NarrativeListItem[];
    mostFragmented: NarrativeListItem[];
    mostContested: NarrativeListItem[];
    mostSourceDependent: NarrativeListItem[];
    largestEvidenceBase: NarrativeListItem[];
    largestActorNetwork: NarrativeListItem[];
    largestOrganizationNetwork: NarrativeListItem[];
  };
  alerts: AlertFeedRow[];
}

export async function getNarrativeDashboard(): Promise<NarrativeDashboard> {
  const db = createClient();
  const [narratives, byStatus, recentlyChanged, snapshots, growth, metrics, alerts] = await Promise.all([
    listNarrativesDal(db, { limit: 500 }),
    countByStatusDal(db),
    recentlyChangedDal(db, 5),
    latestSnapshotByNarrative(db),
    growthByNarrative(db),
    latestMetricsByNarrative(db),
    getRecentAlertsDal(db, null, 30),
  ]);

  const items: NarrativeListItem[] = narratives.map((nNar) => {
    const s = snapshots.get(nNar.id);
    const m = metrics.get(nNar.id);
    return {
      narrative: nNar,
      members: s?.memberCount ?? m?.memberCount ?? 0,
      stability: s?.stabilityScore ?? m?.stability ?? 0,
      contradiction: s?.contradictionRatio ?? m?.contradiction ?? 0,
      growth: growth.get(nNar.id) ?? 0,
    };
  });
  const evidenceCountOf = (id: string) => snapshots.get(id)?.evidenceCount ?? 0;
  const actorCountOf = (id: string) => snapshots.get(id)?.actorCount ?? 0;
  const orgCountOf = (id: string) => (metrics.get(id) ? 0 : 0); // ORGANIZATION nodes not yet populated (Phase 66 readiness)
  const sourceDivOf = (id: string) => metrics.get(id)?.sourceDiversity ?? 1;

  const byStatusList = (st: NarrativeStatus) => narratives.filter((nNar) => nNar.status === st);
  const withMembers = items.filter((x) => x.members > 0);

  return {
    total: narratives.length,
    byStatus,
    all: [...items].sort((a, b) => b.members - a.members),
    emerging: byStatusList('emerging').slice(0, 8),
    dominant: byStatusList('dominant').slice(0, 8),
    declining: byStatusList('declining').slice(0, 8),
    recentlyCreated: narratives.slice(0, 5),
    recentlyChanged,
    executive: {
      topNarratives: [...items].sort((a, b) => b.members - a.members).slice(0, 5),
      fastestGrowing: [...items].filter((x) => x.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 5),
      mostStable: [...withMembers].sort((a, b) => b.stability - a.stability).slice(0, 5),
      mostFragmented: [...items].filter((x) => x.narrative.status === 'fragmenting' || x.contradiction >= 0.6).sort((a, b) => b.contradiction - a.contradiction).slice(0, 5),
      mostContested: [...withMembers].sort((a, b) => b.contradiction - a.contradiction).slice(0, 5),
      mostSourceDependent: [...withMembers].sort((a, b) => sourceDivOf(a.narrative.id) - sourceDivOf(b.narrative.id)).slice(0, 5),
      largestEvidenceBase: [...items].sort((a, b) => evidenceCountOf(b.narrative.id) - evidenceCountOf(a.narrative.id)).filter((x) => evidenceCountOf(x.narrative.id) > 0).slice(0, 5),
      largestActorNetwork: [...items].sort((a, b) => actorCountOf(b.narrative.id) - actorCountOf(a.narrative.id)).filter((x) => actorCountOf(x.narrative.id) > 0).slice(0, 5),
      largestOrganizationNetwork: [...items].sort((a, b) => orgCountOf(b.narrative.id) - orgCountOf(a.narrative.id)).filter((x) => orgCountOf(x.narrative.id) > 0).slice(0, 5),
    },
    alerts,
  };
}
