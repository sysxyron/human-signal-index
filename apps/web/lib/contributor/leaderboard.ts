'use server';

// =============================================================================
// HSI Phase 25 — leaderboards (Deliverable 21). QUALITY-WEIGHTED: ranks on
// accepted contributions + reputation, never raw submissions, so spam can't
// climb. Reads the latest worker-computed snapshot; offline (or no snapshot yet)
// → computes from demo data with the pure engine. Read-only.
// =============================================================================

import {
  rankContributors, rankTeams, demoContributors, demoTeams,
  type LeaderboardRow, type LeaderboardView,
} from '@hsi/contributor-network';
import { createClient } from '@/lib/supabase/server';
import { contributorConfigured, type ContribResult } from './options';

const VIEWS: LeaderboardView[] = ['top_contributors', 'top_researchers', 'top_reviewers', 'top_curators', 'top_teams'];

function computeDemo(view: LeaderboardView): LeaderboardRow[] {
  return view === 'top_teams' ? rankTeams(demoTeams) : rankContributors(demoContributors, view);
}

export async function getLeaderboardAction(view: string = 'top_contributors'): Promise<ContribResult<{ view: LeaderboardView; rows: LeaderboardRow[] }>> {
  const v: LeaderboardView = (VIEWS as string[]).includes(view) ? (view as LeaderboardView) : 'top_contributors';
  if (!contributorConfigured()) {
    return { ok: true, demo: true, data: { view: v, rows: computeDemo(v) } };
  }
  try {
    const db = createClient();
    const { data, error } = await db
      .from('leaderboard_snapshots')
      .select('rows, computed_at')
      .eq('view', v)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    const rows = (data as { rows?: LeaderboardRow[] } | null)?.rows;
    if (!rows || rows.length === 0) {
      // No snapshot computed yet → show demo so the page is never blank (labelled).
      return { ok: true, demo: true, data: { view: v, rows: computeDemo(v) } };
    }
    return { ok: true, data: { view: v, rows } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}
