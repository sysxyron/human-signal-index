// =============================================================================
// HSI Phase 66 — Agent Automation: shared types + PURE helpers (no I/O).
//
// The agent vocabulary, the canonical Finding model, scheduling math (cadence →
// next run / due check), and success-rate / severity rollups. All deterministic
// and reproducible. PURE: no clocks (callers pass `now`), no DB.
// =============================================================================

import type { NotificationSeverity } from '@/lib/notifications/types';

export const AGENT_KEYS = [
  'SOURCE_HEALTH_AGENT', 'NARRATIVE_WATCH_AGENT', 'GRAPH_ANALYST_AGENT', 'REVIEW_QUEUE_AGENT',
  'PUBLICATION_MONITOR_AGENT', 'TRUST_ANOMALY_AGENT', 'EXECUTIVE_BRIEF_AGENT', 'FORECAST_PREP_AGENT',
  // Phase 67 — forecast validation (validation only, no forecasting).
  'FORECAST_VALIDATION_AGENT',
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const SCHEDULE_CADENCES = ['manual', 'hourly', 'daily', 'weekly', 'disabled'] as const;
export type ScheduleCadence = (typeof SCHEDULE_CADENCES)[number];

export const RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export type RunTrigger = 'manual' | 'scheduled' | 'retry';

export const AGENT_ALERT_TYPES = ['AGENT_ALERT', 'AGENT_FAILURE', 'AGENT_FINDING', 'AGENT_WARNING', 'AGENT_RECOMMENDATION'] as const;
export type AgentAlertType = (typeof AGENT_ALERT_TYPES)[number];

export type FindingSeverity = NotificationSeverity; // INFO | NOTICE | WARNING | CRITICAL

export function isAgentKey(v: unknown): v is AgentKey {
  return typeof v === 'string' && (AGENT_KEYS as readonly string[]).includes(v);
}
export function isScheduleCadence(v: unknown): v is ScheduleCadence {
  return typeof v === 'string' && (SCHEDULE_CADENCES as readonly string[]).includes(v);
}

/** The canonical agent output (Deliverable 16). Every finding is traceable. */
export interface Finding {
  finding: string;
  severity: FindingSeverity;
  category: string;
  evidence: Record<string, unknown>;
  source: string;
}

export interface AgentHandlerResult {
  findings: Finding[];
  actions: string[]; // observable step log
}

export interface Agent {
  agentKey: AgentKey;
  name: string;
  description: string | null;
  category: string | null;
  enabled: boolean;
  cadence: ScheduleCadence;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface AgentRun {
  id: string;
  agentKey: string;
  status: RunStatus;
  trigger: RunTrigger;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  findingsCount: number;
  alertsCount: number;
  error: string | null;
}

export interface AgentMetrics {
  agentKey: string;
  totalRuns: number;
  successes: number;
  failures: number;
  avgDurationMs: number | null;
  lastStatus: string | null;
  lastRunAt: string | null;
  successRate: number;
}

export interface AgentResultRow {
  id: string;
  agentKey: string;
  finding: string;
  severity: FindingSeverity;
  category: string | null;
  source: string | null;
  createdAt: string;
}

// ---- scheduling math (PURE) -------------------------------------------------

const HOUR = 3_600_000;
const DAY = 86_400_000;

export function cadenceMs(cadence: ScheduleCadence): number | null {
  switch (cadence) {
    case 'hourly': return HOUR;
    case 'daily': return DAY;
    case 'weekly': return 7 * DAY;
    default: return null; // manual / disabled — never auto-runs
  }
}

/** Next scheduled run after `fromIso`, or null for manual/disabled. */
export function nextRunAt(cadence: ScheduleCadence, fromIso: string): string | null {
  const ms = cadenceMs(cadence);
  if (ms == null) return null;
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return null;
  return new Date(from + ms).toISOString();
}

/** Is the agent due to run now? manual/disabled are never due. */
export function isDue(cadence: ScheduleCadence, lastRunAtIso: string | null, nowIso: string): boolean {
  const ms = cadenceMs(cadence);
  if (ms == null) return false;
  if (!lastRunAtIso) return true;
  const now = Date.parse(nowIso);
  const last = Date.parse(lastRunAtIso);
  if (Number.isNaN(now) || Number.isNaN(last)) return true;
  return now - last >= ms;
}

export function successRate(successes: number, total: number): number {
  return total <= 0 ? 0 : Math.round((successes / total) * 100);
}

/** Highest severity among findings, or null when there are none. */
export function rollupSeverity(findings: Finding[]): FindingSeverity | null {
  const order: FindingSeverity[] = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'];
  let best = -1;
  for (const f of findings) best = Math.max(best, order.indexOf(f.severity));
  return best < 0 ? null : order[best];
}

/** Findings worth an alert (WARNING / CRITICAL). */
export function alertableFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === 'WARNING' || f.severity === 'CRITICAL');
}
