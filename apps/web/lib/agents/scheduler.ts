// =============================================================================
// HSI Phase 66 — Agent scheduler (SERVER-ONLY). Reuses the existing cron pattern
// (no external scheduler changes): a protected route calls runDueAgents(), which
// runs every enabled agent whose cadence is due (manual/disabled never run). Pure
// due-checking lives in ./types (isDue) — this just orchestrates the runs.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { isDue } from './types';
import { listAgents } from './persistence';
import { runAgent } from './engine';

export interface SchedulerSummary { evaluated: number; ran: string[]; due: number }

export async function runDueAgents(writer: SupabaseClient, nowIso: string, actorId: string | null): Promise<SchedulerSummary> {
  const agents = await listAgents(writer);
  const due = agents.filter((a) => a.enabled && isDue(a.cadence, a.lastRunAt, nowIso));
  const ran: string[] = [];
  for (const a of due) {
    const r = await runAgent(writer, a.agentKey, 'scheduled', actorId);
    if (r.ok) ran.push(a.agentKey);
  }
  return { evaluated: agents.length, ran, due: due.length };
}
