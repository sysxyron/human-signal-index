// =============================================================================
// HSI Phase 66 — Agent dashboard data (SERVER-ONLY, read). Registered agents +
// health + recent runs + alerts + execution metrics, computed from persisted
// data. Reviewer+ via RLS. Never throws.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { listAgents, listMetricsDal, getRunsDal, getAlertsDal, type AgentAlertRow } from './persistence';
import type { Agent, AgentRun, AgentMetrics } from './types';

export interface AgentDashboardItem { agent: Agent; metrics: AgentMetrics | null; healthy: boolean }

export interface AgentsDashboard {
  agents: AgentDashboardItem[];
  totals: { registered: number; scheduled: number; healthy: number; failing: number; totalRuns: number };
  recentRuns: AgentRun[];
  alerts: AgentAlertRow[];
}

export async function getAgentsDashboard(): Promise<AgentsDashboard> {
  const db = createClient();
  const [agents, metrics, recentRuns, alerts] = await Promise.all([
    listAgents(db), listMetricsDal(db), getRunsDal(db, null, 30), getAlertsDal(db, null, 30),
  ]);

  const items: AgentDashboardItem[] = agents.map((agent) => {
    const m = metrics.get(agent.agentKey) ?? null;
    // healthy = no runs yet, or last run succeeded and success rate ≥ 80%.
    const healthy = !m || m.totalRuns === 0 ? true : (m.lastStatus !== 'failed' && m.successRate >= 80);
    return { agent, metrics: m, healthy };
  });

  return {
    agents: items,
    totals: {
      registered: agents.length,
      scheduled: agents.filter((a) => a.cadence !== 'manual' && a.cadence !== 'disabled').length,
      healthy: items.filter((i) => i.healthy).length,
      failing: items.filter((i) => !i.healthy).length,
      totalRuns: Array.from(metrics.values()).reduce((sum, m) => sum + m.totalRuns, 0),
    },
    recentRuns,
    alerts,
  };
}
