// =============================================================================
// HSI Phase 66 — Agent engine (SERVER-ONLY). runAgent() executes one agent's
// deterministic handler and records EVERYTHING: a run, its action log, its
// findings, any alerts (via Phase 62), and rolled-up metrics. Failures are
// captured as failed runs + an AGENT_FAILURE alert (visible to monitoring).
// Agents never publish, review, moderate, or score truth. NEVER throws.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAgentDefinition } from './registry';
import { HANDLERS } from './handlers';
import { alertableFindings, type RunTrigger, type AgentAlertType } from './types';
import * as dal from './persistence';

export interface AgentRunSummary { runId: string | null; status: 'succeeded' | 'failed'; findings: number; alerts: number }

const MAX_ALERTS_PER_RUN = 10;

function alertTypeFor(category: string, severity: string): AgentAlertType {
  if (severity === 'CRITICAL') return 'AGENT_ALERT';
  if (/recommend|imbalance/.test(category)) return 'AGENT_RECOMMENDATION';
  return 'AGENT_WARNING';
}

export async function runAgent(writer: SupabaseClient, agentKey: string, trigger: RunTrigger, actorId: string | null): Promise<dal.DbResult<AgentRunSummary>> {
  const def = getAgentDefinition(agentKey);
  if (!def) return { ok: false, error: `Unknown agent: ${agentKey}`, code: 'DB_ERROR' };
  const handler = HANDLERS[def.key];
  const start = Date.now();
  const runId = await dal.createRun(writer, agentKey, trigger, actorId);
  if (!runId) return { ok: false, error: 'Could not start the agent run.', code: 'DB_ERROR' };

  const recipients = await dal.listAdminUserIds(writer);
  const targets = recipients.length ? recipients : (actorId ? [actorId] : []);

  try {
    const result = await handler(writer);
    await dal.insertActions(writer, runId, agentKey, result.actions);
    await dal.insertResults(writer, runId, agentKey, result.findings);

    const alertable = alertableFindings(result.findings).slice(0, MAX_ALERTS_PER_RUN);
    let alertsCount = 0;
    for (const fnd of alertable) {
      const alertId = await dal.insertAlertDal(writer, agentKey, runId, alertTypeFor(fnd.category, fnd.severity), fnd.severity, fnd.finding, fnd.evidence);
      let firstNotif: string | null = null;
      for (const r of targets) {
        const id = await dal.emitNotification(writer, r, actorId, fnd.severity, `${def.name}: ${fnd.finding}`, fnd.finding, { agentKey, category: fnd.category });
        if (id && !firstNotif) firstNotif = id;
      }
      if (alertId && firstNotif) await dal.linkAlertNotification(writer, alertId, firstNotif);
      alertsCount += 1;
    }

    await dal.finishRun(writer, runId, { status: 'succeeded', durationMs: Date.now() - start, findingsCount: result.findings.length, alertsCount });
    const agent = await dal.getAgentDal(writer, agentKey);
    if (agent) await dal.setSchedule(writer, agentKey, agent.cadence, new Date().toISOString());
    await dal.updateMetrics(writer, agentKey);
    return { ok: true, data: { runId, status: 'succeeded', findings: result.findings.length, alerts: alertsCount } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await dal.finishRun(writer, runId, { status: 'failed', durationMs: Date.now() - start, findingsCount: 0, alertsCount: 1, error: msg });
    const alertId = await dal.insertAlertDal(writer, agentKey, runId, 'AGENT_FAILURE', 'WARNING', `Agent failed: ${msg}`, { error: msg });
    let firstNotif: string | null = null;
    for (const r of targets) { const id = await dal.emitNotification(writer, r, actorId, 'WARNING', `${def.name} failed`, msg, { agentKey, failure: true }); if (id && !firstNotif) firstNotif = id; }
    if (alertId && firstNotif) await dal.linkAlertNotification(writer, alertId, firstNotif);
    await dal.updateMetrics(writer, agentKey);
    return { ok: true, data: { runId, status: 'failed', findings: 0, alerts: 1 } };
  }
}
