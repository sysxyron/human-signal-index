// =============================================================================
// HSI Phase 65 — Narrative Intelligence service API (SERVER-ONLY). RBAC: reviewer+
// reads, admin mutations. Writes prefer the service-role client (admin recipient
// fan-out for alerts). RLS is the real boundary; gates give clean errors. Never throws.
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { getServiceClient } from '@/lib/admin/guard';
import * as dal from './persistence';
import type { DbResult } from './persistence';
import * as engine from './engine';
import { composeMembers } from './clustering';
import { computeNarrativeHealth, buildTimeline } from './health';
import {
  type Narrative, type NarrativeMember, type NarrativeHealth, type NarrativeTimeline,
  type NarrativeSummary, type NarrativeRelationship, type NarrativeStatus, type MemberComposition,
} from './types';

const BAD_SOURCE_STATES = new Set(['FAILED', 'BLOCKED', 'STALE', 'UNREACHABLE']);

async function ctx() {
  const user = await getUser();
  if (!user) return { ok: false as const, error: 'Sign in to use narrative intelligence.', code: 'AUTH_REQUIRED' as const };
  const db = createClient();
  const role = await loadHighestRole(db, user.id).catch(() => null);
  return { ok: true as const, userId: user.id, db, isReviewer: hasRole(role ?? undefined, 'reviewer'), isAdmin: hasRole(role ?? undefined, 'admin') };
}
async function reviewerCtx() {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isReviewer) return { ok: false as const, error: 'Narrative intelligence is restricted to reviewers and admins.', code: 'FORBIDDEN' as const };
  return c;
}

/** Failing member sources (Phase 63) for a live health read. */
async function countFailingSources(db: ReturnType<typeof createClient>, members: NarrativeMember[]): Promise<number> {
  const sourceNodeIds = members.filter((m) => m.memberType === 'SOURCE').map((m) => m.nodeId);
  if (sourceNodeIds.length === 0) return 0;
  try {
    const entityIds: string[] = [];
    for (let i = 0; i < sourceNodeIds.length; i += 300) {
      const { data } = await db.from('graph_nodes').select('entity_id').in('id', sourceNodeIds.slice(i, i + 300));
      for (const r of (data ?? []) as Array<{ entity_id: string }>) entityIds.push(r.entity_id);
    }
    if (entityIds.length === 0) return 0;
    const { data } = await db.from('source_monitoring_state').select('state').in('source_id', entityIds).limit(5000);
    return ((data ?? []) as Array<{ state: string }>).filter((r) => BAD_SOURCE_STATES.has(r.state)).length;
  } catch { return 0; }
}

// ---- mutations (admin) ------------------------------------------------------

export async function createNarrative(input: { name: string; summary?: string; seedNodeId: string }): Promise<DbResult<engine.NarrativeRunSummary>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Creating narratives is admin-only.', code: 'FORBIDDEN' };
  if (!input.name?.trim()) return { ok: false, error: 'A narrative name is required.', code: 'DB_ERROR' };
  if (!input.seedNodeId?.trim()) return { ok: false, error: 'A seed graph node is required.', code: 'DB_ERROR' };
  const writer = (await getServiceClient()) ?? c.db;
  return engine.createNarrative(writer, c.userId, input);
}

export async function updateNarrative(id: string, patch: { name?: string; summary?: string; status?: NarrativeStatus }): Promise<DbResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Updating narratives is admin-only.', code: 'FORBIDDEN' };
  return dal.updateNarrativeDal(c.db, id, patch);
}

export async function recomputeNarrative(id: string): Promise<DbResult<engine.NarrativeRunSummary>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Recomputing narratives is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  return engine.recomputeNarrative(writer, c.userId, id);
}

// ---- reads (reviewer+) ------------------------------------------------------

export async function getNarrative(id: string): Promise<DbResult<Narrative>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const nar = await dal.getNarrativeDal(c.db, id);
  return nar ? { ok: true, data: nar } : { ok: false, error: 'Narrative not found.', code: 'DB_ERROR' };
}

export async function getNarratives(status?: NarrativeStatus): Promise<DbResult<Narrative[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.listNarrativesDal(c.db, status ? { status } : {}) };
}

export async function getNarrativeMembers(id: string): Promise<DbResult<NarrativeMember[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getMembersDal(c.db, id) };
}

export async function getNarrativeHealth(id: string): Promise<DbResult<{ composition: MemberComposition; health: NarrativeHealth }>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const members = await dal.getMembersDal(c.db, id);
  const composition = composeMembers(members);
  const failing = await countFailingSources(c.db, members);
  return { ok: true, data: { composition, health: computeNarrativeHealth(composition, failing) } };
}

export async function getNarrativeSummary(id: string): Promise<DbResult<NarrativeSummary>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const narrative = await dal.getNarrativeDal(c.db, id);
  if (!narrative) return { ok: false, error: 'Narrative not found.', code: 'DB_ERROR' };
  const members = await dal.getMembersDal(c.db, id);
  const composition = composeMembers(members);
  const failing = await countFailingSources(c.db, members);
  return { ok: true, data: { narrative, composition, health: computeNarrativeHealth(composition, failing), members } };
}

export async function getNarrativeTimeline(id: string): Promise<DbResult<NarrativeTimeline>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: buildTimeline(await dal.getSnapshotsDal(c.db, id, 60)) };
}

export async function getNarrativeRelationships(id: string): Promise<DbResult<NarrativeRelationship[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const all = await dal.readAllMemberships(c.db);
  const mine = all.filter((m) => m.narrativeId === id);
  const myNodes = new Set(mine.map((m) => m.nodeId));
  const mySources = new Set(mine.filter((m) => m.memberType === 'SOURCE').map((m) => m.nodeId));
  const myActors = new Set(mine.filter((m) => m.memberType === 'ACTOR').map((m) => m.nodeId));
  if (myNodes.size === 0) return { ok: true, data: [] };

  const shared = new Map<string, { overlap: number; sources: number; actors: number }>();
  for (const m of all) {
    if (m.narrativeId === id) continue;
    const e = shared.get(m.narrativeId) ?? { overlap: 0, sources: 0, actors: 0 };
    if (myNodes.has(m.nodeId)) e.overlap += 1;
    if (m.memberType === 'SOURCE' && mySources.has(m.nodeId)) e.sources += 1;
    if (m.memberType === 'ACTOR' && myActors.has(m.nodeId)) e.actors += 1;
    shared.set(m.narrativeId, e);
  }
  const names = new Map((await dal.listNarrativesDal(c.db, { limit: 1000 })).map((nNar) => [nNar.id, nNar.name]));
  const out: NarrativeRelationship[] = [];
  for (const [nid, e] of shared) {
    if (e.overlap === 0) continue;
    const relationship: NarrativeRelationship['relationship'] = e.actors > 0 ? 'shares_actors' : e.sources > 0 ? 'shares_sources' : 'overlaps';
    out.push({ narrativeId: nid, name: names.get(nid) ?? 'Narrative', relationship, sharedCount: e.overlap });
  }
  return { ok: true, data: out.sort((a, b) => b.sharedCount - a.sharedCount).slice(0, 20) };
}

export async function searchNarratives(q: string): Promise<DbResult<Narrative[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.searchNarrativesDal(c.db, q) };
}
