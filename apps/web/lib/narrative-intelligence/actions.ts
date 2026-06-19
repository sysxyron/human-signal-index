'use server';

// =============================================================================
// HSI Phase 65 — Narrative server actions. Admin mutations (create / recompute /
// update) reuse the IAM guard for audit; the RBAC-enforcing service does the work.
// Return DbResult; never throw; revalidate on success. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, recordSecurityAudit } from '@/lib/admin/guard';
import * as svc from './service';
import type { DbResult } from './persistence';
import type { NarrativeStatus } from './types';
import type { NarrativeRunSummary } from './engine';

const ROUTE = '/dashboard/narratives';
function rev(): void { try { revalidatePath(ROUTE); } catch { /* best-effort */ } }

export async function createNarrativeAction(input: { name: string; summary?: string; seedNodeId: string }): Promise<DbResult<NarrativeRunSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.createNarrative(input);
  if (r.ok) {
    await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'NARRATIVE_CREATED', message: `Narrative created: ${input.name} (${r.data.members} members).`, metadata: { ...r.data } });
    rev();
  }
  return r;
}

export async function recomputeNarrativeAction(id: string): Promise<DbResult<NarrativeRunSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.recomputeNarrative(id);
  if (r.ok) {
    await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'NARRATIVE_RECOMPUTED', message: `Narrative recomputed: ${id} → ${r.data.status} (${r.data.members} members).`, metadata: { ...r.data } });
    rev();
  }
  return r;
}

export async function updateNarrativeAction(id: string, patch: { name?: string; summary?: string; status?: NarrativeStatus }): Promise<DbResult<{ id: string }>> {
  const r = await svc.updateNarrative(id, patch);
  if (r.ok) rev();
  return r;
}
