'use server';

// =============================================================================
// HSI Phase 70.3 — Source discovery server actions. Admin: CSV import + run
// agents (audited). Reviewer+: approve / reject / request-changes candidates +
// review signal candidates. Nothing auto-activates or auto-publishes. Return
// DbResult; never throw; revalidate on success.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, recordSecurityAudit } from '@/lib/admin/guard';
import * as svc from './service';
import type { DbResult } from './persistence';
import type { ImportSummary, DiscoverySummary, ScoutSummary } from './engine';

export async function reprocessBatchAction(batchId: string): Promise<DbResult<ImportSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.reprocessBatch(batchId);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'SOURCE_IMPORT_REPROCESSED', message: `Batch ${batchId} reprocessed: ${r.data.valid} valid, ${r.data.duplicates} dup.`, metadata: { ...r.data } }); rev(); }
  return r;
}
export async function addSeedAction(category: string, term: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.addSeed(category, term);
  if (r.ok) rev();
  return r;
}
export async function toggleSeedAction(id: string, enabled: boolean): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.toggleSeed(id, enabled);
  if (r.ok) rev();
  return r;
}

const ROUTE = '/dashboard/source-discovery';
function rev(): void { try { revalidatePath(ROUTE); } catch { /* best-effort */ } }

export async function uploadCsvAction(filename: string, csvText: string): Promise<DbResult<ImportSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.importCsv(filename, csvText);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'SOURCE_IMPORT', message: `CSV import: ${r.data.valid} valid, ${r.data.duplicates} duplicate(s).`, metadata: { ...r.data } }); rev(); }
  return r;
}

export async function runDiscoveryAction(): Promise<DbResult<DiscoverySummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.runSourceDiscovery();
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'SOURCE_DISCOVERY_RUN', message: `Source discovery: ${r.data.candidates} candidate(s).`, metadata: { ...r.data } }); rev(); }
  return r;
}

export async function runSignalScoutAction(): Promise<DbResult<ScoutSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.runSignalScout();
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'SIGNAL_SCOUT_RUN', message: `Signal scout: ${r.data.candidates} candidate(s).`, metadata: { ...r.data } }); rev(); }
  return r;
}

// reviewer+ (the candidate_reviews / signal status rows are the audit trail)
export async function approveCandidateAction(id: string, confirmDuplicate = false): Promise<DbResult<{ sourceId: string }>> {
  const r = await svc.approveCandidate(id, confirmDuplicate); if (r.ok) rev(); return r;
}
export async function rejectCandidateAction(id: string, reason: string): Promise<DbResult<{ id: string }>> {
  const r = await svc.rejectCandidate(id, reason); if (r.ok) rev(); return r;
}
export async function requestChangesAction(id: string, reason: string): Promise<DbResult<{ id: string }>> {
  const r = await svc.requestChanges(id, reason); if (r.ok) rev(); return r;
}
export async function reviewSignalCandidateAction(id: string, decision: 'approved' | 'rejected'): Promise<DbResult<{ id: string }>> {
  const r = await svc.reviewSignalCandidate(id, decision); if (r.ok) rev(); return r;
}
