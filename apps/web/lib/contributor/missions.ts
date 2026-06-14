'use server';

// =============================================================================
// HSI Phase 25 — My Missions (Deliverables 9 & 10). Reads the signed-in user's
// mission instances and computes live progress with the pure engine. Offline →
// demo missions for the user's role. Read-only here; rewards are granted by the
// worker on claim. Never grants a role.
// =============================================================================

import {
  missionsForRole, missionView, missionTemplate, demoMissionProgress, DEMO_NOW,
  type MissionView,
} from '@hsi/contributor-network';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { contributorConfigured, type ContribResult } from './options';

function demoFor(role: string | null): MissionView[] {
  return missionsForRole(role).map((t) =>
    missionView({ template: t, progress: demoMissionProgress[t.id] ?? {}, now: DEMO_NOW }),
  );
}

export async function getMyMissionsAction(): Promise<ContribResult<{ role: string | null; missions: MissionView[] }>> {
  if (!contributorConfigured()) {
    return { ok: true, demo: true, data: { role: 'researcher', missions: demoFor('researcher') } };
  }
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);

    const { data, error } = await db.from('user_missions').select('template_id, progress, status, deadline, claimed_at').eq('user_id', user.id);
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };

    const now = new Date().toISOString();
    const rows = data ?? [];
    let missions: MissionView[];
    if (rows.length === 0) {
      // No instances yet → show the role's templates at zero progress (advisory).
      missions = missionsForRole(role).map((t) => missionView({ template: t, progress: {}, now }));
    } else {
      missions = rows
        .map((r) => {
          const rec = r as { template_id: string; progress: Record<string, number>; claimed_at: string | null; deadline: string | null };
          const t = missionTemplate(rec.template_id);
          if (!t) return null;
          return missionView({ template: t, progress: rec.progress ?? {}, claimed: Boolean(rec.claimed_at), expiredAt: rec.deadline, now });
        })
        .filter((m): m is MissionView => m !== null);
    }
    return { ok: true, data: { role, missions } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}
