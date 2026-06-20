// =============================================================================
// HSI Phase 70.3 — Source discovery service API (SERVER-ONLY). RBAC: reviewer+
// read + review (approve/reject candidates); admin import CSV + run agents. Writes
// prefer the service-role client. RLS is the boundary. Never throws.
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { getServiceClient } from '@/lib/admin/guard';
import * as dal from './persistence';
import type { DbResult } from './persistence';
import * as engine from './engine';
import type { CandidateStatus } from './types';

async function ctx() {
  const user = await getUser();
  if (!user) return { ok: false as const, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' as const };
  const db = createClient();
  const role = await loadHighestRole(db, user.id).catch(() => null);
  return { ok: true as const, userId: user.id, db, isReviewer: hasRole(role ?? undefined, 'reviewer'), isAdmin: hasRole(role ?? undefined, 'admin') };
}
async function reviewerCtx() {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isReviewer) return { ok: false as const, error: 'Source discovery is restricted to reviewers and admins.', code: 'FORBIDDEN' as const };
  return c;
}

// ---- reads (reviewer+) ------------------------------------------------------

export async function getCandidates(status: CandidateStatus | null = null) {
  const c = await reviewerCtx(); if (!c.ok) return c;
  return { ok: true as const, data: await dal.listCandidatesDal(c.db, status) };
}
export async function getSignalCandidates(status: string | null = null) {
  const c = await reviewerCtx(); if (!c.ok) return c;
  return { ok: true as const, data: await dal.listSignalCandidatesDal(c.db, status) };
}

// ---- review actions (reviewer+) --------------------------------------------

export async function approveCandidate(id: string, confirmDuplicate = false): Promise<DbResult<{ sourceId: string }>> {
  const c = await reviewerCtx(); if (!c.ok) return c;
  const writer = (await getServiceClient()) ?? c.db;
  return engine.approveCandidate(writer, c.userId, id, { confirmDuplicate });
}
export async function rejectCandidate(id: string, reason: string): Promise<DbResult<{ id: string }>> {
  const c = await reviewerCtx(); if (!c.ok) return c;
  const writer = (await getServiceClient()) ?? c.db;
  return engine.rejectCandidate(writer, c.userId, id, reason);
}
export async function requestChanges(id: string, reason: string): Promise<DbResult<{ id: string }>> {
  const c = await reviewerCtx(); if (!c.ok) return c;
  const writer = (await getServiceClient()) ?? c.db;
  return engine.requestChangesCandidate(writer, c.userId, id, reason);
}
export async function reviewSignalCandidate(id: string, decision: 'approved' | 'rejected'): Promise<DbResult<{ id: string }>> {
  const c = await reviewerCtx(); if (!c.ok) return c;
  const writer = (await getServiceClient()) ?? c.db;
  await dal.setSignalCandidateStatus(writer, id, decision, c.userId);
  return { ok: true, data: { id } };
}

// ---- admin (import + agents) -----------------------------------------------

export async function importCsv(filename: string, csvText: string): Promise<DbResult<engine.ImportSummary>> {
  const c = await ctx(); if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'CSV import is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  return engine.importBatch(writer, c.userId, { filename, csvText });
}
export async function runSourceDiscovery(): Promise<DbResult<engine.DiscoverySummary>> {
  const c = await ctx(); if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Running discovery is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  return { ok: true, data: await engine.runSourceDiscovery(writer, c.userId, 'manual') };
}
export async function runSignalScout(): Promise<DbResult<engine.ScoutSummary>> {
  const c = await ctx(); if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Running signal scout is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  return { ok: true, data: await engine.runSignalScout(writer, c.userId) };
}

export async function reprocessBatch(batchId: string): Promise<DbResult<engine.ImportSummary>> {
  const c = await ctx(); if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Reprocessing is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  return engine.reprocessBatch(writer, c.userId, batchId);
}

export async function addSeed(category: string, term: string): Promise<DbResult<{ id: string }>> {
  const c = await ctx(); if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Managing seeds is admin-only.', code: 'FORBIDDEN' };
  if (!category.trim() || !term.trim()) return { ok: false, error: 'Category and seed term are required.', code: 'DB_ERROR' };
  const writer = (await getServiceClient()) ?? c.db;
  return dal.insertSeedDal(writer, category.trim(), term.trim(), c.userId);
}
export async function toggleSeed(id: string, enabled: boolean): Promise<DbResult<{ id: string }>> {
  const c = await ctx(); if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Managing seeds is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  await dal.toggleSeedDal(writer, id, enabled);
  return { ok: true, data: { id } };
}
