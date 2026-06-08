// =============================================================================
// HSI Phase 9 — client-safe view helpers for the provider-adapter / dead-letter /
// narrative-community / amplification / WorldForge-fusion UI.
//
// PURE + CLIENT-SAFE: no server-only imports (no next/headers, no Supabase server
// client, no actions). These map Phase-9 domain unions → color/label, derive
// reliability/amplification colors, and build clearly-LABELED demo view-models so
// every Phase-9 page renders fully offline when an action returns NOT_CONFIGURED.
//
// Role gating + Tone/Decorated vocabulary are re-exported from the Phase-8
// lib/operations/view module so the two phases share one palette.
// =============================================================================

import type {
  AmplificationView,
  CommunitiesView,
  HsinAmplificationScoreRecord,
  HsinDeadLetterJobRecord,
  HsinGraphCommunityRecord,
  HsinNarrativeRecord,
  HsinProviderRateLimitRecord,
  HsinProviderRunRecord,
  HsinSourceReliabilityRecord,
  HsinWorldforgeLinkRecord,
  ProviderReason,
  ProvidersOverview,
  SourceReliabilityTier,
  WorldforgeFusionDraft,
  WorldforgeLinkStatus,
} from '@hsi/shared-types';
import { type Decorated, type Tone, titleize } from './view';

// Re-export the shared pure helpers so Phase-9 components import from one module.
export {
  canOperate,
  canBuildGraph,
  formatDateTime,
  relativeTime,
  formatDuration,
  titleize,
  excerpt,
  toneColor,
  type Decorated,
  type Tone,
} from './view';

const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
};

/* -------------------------------------------------------------------------- */
/* Role gating specific to Phase 9 (researcher+ for fusion / rebuilds)         */
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

/** Researcher or above — can rebuild communities/amplification + draft/approve fusion. */
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}

/** Curator or above — can requeue dead-letter jobs back onto the live queue. */
export function canRequeue(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/* -------------------------------------------------------------------------- */
/* Provider reason → color/label (never hide blocked/failed reasons)           */
/* -------------------------------------------------------------------------- */

interface ReasonDecor extends Decorated {
  description: string;
}

const REASON_DECOR: Record<ProviderReason, ReasonDecor> = {
  provider_not_configured: {
    label: 'Not configured',
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    description: 'No provider adapter is configured for this source.',
  },
  blocked: {
    label: 'Blocked',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'The source/provider actively refused the request (e.g. 403 / bot wall).',
  },
  timeout: {
    label: 'Timeout',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'The request exceeded the allowed time budget.',
  },
  fetch_error: {
    label: 'Fetch error',
    color: TONE_COLORS.red,
    tone: 'red',
    description: 'A network/transport error occurred reaching the source.',
  },
  parse_error: {
    label: 'Parse error',
    color: TONE_COLORS.orange,
    tone: 'orange',
    description: 'The response was reached but could not be parsed into items.',
  },
  policy_violation: {
    label: 'Policy violation',
    color: '#B91C1C',
    tone: 'red',
    description: 'The capture was refused by a safety/governance policy.',
  },
};

/** Decorate a provider reason. `ok` runs carry no reason → a green "OK". */
export function providerReasonDecor(reason?: ProviderReason | string | null): ReasonDecor {
  if (!reason) {
    return {
      label: 'OK',
      color: TONE_COLORS.green,
      tone: 'green',
      description: 'The run completed successfully.',
    };
  }
  const known = REASON_DECOR[reason as ProviderReason];
  if (known) return known;
  return {
    label: titleize(String(reason)),
    color: TONE_COLORS.neutral,
    tone: 'neutral',
    description: 'Provider run outcome.',
  };
}

/** Outcome decoration for a whole run, honoring `ok` plus any reason. */
export function providerRunDecor(run: HsinProviderRunRecord): ReasonDecor {
  if (run.ok === true && !run.reason) {
    return providerReasonDecor(null);
  }
  if (run.ok === false || run.reason) {
    return providerReasonDecor(run.reason ?? 'fetch_error');
  }
  return providerReasonDecor(null);
}

/* -------------------------------------------------------------------------- */
/* Source reliability tier → color/label                                       */
/* -------------------------------------------------------------------------- */

export function reliabilityTierDecor(tier?: SourceReliabilityTier | string | null): Decorated {
  switch (tier) {
    case 'high':
      return { label: 'High', color: TONE_COLORS.green, tone: 'green' };
    case 'medium':
      return { label: 'Medium', color: TONE_COLORS.blue, tone: 'blue' };
    case 'low':
      return { label: 'Low', color: TONE_COLORS.orange, tone: 'orange' };
    case 'unproven':
      return { label: 'Unproven', color: TONE_COLORS.neutral, tone: 'neutral' };
    default:
      return { label: tier ? titleize(String(tier)) : 'Unproven', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

/** Derive a tier from a 0..100 score when the record's tier is missing. */
export function reliabilityTierFromScore(score?: number): SourceReliabilityTier {
  if (score == null) return 'unproven';
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  if (score > 0) return 'low';
  return 'unproven';
}

/** Color for a reliability/amplification score ring (0..100). */
export function scoreColor(score?: number): string {
  if (score == null) return TONE_COLORS.neutral;
  if (score >= 75) return TONE_COLORS.green;
  if (score >= 50) return TONE_COLORS.blue;
  if (score >= 25) return TONE_COLORS.orange;
  return TONE_COLORS.red;
}

/* -------------------------------------------------------------------------- */
/* Amplification score → color/label                                           */
/* -------------------------------------------------------------------------- */

export function amplificationDecor(amp?: number): Decorated {
  if (amp == null) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  if (amp >= 75) return { label: 'High amplification', color: TONE_COLORS.red, tone: 'red' };
  if (amp >= 50) return { label: 'Rising', color: TONE_COLORS.orange, tone: 'orange' };
  if (amp >= 25) return { label: 'Moderate', color: TONE_COLORS.blue, tone: 'blue' };
  return { label: 'Low', color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** Color for the amplification bar itself. */
export function amplificationColor(amp?: number): string {
  return amplificationDecor(amp).color;
}

/* -------------------------------------------------------------------------- */
/* Community palette (shared by the graph + the list/legend)                   */
/* -------------------------------------------------------------------------- */

const COMMUNITY_COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#10B981', // green
  '#F59E0B', // orange
  '#EF4444', // red
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#84CC16', // lime
];

/** Stable per-community color cycled by community index. */
export function communityColor(index: number): string {
  return COMMUNITY_COLORS[index % COMMUNITY_COLORS.length];
}

/* -------------------------------------------------------------------------- */
/* WorldForge link status → color/label                                        */
/* -------------------------------------------------------------------------- */

export function linkStatusDecor(status?: WorldforgeLinkStatus | string): Decorated {
  switch (status) {
    case 'draft':
      return { label: 'Draft', color: TONE_COLORS.neutral, tone: 'neutral' };
    case 'approved':
      return { label: 'Approved', color: TONE_COLORS.blue, tone: 'blue' };
    case 'created':
      return { label: 'Run created', color: TONE_COLORS.green, tone: 'green' };
    case 'rejected':
      return { label: 'Rejected', color: TONE_COLORS.red, tone: 'red' };
    default:
      return { label: status ? titleize(String(status)) : '—', color: TONE_COLORS.neutral, tone: 'neutral' };
  }
}

/* -------------------------------------------------------------------------- */
/* Misc formatters                                                             */
/* -------------------------------------------------------------------------- */

/** Format a byte count compactly (e.g. 12.4 KB). */
export function formatBytes(bytes?: number): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** Format a 0..1 rate as a percentage string. */
export function ratePct(rate?: number): string {
  if (rate == null) return '—';
  return `${Math.round(Math.max(0, Math.min(1, rate)) * 100)}%`;
}

/* -------------------------------------------------------------------------- */
/* DEMO mappers — ALWAYS labeled "Demo" by callers; pure offline fixtures      */
/* -------------------------------------------------------------------------- */

const DEMO_NOW = '2026-01-01T00:00:00.000Z';

function iso(offsetMins: number): string {
  return new Date(Date.parse(DEMO_NOW) + offsetMins * 60000).toISOString();
}

/** Demo dead-letter jobs — exhausted retry budgets parked off the live queue. */
export function demoDeadLetterJobs(): HsinDeadLetterJobRecord[] {
  return [
    {
      id: 'dlq_demo_1',
      job_id: 'job_demo_dl_1',
      job_type: 'capture',
      source_id: 'src_demo_forum',
      payload_json: { url: 'https://example.test/forum/thread/42' },
      attempt_count: 3,
      max_attempts: 3,
      reason: 'blocked',
      last_error: 'HTTP 403 — source returned an anti-bot wall after 3 attempts.',
      dead_lettered_at: iso(-120),
      created_at: iso(-120),
    },
    {
      id: 'dlq_demo_2',
      job_id: 'job_demo_dl_2',
      job_type: 'capture',
      source_id: 'src_demo_movement_wiki',
      payload_json: { url: 'https://example.test/wiki/Recent_changes' },
      attempt_count: 3,
      max_attempts: 3,
      reason: 'timeout',
      last_error: 'Request timed out after 30s on every attempt.',
      dead_lettered_at: iso(-45),
      created_at: iso(-45),
    },
    {
      id: 'dlq_demo_3',
      job_id: 'job_demo_dl_3',
      job_type: 'apply_triage',
      source_id: undefined,
      payload_json: { signalId: 'sig_demo_7' },
      attempt_count: 4,
      max_attempts: 4,
      reason: 'parse_error',
      last_error: 'Triage rule referenced a field that no longer exists on the signal.',
      dead_lettered_at: iso(-20),
      created_at: iso(-20),
    },
  ];
}

/** Demo provider runs — recent adapter invocations + observability counters. */
export function demoProviderRuns(): HsinProviderRunRecord[] {
  return [
    {
      id: 'run_demo_1',
      provider_name: 'rss',
      source_id: 'src_demo_movement_wiki',
      started_at: iso(-10),
      finished_at: iso(-10),
      ok: true,
      item_count: 24,
      bytes: 48213,
      http_status: 200,
      created_at: iso(-10),
    },
    {
      id: 'run_demo_2',
      provider_name: 'html',
      source_id: 'src_demo_forum',
      started_at: iso(-22),
      finished_at: iso(-22),
      ok: false,
      reason: 'blocked',
      item_count: 0,
      bytes: 1204,
      http_status: 403,
      note: 'Anti-bot challenge page returned.',
      created_at: iso(-22),
    },
    {
      id: 'run_demo_3',
      provider_name: 'serp',
      source_id: 'src_demo_serp',
      started_at: iso(-35),
      finished_at: iso(-34),
      ok: false,
      reason: 'timeout',
      item_count: 0,
      http_status: undefined,
      note: 'Upstream search API did not respond within 30s.',
      created_at: iso(-35),
    },
    {
      id: 'run_demo_4',
      provider_name: 'rss',
      source_id: 'src_demo_blog',
      started_at: iso(-60),
      finished_at: iso(-60),
      ok: true,
      item_count: 8,
      bytes: 19022,
      http_status: 200,
      created_at: iso(-60),
    },
  ];
}

/** Demo provider rate limits (mirrors the Phase-8 shape for the providers grid). */
export function demoProviderRateLimits(): HsinProviderRateLimitRecord[] {
  return [
    {
      id: 'rl9_demo_1',
      provider_name: 'serp',
      window_seconds: 3600,
      max_requests: 100,
      remaining_requests: 22,
      reset_at: iso(40),
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
    {
      id: 'rl9_demo_2',
      provider_name: 'rss',
      window_seconds: 60,
      max_requests: 300,
      remaining_requests: 281,
      reset_at: iso(1),
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
  ];
}

/** Demo source reliability profiles. */
export function demoReliabilities(): HsinSourceReliabilityRecord[] {
  return [
    {
      id: 'rel_demo_1',
      source_id: 'src_demo_movement_wiki',
      reliability_score: 84,
      tier: 'high',
      capture_success_rate: 0.96,
      blocked_rate: 0.01,
      approved_rate: 0.72,
      contradiction_rate: 0.05,
      signal_count: 142,
      rationale: 'High capture success, low contradiction, healthy approval rate.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
      updated_at: iso(-5),
    },
    {
      id: 'rel_demo_2',
      source_id: 'src_demo_forum',
      reliability_score: 41,
      tier: 'low',
      capture_success_rate: 0.62,
      blocked_rate: 0.28,
      approved_rate: 0.34,
      contradiction_rate: 0.21,
      signal_count: 57,
      rationale: 'Frequently blocked and a higher contradiction rate downstream.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
      updated_at: iso(-5),
    },
    {
      id: 'rel_demo_3',
      source_id: 'src_demo_blog',
      reliability_score: 58,
      tier: 'medium',
      capture_success_rate: 0.88,
      blocked_rate: 0.04,
      approved_rate: 0.5,
      contradiction_rate: 0.12,
      signal_count: 23,
      rationale: 'Reliable capture but modest approval volume so far.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
      updated_at: iso(-5),
    },
    {
      id: 'rel_demo_4',
      source_id: 'src_demo_serp',
      reliability_score: 0,
      tier: 'unproven',
      capture_success_rate: undefined,
      blocked_rate: undefined,
      approved_rate: undefined,
      contradiction_rate: undefined,
      signal_count: 0,
      rationale: 'Not enough captures yet to judge reliability.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
      updated_at: iso(-5),
    },
  ];
}

/** Demo ProvidersOverview view-model. */
export function demoProvidersOverview(): ProvidersOverview {
  return {
    runs: demoProviderRuns(),
    rateLimits: demoProviderRateLimits(),
    reliabilities: demoReliabilities(),
  };
}

/** Demo narratives reused by both the communities + amplification demo views. */
export function demoNarratives(): HsinNarrativeRecord[] {
  return [
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
    {
      id: 'narr_demo_5',
      name: 'Markets self-correct without intervention',
      description: 'Candidate narrative over 3 signals; key terms: markets, deregulation, equilibrium.',
      category: 'economics',
      risk_level: 2,
      created_at: DEMO_NOW,
      updated_at: DEMO_NOW,
    },
  ];
}

/** Demo graph communities clustering the demo narratives. */
export function demoCommunities(): HsinGraphCommunityRecord[] {
  return [
    {
      id: 'comm_demo_1',
      label: 'Collapse & population framing',
      algorithm: 'label-propagation',
      member_narrative_ids: ['narr_demo_1', 'narr_demo_3'],
      size: 2,
      metrics_json: { density: 0.8, internal_edges: 3 },
      computed_at: iso(-5),
      created_at: DEMO_NOW,
    },
    {
      id: 'comm_demo_2',
      label: 'Techno-optimism & renewal',
      algorithm: 'label-propagation',
      member_narrative_ids: ['narr_demo_2', 'narr_demo_4'],
      size: 2,
      metrics_json: { density: 0.6, internal_edges: 1 },
      computed_at: iso(-5),
      created_at: DEMO_NOW,
    },
    {
      id: 'comm_demo_3',
      label: 'Market self-correction',
      algorithm: 'label-propagation',
      member_narrative_ids: ['narr_demo_5'],
      size: 1,
      metrics_json: { density: 0, internal_edges: 0 },
      computed_at: iso(-5),
      created_at: DEMO_NOW,
    },
  ];
}

/** Demo CommunitiesView view-model. */
export function demoCommunitiesView(): CommunitiesView {
  return { communities: demoCommunities(), narratives: demoNarratives() };
}

/** Demo amplification scores for the demo narratives. */
export function demoAmplificationScores(): HsinAmplificationScoreRecord[] {
  return [
    {
      id: 'amp_demo_1',
      narrative_id: 'narr_demo_1',
      amplification: 82,
      source_count: 11,
      signal_count: 38,
      velocity: 4.2,
      rationale: 'Spreading across many sources with rising daily signal volume.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
    },
    {
      id: 'amp_demo_2',
      narrative_id: 'narr_demo_3',
      amplification: 64,
      source_count: 7,
      signal_count: 19,
      velocity: 2.1,
      rationale: 'Steady cross-source repetition; moderate velocity.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
    },
    {
      id: 'amp_demo_3',
      narrative_id: 'narr_demo_2',
      amplification: 47,
      source_count: 5,
      signal_count: 14,
      velocity: 1.0,
      rationale: 'Present across several sources but not accelerating.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
    },
    {
      id: 'amp_demo_4',
      narrative_id: 'narr_demo_5',
      amplification: 29,
      source_count: 3,
      signal_count: 8,
      velocity: 0.4,
      rationale: 'Limited reach; concentrated in a few sources.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
    },
    {
      id: 'amp_demo_5',
      narrative_id: 'narr_demo_4',
      amplification: 18,
      source_count: 2,
      signal_count: 4,
      velocity: 0.1,
      rationale: 'Low amplification; minimal spread so far.',
      computed_at: iso(-5),
      created_at: DEMO_NOW,
    },
  ];
}

/** Demo AmplificationView view-model. */
export function demoAmplificationView(): AmplificationView {
  return { scores: demoAmplificationScores(), narratives: demoNarratives() };
}

/** Demo WorldForge fusion links across the lifecycle (draft/approved/created). */
export function demoWorldforgeLinks(): HsinWorldforgeLinkRecord[] {
  return [
    {
      id: 'wfl_demo_1',
      signal_id: 'sig_demo_0',
      narrative_id: 'narr_demo_1',
      research_run_id: 'run_demo_research_1',
      prompt_draft:
        'Model the long-run feasibility of the claim that civilizational collapse is inevitable, grounding each driver in cited evidence.',
      status: 'created',
      created_by: 'demo-researcher',
      created_at: iso(-200),
      updated_at: iso(-180),
    },
    {
      id: 'wfl_demo_2',
      signal_id: 'sig_demo_1',
      narrative_id: 'narr_demo_3',
      prompt_draft:
        'Investigate the population-reduction narrative: identify its assumptions and test them against demographic evidence.',
      status: 'approved',
      created_by: 'demo-researcher',
      created_at: iso(-90),
      updated_at: iso(-80),
    },
    {
      id: 'wfl_demo_3',
      signal_id: 'sig_demo_2',
      narrative_id: 'narr_demo_2',
      prompt_draft:
        'Draft: explore the techno-optimist narrative and the evidence for/against technological rescue.',
      status: 'draft',
      created_by: 'demo-researcher',
      created_at: iso(-15),
      updated_at: iso(-15),
    },
  ];
}

/** Demo WorldForge fusion draft assembled from a signal. */
export function demoFusionDraft(signalId?: string): WorldforgeFusionDraft {
  return {
    signalId: signalId ?? 'sig_demo_0',
    narrativeId: 'narr_demo_1',
    title: 'Is civilizational collapse inevitable?',
    promptDraft:
      'Model the long-run feasibility of the claim that civilizational collapse is inevitable. ' +
      'Decompose the claim into testable drivers (resource limits, institutional resilience, technological ' +
      'adaptation), ground each driver in cited evidence, and surface the strongest counter-evidence. ' +
      'Produce a confidence-graded synthesis for human review — do not assert a conclusion.',
    rationale: [
      'Derived from a captured public signal classified under "collapse".',
      'Linked to the narrative "Civilizational collapse is inevitable" (high amplification).',
      'Reframed as a neutral, falsifiable research question for the WorldForge pipeline.',
      'Output is DRAFT research structure — it routes through evidence/consensus/governance and is never auto-published.',
    ],
  };
}
