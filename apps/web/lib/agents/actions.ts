'use server';

// =============================================================================
// HSI Phase 66 — Agent server actions. Admin mutations (run / retry / schedule /
// cancel) reuse the IAM guard for audit; the RBAC-enforcing service does the work.
// Return DbResult; never throw; revalidate on success. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, recordSecurityAudit } from '@/lib/admin/guard';
import * as svc from './service';
import type { DbResult } from './persistence';
import type { AgentRunSummary } from './engine';

const ROUTE = '/dashboard/agents';
function rev(): void { try { revalidatePath(ROUTE); } catch { /* best-effort */ } }

export async function runAgentAction(agentKey: string): Promise<DbResult<AgentRunSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.runAgent(agentKey);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'AGENT_RUN', message: `Agent ${agentKey} run: ${r.data.status} (${r.data.findings} findings, ${r.data.alerts} alerts).`, metadata: { agentKey, ...r.data } }); rev(); }
  return r;
}

export async function retryAgentAction(agentKey: string): Promise<DbResult<AgentRunSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.retryAgent(agentKey);
  if (r.ok) rev();
  return r;
}

export async function scheduleAgentAction(agentKey: string, cadence: string): Promise<DbResult<{ agentKey: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.scheduleAgent(agentKey, cadence);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'AGENT_SCHEDULED', message: `Agent ${agentKey} cadence → ${cadence}.`, metadata: { agentKey, cadence } }); rev(); }
  return r;
}

export async function cancelAgentAction(agentKey: string): Promise<DbResult<{ agentKey: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.cancelAgent(agentKey);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'AGENT_CANCELLED', message: `Agent ${agentKey} scheduling cancelled.`, metadata: { agentKey } }); rev(); }
  return r;
}
