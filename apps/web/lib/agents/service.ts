// =============================================================================
// HSI Phase 66 — Agent service API (SERVER-ONLY). RBAC: reviewer+ reads, admin
// mutations (run / schedule / cancel / retry). Writes prefer the service-role
// client (admin alert fan-out). RLS is the real boundary. Never throws.
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { getServiceClient } from '@/lib/admin/guard';
import * as dal from './persistence';
import type { DbResult } from './persistence';
import { runAgent as engineRun, type AgentRunSummary } from './engine';
import { isScheduleCadence, type Agent, type AgentRun, type AgentMetrics, type AgentResultRow, type ScheduleCadence } from './types';

async function ctx() {
  const user = await getUser();
  if (!user) return { ok: false as const, error: 'Sign in to use agents.', code: 'AUTH_REQUIRED' as const };
  const db = createClient();
  const role = await loadHighestRole(db, user.id).catch(() => null);
  return { ok: true as const, userId: user.id, db, isReviewer: hasRole(role ?? undefined, 'reviewer'), isAdmin: hasRole(role ?? undefined, 'admin') };
}
async function reviewerCtx() {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isReviewer) return { ok: false as const, error: 'Agents are restricted to reviewers and admins.', code: 'FORBIDDEN' as const };
  return c;
}

// ---- mutations (admin) ------------------------------------------------------

export async function runAgent(agentKey: string): Promise<DbResult<AgentRunSummary>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Running agents is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  return engineRun(writer, agentKey, 'manual', c.userId);
}

export async function retryAgent(agentKey: string): Promise<DbResult<AgentRunSummary>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Retrying agents is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  return engineRun(writer, agentKey, 'retry', c.userId);
}

export async function scheduleAgent(agentKey: string, cadence: string): Promise<DbResult<{ agentKey: string; cadence: ScheduleCadence }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Scheduling agents is admin-only.', code: 'FORBIDDEN' };
  if (!isScheduleCadence(cadence)) return { ok: false, error: 'Invalid cadence.', code: 'DB_ERROR' };
  const writer = (await getServiceClient()) ?? c.db;
  await dal.setSchedule(writer, agentKey, cadence);
  return { ok: true, data: { agentKey, cadence } };
}

export async function cancelAgent(agentKey: string): Promise<DbResult<{ agentKey: string }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Cancelling agents is admin-only.', code: 'FORBIDDEN' };
  const writer = (await getServiceClient()) ?? c.db;
  await dal.setSchedule(writer, agentKey, 'disabled');
  await dal.cancelQueuedJobs(writer, agentKey);
  return { ok: true, data: { agentKey } };
}

// ---- reads (reviewer+) ------------------------------------------------------

export async function getAgents(): Promise<DbResult<Agent[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.listAgents(c.db) };
}

export async function getAgent(agentKey: string): Promise<DbResult<Agent>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const a = await dal.getAgentDal(c.db, agentKey);
  return a ? { ok: true, data: a } : { ok: false, error: 'Agent not found.', code: 'DB_ERROR' };
}

export async function getAgentRuns(agentKey: string, limit = 50): Promise<DbResult<AgentRun[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getRunsDal(c.db, agentKey, limit) };
}

export async function getAgentMetrics(agentKey: string): Promise<DbResult<AgentMetrics | null>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: (await dal.listMetricsDal(c.db)).get(agentKey) ?? null };
}

export async function getAgentResults(agentKey: string, limit = 60): Promise<DbResult<AgentResultRow[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getResultsDal(c.db, agentKey, limit) };
}

export async function getAgentAlerts(agentKey: string, limit = 50): Promise<DbResult<dal.AgentAlertRow[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getAlertsDal(c.db, agentKey, limit) };
}
