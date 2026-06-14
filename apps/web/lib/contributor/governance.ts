'use server';

// =============================================================================
// HSI Phase 25 — governance queue (Deliverable 18). Surfaces escalated /
// in-governance investigations for reviewer+/curator/admin. Read-only list here;
// decisions are recorded via governanceDecisionAction (investigations.ts) with a
// required rationale. Offline → demo. Never publishes or changes governance logic.
// =============================================================================

import type { InvestigationRow } from '@hsi/shared-types';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { contributorConfigured, type ContribResult } from './options';

const DEMO_QUEUE: InvestigationRow[] = [
  { id: 'demo-3', title: 'Escalated: sensitive claim (demo)', summary: 'Claim with potential legal exposure; escalated for governance review.', status: 'escalated', priority: 'critical', ownerId: null, teamId: 't2', createdBy: 'demo-reviewer', createdAt: '2026-06-10T08:00:00Z', updatedAt: '2026-06-13T08:00:00Z' },
  { id: 'demo-5', title: 'Publication dispute (demo)', summary: 'Two reviewers disagree on publication risk.', status: 'governance', priority: 'high', ownerId: 'demo-curator', teamId: 't3', createdBy: 'demo-curator', createdAt: '2026-06-11T08:00:00Z', updatedAt: '2026-06-13T10:00:00Z' },
];

export async function getGovernanceQueueAction(): Promise<ContribResult<InvestigationRow[]>> {
  if (!contributorConfigured()) return { ok: true, demo: true, data: DEMO_QUEUE };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, 'reviewer')) return { ok: false, code: 'FORBIDDEN' };
    const { data, error } = await db.from('investigations').select('*').in('status', ['escalated', 'governance']).order('updated_at', { ascending: false });
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    const rows: InvestigationRow[] = (data ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        id: String(rec.id), title: String(rec.title), summary: (rec.summary as string) ?? null,
        status: rec.status as InvestigationRow['status'], priority: rec.priority as InvestigationRow['priority'],
        ownerId: (rec.owner_id as string) ?? null, teamId: (rec.team_id as string) ?? null,
        createdBy: (rec.created_by as string) ?? null, createdAt: String(rec.created_at), updatedAt: (rec.updated_at as string) ?? null,
      };
    });
    return { ok: true, data: rows };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}
