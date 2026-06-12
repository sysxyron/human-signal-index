// =============================================================================
// HSI Phase 22 — client-safe view helpers for the Executive Command Center.
//
// PURE + CLIENT-SAFE: NO server-only imports. Maps the Phase-22 unions →
// color/label, formats scores, and builds clearly-LABELED demo view-models from
// the '@hsi/executive-intelligence' fixtures so every page renders fully offline
// when an action returns NOT_CONFIGURED.
//
// EXPLAINABLE — every priority/risk/opportunity is advisory and carries its
// reasoning; nothing auto-acts.
// =============================================================================

import type {
  ExecutiveAttentionLevel,
  ExecutiveBriefingsData,
  ExecutiveCommandData,
  ExecutiveGovernanceData,
  ExecutiveHighlights,
  ExecutiveOpportunitiesData,
  ExecutivePriorityKind,
  ExecutivePrioritiesData,
  ExecutiveRisksData,
  ExecutiveSeverityLevel,
} from '@hsi/shared-types';
import { executiveDemo } from '@hsi/executive-intelligence';

/* decoration */
export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'cyan' | 'pink';
export interface Decorated { label: string; color: string; tone: Tone; description?: string }
const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8', blue: '#3B82F6', purple: '#8B5CF6', green: '#10B981',
  orange: '#F59E0B', red: '#EF4444', cyan: '#06B6D4', pink: '#EC4899',
};
export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}
function titleize(v: string): string {
  return v.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/* role gating */
const ROLE_RANK: Record<string, number> = { viewer: 0, contributor: 1, researcher: 2, reviewer: 3, editor: 3, curator: 4, admin: 5, owner: 6 };
function rank(role?: string | null): number {
  return role ? (ROLE_RANK[role.toLowerCase()] ?? -1) : -1;
}
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}
export function canCurate(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/* attention level */
const ATTENTION_DECOR: Record<ExecutiveAttentionLevel, Decorated> = {
  routine: { label: 'Routine', color: TONE_COLORS.green, tone: 'green' },
  notable: { label: 'Notable', color: TONE_COLORS.cyan, tone: 'cyan' },
  elevated: { label: 'Elevated', color: TONE_COLORS.orange, tone: 'orange' },
  urgent: { label: 'Urgent', color: TONE_COLORS.red, tone: 'red' },
};
export function attentionDecor(l?: ExecutiveAttentionLevel | string | null): Decorated {
  if (!l) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return ATTENTION_DECOR[l as ExecutiveAttentionLevel] ?? { label: titleize(String(l)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* severity */
const SEVERITY_DECOR: Record<ExecutiveSeverityLevel, Decorated> = {
  LOW: { label: 'Low', color: TONE_COLORS.blue, tone: 'blue' },
  MEDIUM: { label: 'Medium', color: TONE_COLORS.orange, tone: 'orange' },
  HIGH: { label: 'High', color: TONE_COLORS.red, tone: 'red' },
  CRITICAL: { label: 'Critical', color: TONE_COLORS.red, tone: 'red' },
};
export function severityDecor(s?: ExecutiveSeverityLevel | string | null): Decorated {
  if (!s) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return SEVERITY_DECOR[s as ExecutiveSeverityLevel] ?? { label: titleize(String(s)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/* priority kind */
const KIND_DECOR: Record<ExecutivePriorityKind, Decorated> = {
  risk: { label: 'Risk', color: TONE_COLORS.red, tone: 'red' },
  opportunity: { label: 'Opportunity', color: TONE_COLORS.green, tone: 'green' },
  investigation: { label: 'Investigation', color: TONE_COLORS.blue, tone: 'blue' },
  forecast: { label: 'Forecast', color: TONE_COLORS.purple, tone: 'purple' },
  warning: { label: 'Warning', color: TONE_COLORS.orange, tone: 'orange' },
  governance: { label: 'Governance', color: TONE_COLORS.cyan, tone: 'cyan' },
  consensus: { label: 'Consensus', color: TONE_COLORS.pink, tone: 'pink' },
  trust: { label: 'Trust', color: TONE_COLORS.purple, tone: 'purple' },
};
export function kindDecor(k?: ExecutivePriorityKind | string | null): Decorated {
  if (!k) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return KIND_DECOR[k as ExecutivePriorityKind] ?? { label: titleize(String(k)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** Score band (0..100). */
export function scoreBand(score?: number | null): Decorated {
  if (score == null || Number.isNaN(score)) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  if (score >= 75) return { label: 'Urgent', color: TONE_COLORS.red, tone: 'red' };
  if (score >= 55) return { label: 'Elevated', color: TONE_COLORS.orange, tone: 'orange' };
  if (score >= 40) return { label: 'Notable', color: TONE_COLORS.cyan, tone: 'cyan' };
  return { label: 'Routine', color: TONE_COLORS.green, tone: 'green' };
}

/* formatters */
export function formatScore(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return Math.round(Math.max(0, Math.min(100, v))).toString();
}
export function formatPct(v?: number | null, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(Math.max(0, Math.min(1, v)) * 100).toFixed(digits)}%`;
}
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function readStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  if (isRecord(value)) {
    for (const k of ['items', 'list', 'values']) {
      const inner = value[k];
      if (Array.isArray(inner)) return inner.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

/* -------------------------------------------------------------------------- */
/* DEMO builders                                                               */
/* -------------------------------------------------------------------------- */
const DEMO_NOW = '2026-06-09T12:00:00.000Z';

let _demo: ReturnType<typeof executiveDemo> | null = null;
function demo(): ReturnType<typeof executiveDemo> {
  if (!_demo) _demo = executiveDemo();
  return _demo;
}

export function demoExecutiveCommand(): ExecutiveCommandData {
  const d = demo();
  const s = d.snapshot;
  return {
    snapshot: {
      id: 'demo', attention_index: s.attention.index, attention_level: s.attention.level,
      overall_health: d.state.operations.overallHealth, executive_summary: s.executiveSummary,
      priority_count: s.strategicPriorities.length, risk_count: s.operationalRisks.length,
      opportunity_count: s.opportunities.length, governance_count: s.governanceQueue.length,
      generated_at: DEMO_NOW, created_at: DEMO_NOW,
    },
    priorities: s.strategicPriorities.slice(0, 25).map((p) => ({
      id: p.id, ref_id: p.entityRef, kind: p.kind, title: p.title, score: p.score, rank: p.rank,
      urgency: p.urgency, impact: p.impact, attention_level: p.attentionLevel, recommendation: p.recommendation,
      explanation: { items: p.explanation }, limitations: { items: p.limitations }, entity_ref: p.entityRef, created_at: DEMO_NOW,
    })),
    attentionIndex: s.attention.index,
    attentionLevel: s.attention.level,
    executiveSummary: s.executiveSummary,
    riskCount: s.operationalRisks.length,
    opportunityCount: s.opportunities.length,
    governanceCount: s.governanceQueue.length,
    panels: {
      forecasts: s.forecasts,
      consensus: s.consensus,
      operations: { health: d.state.operations.overallHealth, activeRuns: d.state.operations.activeRuns, escalations: d.state.operations.openEscalations },
    },
  };
}

export function demoExecutivePriorities(): ExecutivePrioritiesData {
  const d = demo();
  const byKind: Record<string, number> = {};
  const byAttention: Record<string, number> = {};
  for (const p of d.snapshot.strategicPriorities) {
    byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
    byAttention[p.attentionLevel] = (byAttention[p.attentionLevel] ?? 0) + 1;
  }
  return {
    priorities: d.snapshot.strategicPriorities.map((p) => ({
      id: p.id, ref_id: p.entityRef, kind: p.kind, title: p.title, score: p.score, rank: p.rank,
      urgency: p.urgency, impact: p.impact, attention_level: p.attentionLevel, recommendation: p.recommendation,
      explanation: { items: p.explanation }, limitations: { items: p.limitations }, entity_ref: p.entityRef, created_at: DEMO_NOW,
    })),
    byKind, byAttention,
  };
}

export function demoExecutiveRisks(): ExecutiveRisksData {
  const d = demo();
  const bySeverity: Record<string, number> = {};
  for (const r of d.risks) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
  return { risks: d.risks.map((r) => ({ id: r.id, title: r.title, source: r.source, severity: r.severity, score: r.score, recommendation: r.recommendation })), bySeverity };
}

export function demoExecutiveOpportunities(): ExecutiveOpportunitiesData {
  const d = demo();
  const bySource: Record<string, number> = {};
  for (const o of d.opportunities) bySource[o.source] = (bySource[o.source] ?? 0) + 1;
  return { opportunities: d.opportunities.map((o) => ({ id: o.id, title: o.title, source: o.source, score: o.score, recommendation: o.recommendation })), bySource };
}

export function demoExecutiveBriefings(): ExecutiveBriefingsData {
  const d = demo();
  const briefs = [d.report.brief, d.briefs.weekly, d.briefs.critical, d.briefs.governance, d.briefs.forecast, d.briefs.operations].map((b, i) => ({
    id: `demo-${b.kind}-${i}`, kind: b.kind, title: b.title, headline: b.headline,
    sections: { items: b.sections }, limitations: { items: b.limitations }, generated_at: DEMO_NOW, created_at: DEMO_NOW,
  }));
  return { briefs, latestDaily: briefs[0] };
}

export function demoExecutiveGovernance(): ExecutiveGovernanceData {
  const d = demo();
  const reviews = [{
    id: 'demo-rev', priority_id: d.review.priorityId, title: d.review.title, kind: d.review.kind,
    severity: d.review.severity, status: 'queued' as const, queued_at: DEMO_NOW, created_at: DEMO_NOW,
  }];
  const decisions = [{
    id: 'demo-dec', review_id: 'demo-rev', priority_id: d.decision.priorityId, decision: d.decision.decision,
    reviewer: d.decision.reviewer, reason: d.decision.reason, previous_status: d.decision.previousStatus,
    reversible: d.decision.reversible, audit_trail: { items: d.decision.auditTrail }, decided_at: d.decision.at, created_at: DEMO_NOW,
  }];
  return { reviews, decisions, byStatus: { queued: 1 } };
}

export function demoExecutiveHighlights(): ExecutiveHighlights {
  const d = demo();
  const s = d.snapshot;
  return {
    attentionIndex: s.attention.index,
    attentionLevel: s.attention.level,
    topPriorities: s.strategicPriorities.filter((p) => p.attentionLevel === 'urgent' || p.attentionLevel === 'elevated').length,
    openRisks: s.operationalRisks.length,
    openOpportunities: s.opportunities.length,
    governancePending: s.governanceQueue.length,
    dailyBriefReady: true,
  };
}
