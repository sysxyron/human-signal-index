// =============================================================================
// HSI Phase 8 — client-safe view helpers for the Operations console + Narrative
// graph UI.
//
// PURE + CLIENT-SAFE: no server-only imports (no next/headers, no Supabase
// server client, no actions). These map Phase-8 domain unions → color/label,
// describe cron expressions, compute SLA state colors, format throughput, and
// derive clearly-LABELED demo view-models from the @hsi/source-intelligence
// Phase-8 defaults so the operations console + graph render fully offline when an
// action returns NOT_CONFIGURED.
// =============================================================================

import type {
  HsinJobAttemptRecord,
  HsinJobQueueRecord,
  HsinNarrativeEdgeRecord,
  HsinNarrativeRecord,
  HsinEntityRecord,
  HsinProviderRateLimitRecord,
  HsinSchedulerRuleRecord,
  HsinSignalEntityRecord,
  HsinSignalNarrativeRecord,
  HsinSlaPolicyRecord,
  HsinTriageRuleRecord,
  JobStatus,
  NarrativeEdgeType,
  NarrativeGraphData,
  OperationsOverview,
  SlaSeverity,
} from '@hsi/shared-types';
import {
  DEFAULT_SLA_POLICIES,
  DEFAULT_TRIAGE_RULES,
} from '@hsi/source-intelligence';

/* -------------------------------------------------------------------------- */
/* Role gating (pure — safe in client + server). Roles cascade by privilege.   */
/* -------------------------------------------------------------------------- */

const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  contributor: 1,
  researcher: 2,
  reviewer: 3,
  editor: 3,
  curator: 4,
  admin: 5,
  owner: 6,
};

function rank(role?: string | null): number {
  if (!role) return -1;
  return ROLE_RANK[role.toLowerCase()] ?? -1;
}

/** Curator or above — can toggle/create scheduler rules + retry/cancel jobs. */
export function canOperate(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/** Researcher or above — can rebuild the narrative graph + run captures. */
export function canBuildGraph(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/* -------------------------------------------------------------------------- */
/* Color / tone vocabulary (shared with the @hsi/ui token palette)            */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'orange' | 'red';

export interface Decorated {
  label: string;
  color: string;
  tone: Tone;
}

const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
};

export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}

/* -------------------------------------------------------------------------- */
/* Job status                                                                  */
/* -------------------------------------------------------------------------- */

export function jobStatusDecor(status: JobStatus | string): Decorated {
  switch (status) {
    case 'queued':
      return { label: 'Queued', color: TONE_COLORS.blue, tone: 'blue' };
    case 'running':
      return { label: 'Running', color: TONE_COLORS.purple, tone: 'purple' };
    case 'completed':
      return { label: 'Completed', color: TONE_COLORS.green, tone: 'green' };
    case 'failed':
      return { label: 'Failed', color: TONE_COLORS.red, tone: 'red' };
    case 'retrying':
      return { label: 'Retrying', color: TONE_COLORS.orange, tone: 'orange' };
    case 'cancelled':
      return { label: 'Cancelled', color: TONE_COLORS.neutral, tone: 'neutral' };
    default:
      return { label: titleize(String(status)), color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

/** A single attempt's status (free-form text column). */
export function attemptStatusDecor(status?: string): Decorated {
  const s = (status ?? 'unknown').toLowerCase();
  if (s === 'success' || s === 'completed' || s === 'ok') {
    return { label: titleize(s), color: TONE_COLORS.green, tone: 'green' };
  }
  if (s === 'failed' || s === 'error') {
    return { label: titleize(s), color: TONE_COLORS.red, tone: 'red' };
  }
  if (s === 'running' || s === 'started') {
    return { label: titleize(s), color: TONE_COLORS.purple, tone: 'purple' };
  }
  return { label: titleize(s), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* Narrative-graph edge types                                                  */
/* -------------------------------------------------------------------------- */

interface EdgeDecor extends Decorated {
  edgeType: NarrativeEdgeType;
  description: string;
}

const EDGE_DECOR: Record<NarrativeEdgeType, EdgeDecor> = {
  related_to: {
    edgeType: 'related_to',
    label: 'Related to',
    color: '#64748B', // slate
    tone: 'neutral',
    description: 'Shares themes/terms with another narrative.',
  },
  contradicts: {
    edgeType: 'contradicts',
    label: 'Contradicts',
    color: '#EF4444', // red
    tone: 'red',
    description: 'Asserts something opposed to another narrative.',
  },
  amplifies: {
    edgeType: 'amplifies',
    label: 'Amplifies',
    color: '#F59E0B', // orange
    tone: 'orange',
    description: 'Reinforces or boosts another narrative.',
  },
  evolves_into: {
    edgeType: 'evolves_into',
    label: 'Evolves into',
    color: '#3B82F6', // blue
    tone: 'blue',
    description: 'Develops over time into another narrative.',
  },
  derived_from: {
    edgeType: 'derived_from',
    label: 'Derived from',
    color: '#8B5CF6', // purple
    tone: 'purple',
    description: 'Originates from / is a variant of another narrative.',
  },
  co_occurs_with: {
    edgeType: 'co_occurs_with',
    label: 'Co-occurs with',
    color: '#10B981', // green
    tone: 'green',
    description: 'Frequently appears alongside another narrative.',
  },
};

const EDGE_FALLBACK: EdgeDecor = {
  edgeType: 'related_to',
  label: 'Related',
  color: '#64748B',
  tone: 'neutral',
  description: 'Relationship between narratives.',
};

export function edgeTypeDecor(type: NarrativeEdgeType | string): EdgeDecor {
  return EDGE_DECOR[type as NarrativeEdgeType] ?? { ...EDGE_FALLBACK, label: titleize(String(type)) };
}

/** Color used to draw an edge of a given type. */
export function edgeTypeColor(type: NarrativeEdgeType | string): string {
  return edgeTypeDecor(type).color;
}

/** The full ordered list of edge decorations for the legend. */
export function edgeTypeLegend(): EdgeDecor[] {
  return [
    EDGE_DECOR.related_to,
    EDGE_DECOR.contradicts,
    EDGE_DECOR.amplifies,
    EDGE_DECOR.evolves_into,
    EDGE_DECOR.derived_from,
    EDGE_DECOR.co_occurs_with,
  ];
}

/* -------------------------------------------------------------------------- */
/* Entity types                                                                */
/* -------------------------------------------------------------------------- */

const ENTITY_TYPE_TONES: Record<string, Tone> = {
  person: 'blue',
  organization: 'purple',
  movement: 'orange',
  ideology: 'red',
  topic: 'green',
  place: 'blue',
  platform: 'purple',
  publication: 'green',
  unknown: 'neutral',
};

export function entityTypeDecor(type?: string): Decorated {
  const key = String(type ?? 'unknown');
  const tone = ENTITY_TYPE_TONES[key] ?? 'neutral';
  return { label: titleize(key), color: TONE_COLORS[tone], tone };
}

/* -------------------------------------------------------------------------- */
/* SLA state                                                                   */
/* -------------------------------------------------------------------------- */

export type SlaState =
  | 'on_track'
  | 'due_soon'
  | 'overdue_review'
  | 'overdue_escalation';

export function slaStateDecor(state: SlaState | string): Decorated {
  switch (state) {
    case 'on_track':
      return { label: 'On track', color: TONE_COLORS.green, tone: 'green' };
    case 'due_soon':
      return { label: 'Due soon', color: TONE_COLORS.orange, tone: 'orange' };
    case 'overdue_review':
      return { label: 'Overdue review', color: TONE_COLORS.red, tone: 'red' };
    case 'overdue_escalation':
      return { label: 'Overdue escalation', color: '#B91C1C', tone: 'red' };
    default:
      return { label: titleize(String(state)), color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

export function slaSeverityDecor(severity?: SlaSeverity | string): Decorated {
  switch (severity) {
    case 'CRITICAL':
      return { label: 'Critical', color: '#B91C1C', tone: 'red' };
    case 'HIGH':
      return { label: 'High', color: TONE_COLORS.red, tone: 'red' };
    case 'MEDIUM':
      return { label: 'Medium', color: TONE_COLORS.orange, tone: 'orange' };
    case 'LOW':
      return { label: 'Low', color: TONE_COLORS.blue, tone: 'blue' };
    default:
      return { label: '—', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

/* -------------------------------------------------------------------------- */
/* Cron → human description (tiny best-effort formatter; falls back to raw)    */
/* -------------------------------------------------------------------------- */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Describe a 5-field cron expression (minute hour day-of-month month day-of-week)
 * in plain English for the common cases; otherwise returns the raw expression.
 */
export function describeCron(expr?: string): string {
  if (!expr || !expr.trim()) return '—';
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  const everyN = (field: string): number | null => {
    const m = field.match(/^\*\/(\d+)$/);
    return m ? Number(m[1]) : null;
  };

  // Every N minutes.
  const minStep = everyN(min);
  if (minStep && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${minStep} minute${minStep === 1 ? '' : 's'}`;
  }
  // Hourly variants.
  const hourStep = everyN(hour);
  if (hourStep && dom === '*' && mon === '*' && dow === '*') {
    const at = min === '0' ? '' : ` at minute ${min}`;
    return `Every ${hourStep} hour${hourStep === 1 ? '' : 's'}${at}`;
  }
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return 'Every hour';
  }
  // Daily at a fixed time.
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    mon === '*' &&
    dow === '*'
  ) {
    return `Daily at ${pad(hour)}:${pad(min)} UTC`;
  }
  // Weekly at a fixed time on a single weekday.
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    mon === '*' &&
    /^\d+$/.test(dow)
  ) {
    const day = DOW[Number(dow) % 7] ?? `day ${dow}`;
    return `Weekly on ${day} at ${pad(hour)}:${pad(min)} UTC`;
  }
  return expr;
}

function pad(v: string): string {
  return v.length < 2 ? `0${v}` : v;
}

/* -------------------------------------------------------------------------- */
/* Date formatting (mirrors lib/signals/view conventions)                      */
/* -------------------------------------------------------------------------- */

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function relativeTime(iso?: string, now: number = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = now - t;
  const abs = Math.abs(diff);
  const past = diff >= 0;
  const mins = Math.round(abs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return rel(mins, 'min', past);
  const hours = Math.round(mins / 60);
  if (hours < 24) return rel(hours, 'h', past);
  const days = Math.round(hours / 24);
  if (days < 30) return rel(days, 'd', past);
  const months = Math.round(days / 30);
  if (months < 12) return rel(months, 'mo', past);
  return rel(Math.round(months / 12), 'y', past);
}

function rel(n: number, unit: string, past: boolean): string {
  const body = `${n}${unit}`;
  return past ? `${body} ago` : `in ${body}`;
}

/** Duration between two ISO timestamps, human-readable. '—' when incomplete. */
export function formatDuration(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return '—';
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return '—';
  const ms = Math.max(0, b - a);
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(secs < 10 ? 1 : 0)}s`;
  const mins = secs / 60;
  if (mins < 60) return `${mins.toFixed(1)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

/* -------------------------------------------------------------------------- */
/* Misc string helpers                                                         */
/* -------------------------------------------------------------------------- */

export function titleize(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function excerpt(text?: string, max = 200): string {
  if (!text) return '';
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/* -------------------------------------------------------------------------- */
/* Chart adapters                                                              */
/* -------------------------------------------------------------------------- */

export function toCountSeries(points: { date: string; count: number }[]): number[] {
  return points.map((p) => p.count);
}

export function seriesXLabels(
  points: { date: string; count: number }[],
): string[] {
  if (points.length === 0) return [];
  const fmt = (d: string) => d.slice(5);
  if (points.length <= 2) return points.map((p) => fmt(p.date));
  const mid = Math.floor(points.length / 2);
  return [fmt(points[0].date), fmt(points[mid].date), fmt(points[points.length - 1].date)];
}

/* -------------------------------------------------------------------------- */
/* Provider rate-limit helpers                                                 */
/* -------------------------------------------------------------------------- */

/** Fraction of the rate-limit budget remaining in [0,1], or null if unknown. */
export function rateLimitFraction(r: HsinProviderRateLimitRecord): number | null {
  if (r.max_requests == null || r.max_requests <= 0) return null;
  if (r.remaining_requests == null) return null;
  return Math.max(0, Math.min(1, r.remaining_requests / r.max_requests));
}

export function rateLimitDecor(r: HsinProviderRateLimitRecord): Decorated {
  const f = rateLimitFraction(r);
  if (f == null) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  if (f <= 0.1) return { label: 'Exhausted', color: TONE_COLORS.red, tone: 'red' };
  if (f <= 0.3) return { label: 'Low', color: TONE_COLORS.orange, tone: 'orange' };
  return { label: 'Healthy', color: TONE_COLORS.green, tone: 'green' };
}

/* -------------------------------------------------------------------------- */
/* Source-health helpers (re-used by operations summary)                       */
/* -------------------------------------------------------------------------- */

export function sourceHealthDecor(status?: string): Decorated {
  const s = (status ?? 'unknown').toLowerCase();
  if (s === 'healthy' || s === 'ok' || s === 'up' || s === 'active') {
    return { label: titleize(s), color: TONE_COLORS.green, tone: 'green' };
  }
  if (s === 'degraded' || s === 'slow' || s === 'paused') {
    return { label: titleize(s), color: TONE_COLORS.orange, tone: 'orange' };
  }
  if (s === 'failing' || s === 'down' || s === 'error' || s === 'disabled') {
    return { label: titleize(s), color: TONE_COLORS.red, tone: 'red' };
  }
  return { label: titleize(s), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — Phase-8 defaults → view-models, ALWAYS labeled "Demo"        */
/* -------------------------------------------------------------------------- */

const DEMO_NOW = '2026-01-01T00:00:00.000Z';

function demoSeries(counts: number[]): { date: string; count: number }[] {
  const today = new Date(DEMO_NOW).getTime();
  const day = 86400000;
  return counts.map((count, i) => ({
    date: new Date(today - (counts.length - 1 - i) * day).toISOString().slice(0, 10),
    count,
  }));
}

function iso(offsetMins: number): string {
  return new Date(Date.parse(DEMO_NOW) + offsetMins * 60000).toISOString();
}

/** Demo scheduler rules. */
export function demoSchedulerRules(): HsinSchedulerRuleRecord[] {
  return [
    {
      id: 'sched_demo_1',
      source_id: 'src_demo_movement_wiki',
      job_type: 'capture',
      cron_expression: '0 * * * *',
      enabled: true,
      next_run_at: iso(60),
      last_run_at: iso(-15),
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'sched_demo_2',
      source_id: 'src_demo_forum',
      job_type: 'capture',
      cron_expression: '*/30 * * * *',
      enabled: true,
      next_run_at: iso(20),
      last_run_at: iso(-10),
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'sched_demo_3',
      source_id: undefined,
      job_type: 'build_narrative_graph',
      cron_expression: '0 6 * * 1',
      enabled: false,
      next_run_at: iso(60 * 24),
      last_run_at: iso(-60 * 24 * 7),
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
  ];
}

/** Demo job attempts. */
export function demoAttempts(): HsinJobAttemptRecord[] {
  return [
    {
      id: 'att_demo_1',
      job_id: 'job_demo_1',
      attempt_number: 1,
      started_at: iso(-30),
      finished_at: iso(-29),
      status: 'success',
      created_at: iso(-30),
    },
    {
      id: 'att_demo_2',
      job_id: 'job_demo_3',
      attempt_number: 1,
      started_at: iso(-12),
      finished_at: iso(-11),
      status: 'failed',
      error_message: 'Capture timed out after 30s reaching the source.',
      created_at: iso(-12),
    },
    {
      id: 'att_demo_3',
      job_id: 'job_demo_3',
      attempt_number: 2,
      started_at: iso(-5),
      status: 'running',
      created_at: iso(-5),
    },
  ];
}

/** Demo provider rate limits. */
export function demoRateLimits(): HsinProviderRateLimitRecord[] {
  return [
    {
      id: 'rl_demo_1',
      provider_name: 'openai',
      window_seconds: 60,
      max_requests: 500,
      remaining_requests: 420,
      reset_at: iso(1),
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'rl_demo_2',
      provider_name: 'serp',
      window_seconds: 3600,
      max_requests: 100,
      remaining_requests: 18,
      reset_at: iso(45),
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
  ];
}

/** Demo OperationsOverview built from Phase-8 demo bookkeeping. */
export function demoOperationsOverview(): OperationsOverview {
  return {
    queued: 3,
    running: 1,
    failed: 2,
    retrying: 1,
    completed24h: 24,
    recentAttempts: demoAttempts(),
    sourceHealthSummary: { healthy: 4, degraded: 1, failing: 1 },
    providerRateLimits: demoRateLimits(),
    schedulerRules: demoSchedulerRules(),
    captureThroughput: demoSeries([6, 4, 8, 5, 9, 7, 11]),
    alertThroughput: demoSeries([1, 0, 2, 1, 3, 2, 1]),
  };
}

/** Demo jobs (the queue table). */
export function demoJobs(): HsinJobQueueRecord[] {
  return [
    {
      id: 'job_demo_1',
      job_type: 'capture',
      status: 'completed',
      priority: 5,
      source_id: 'src_demo_movement_wiki',
      scheduled_for: iso(-35),
      started_at: iso(-30),
      finished_at: iso(-29),
      attempt_count: 1,
      max_attempts: 3,
      created_at: iso(-35),
      updated_at: iso(-29),
    },
    {
      id: 'job_demo_2',
      job_type: 'build_narrative_graph',
      status: 'queued',
      priority: 10,
      scheduled_for: iso(5),
      attempt_count: 0,
      max_attempts: 3,
      created_at: iso(-2),
      updated_at: iso(-2),
    },
    {
      id: 'job_demo_3',
      job_type: 'capture',
      status: 'failed',
      priority: 5,
      source_id: 'src_demo_forum',
      scheduled_for: iso(-14),
      started_at: iso(-12),
      finished_at: iso(-11),
      error_message: 'Capture timed out after 30s reaching the source.',
      attempt_count: 2,
      max_attempts: 3,
      created_at: iso(-14),
      updated_at: iso(-11),
    },
    {
      id: 'job_demo_4',
      job_type: 'apply_triage',
      status: 'retrying',
      priority: 3,
      source_id: 'src_demo_forum',
      scheduled_for: iso(2),
      started_at: iso(-1),
      attempt_count: 1,
      max_attempts: 3,
      created_at: iso(-3),
      updated_at: iso(-1),
    },
    {
      id: 'job_demo_5',
      job_type: 'capture',
      status: 'running',
      priority: 5,
      source_id: 'src_demo_movement_wiki',
      scheduled_for: iso(-2),
      started_at: iso(-1),
      attempt_count: 1,
      max_attempts: 3,
      created_at: iso(-2),
      updated_at: iso(-1),
    },
  ];
}

/** Filter demo jobs by status/jobType/sourceId (mirrors listJobsAction). */
export function applyDemoJobFilters(
  jobs: HsinJobQueueRecord[],
  filters?: { status?: string; jobType?: string; sourceId?: string },
): HsinJobQueueRecord[] {
  if (!filters) return jobs;
  return jobs.filter((j) => {
    if (filters.status && j.status !== filters.status) return false;
    if (filters.jobType && j.job_type !== filters.jobType) return false;
    if (filters.sourceId && j.source_id !== filters.sourceId) return false;
    return true;
  });
}

/** Demo triage rules — derived from the engine's DEFAULT_TRIAGE_RULES. */
export function demoTriageRules(): HsinTriageRuleRecord[] {
  return DEFAULT_TRIAGE_RULES.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    conditions_json: r.conditions.map(
      (c) => ({ field: c.field, op: c.op, value: c.value }) as Record<string, unknown>,
    ),
    actions_json: r.actions.map(
      (a) => ({ type: a.type, params: a.params }) as Record<string, unknown>,
    ),
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW,
  }));
}

/** Demo SLA policies — derived from the engine's DEFAULT_SLA_POLICIES. */
export function demoSlaPolicies(): HsinSlaPolicyRecord[] {
  return DEFAULT_SLA_POLICIES.map((p, i) => ({
    id: `sla_demo_${i}`,
    name: p.name,
    severity: p.severity,
    review_deadline_hours: p.reviewDeadlineHours,
    escalation_deadline_hours: p.escalationDeadlineHours,
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW,
  }));
}

/** A small labeled demo narrative/entity graph for the offline graph view. */
export function demoNarrativeGraph(): NarrativeGraphData {
  const narratives: HsinNarrativeRecord[] = [
    {
      id: 'narr_demo_1',
      name: 'Civilizational collapse is inevitable',
      description: 'Candidate narrative over 4 signals; key terms: collapse, decline, inevitable.',
      category: 'collapse',
      risk_level: 4,
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'narr_demo_2',
      name: 'Technology will save humanity',
      description: 'Candidate narrative over 3 signals; key terms: AI, progress, abundance.',
      category: 'technology',
      risk_level: 2,
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'narr_demo_3',
      name: 'Population must be reduced',
      description: 'Candidate narrative over 2 signals; key terms: overpopulation, carrying capacity.',
      category: 'population',
      risk_level: 5,
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'narr_demo_4',
      name: 'Decline can be reversed by action',
      description: 'Candidate narrative over 2 signals; key terms: renewal, mobilization, hope.',
      category: 'civilizational_narratives',
      risk_level: 1,
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
  ];

  const entities: HsinEntityRecord[] = [
    {
      id: 'ent_demo_1',
      name: 'Doomer Forum',
      entity_type: 'platform',
      description: 'A public discussion forum (demo).',
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'ent_demo_2',
      name: 'Accelerationism',
      entity_type: 'ideology',
      description: 'A public ideology (demo).',
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'ent_demo_3',
      name: 'Carrying Capacity',
      entity_type: 'topic',
      description: 'A discussed topic (demo).',
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
  ];

  const edges: HsinNarrativeEdgeRecord[] = [
    {
      id: 'edge_demo_1',
      source_narrative_id: 'narr_demo_1',
      target_narrative_id: 'narr_demo_2',
      edge_type: 'contradicts',
      weight: 0.8,
      rationale: 'Asserts opposite outcomes for civilization (demo).',
      created_at: DEMO_NOW,
    },
    {
      id: 'edge_demo_2',
      source_narrative_id: 'narr_demo_1',
      target_narrative_id: 'narr_demo_3',
      edge_type: 'amplifies',
      weight: 0.6,
      rationale: 'Collapse framing reinforces population-reduction framing (demo).',
      created_at: DEMO_NOW,
    },
    {
      id: 'edge_demo_3',
      source_narrative_id: 'narr_demo_3',
      target_narrative_id: 'narr_demo_1',
      edge_type: 'derived_from',
      weight: 0.5,
      rationale: 'Population framing is a variant of the collapse framing (demo).',
      created_at: DEMO_NOW,
    },
    {
      id: 'edge_demo_4',
      source_narrative_id: 'narr_demo_1',
      target_narrative_id: 'narr_demo_4',
      edge_type: 'evolves_into',
      weight: 0.4,
      rationale: 'Collapse framing sometimes evolves into a call to reverse decline (demo).',
      created_at: DEMO_NOW,
    },
    {
      id: 'edge_demo_5',
      source_narrative_id: 'narr_demo_2',
      target_narrative_id: 'narr_demo_4',
      edge_type: 'related_to',
      weight: 0.3,
      rationale: 'Both frame a hopeful future (demo).',
      created_at: DEMO_NOW,
    },
    {
      id: 'edge_demo_6',
      source_narrative_id: 'narr_demo_3',
      target_narrative_id: 'narr_demo_2',
      edge_type: 'co_occurs_with',
      weight: 0.35,
      rationale: 'Frequently discussed in the same threads (demo).',
      created_at: DEMO_NOW,
    },
  ];

  const signalNarratives: HsinSignalNarrativeRecord[] = [
    {
      id: 'sn_demo_1',
      signal_id: 'sig_demo_0',
      narrative_id: 'narr_demo_1',
      confidence: 0.82,
      rationale: 'Strong term overlap (demo).',
      created_at: DEMO_NOW,
    },
    {
      id: 'sn_demo_2',
      signal_id: 'sig_demo_1',
      narrative_id: 'narr_demo_3',
      confidence: 0.74,
      rationale: 'Strong term overlap (demo).',
      created_at: DEMO_NOW,
    },
  ];

  const signalEntities: HsinSignalEntityRecord[] = [
    {
      id: 'se_demo_1',
      signal_id: 'sig_demo_0',
      entity_id: 'ent_demo_1',
      confidence: 0.7,
      evidence_text: 'Posted on the Doomer Forum (demo).',
      created_at: DEMO_NOW,
    },
  ];

  return { narratives, entities, edges, signalNarratives, signalEntities };
}

/* -------------------------------------------------------------------------- */
/* Graph derivations (pure)                                                     */
/* -------------------------------------------------------------------------- */

/** narrativeId -> count of signals linked to it. */
export function signalCountByNarrative(
  links: HsinSignalNarrativeRecord[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of links) out[l.narrative_id] = (out[l.narrative_id] ?? 0) + 1;
  return out;
}

/** Signal ids linked to a given narrative. */
export function signalsForNarrative(
  narrativeId: string,
  links: HsinSignalNarrativeRecord[],
): HsinSignalNarrativeRecord[] {
  return links.filter((l) => l.narrative_id === narrativeId);
}

/* -------------------------------------------------------------------------- */
/* Filter helpers for the graph querystring                                    */
/* -------------------------------------------------------------------------- */

/** Apply from/to (by created_at) + category filters to a demo graph. */
export function applyDemoGraphFilters(
  data: NarrativeGraphData,
  filters?: { from?: string; to?: string; category?: string },
): NarrativeGraphData {
  if (!filters) return data;
  let narratives = data.narratives;
  if (filters.category) {
    narratives = narratives.filter(
      (n) => (n.category ?? '').toLowerCase() === filters.category!.toLowerCase(),
    );
  }
  if (filters.from) {
    narratives = narratives.filter((n) => n.created_at.slice(0, 10) >= filters.from!);
  }
  if (filters.to) {
    narratives = narratives.filter((n) => n.created_at.slice(0, 10) <= filters.to!);
  }
  const visible = new Set(narratives.map((n) => n.id));
  const edges = data.edges.filter(
    (e) => visible.has(e.source_narrative_id) && visible.has(e.target_narrative_id),
  );
  const signalNarratives = data.signalNarratives.filter((l) => visible.has(l.narrative_id));
  return {
    narratives,
    entities: data.entities,
    edges,
    signalNarratives,
    signalEntities: data.signalEntities,
  };
}
