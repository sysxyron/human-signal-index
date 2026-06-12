// =============================================================================
// @hsi/executive-intelligence — the EXECUTIVE BRIEFING engine.
//
// generateDaily/Weekly/Critical/Governance/Forecast/OperationsBrief build
// explainable, evidence-linked, human-readable briefs from the unified state.
// buildExecutiveBrief dispatches by kind. Every section carries source references;
// every brief carries limitations. NEVER auto-sends, NEVER auto-publishes.
// =============================================================================

import { computeOperationalRisk, computeStrategicOpportunity } from './analysis';
import { summarizeSystemState } from './unified';
import type {
  BriefKind,
  BriefSection,
  ExecutiveBrief,
  UnifiedSystemState,
} from './types';

const STD_LIMITATIONS = [
  'This brief summarises the system state — it is advisory and never auto-sent or auto-published.',
  'Every item links to its source; leadership review is required before any action.',
];

function section(key: string, title: string, items: string[], sources: string[]): BriefSection {
  return { key, title, items: items.length > 0 ? items : ['Nothing to report.'], sources };
}

/** The DAILY brief: top risks, opportunities, consensus, forecasts, governance. */
export function generateDailyBrief(state: UnifiedSystemState, opts: { now: string }): ExecutiveBrief {
  const summary = summarizeSystemState(state);
  const risks = computeOperationalRisk(state).slice(0, 5);
  const opps = computeStrategicOpportunity(state).slice(0, 5);

  const sections: BriefSection[] = [
    section('risks', 'Top risks', risks.map((r) => `[${r.severity}] ${r.title} (score ${Math.round(r.score)})`), risks.map((r) => r.source)),
    section('opportunities', 'Top opportunities', opps.map((o) => `${o.title} (score ${Math.round(o.score)})`), opps.map((o) => o.source)),
    section('investigations', 'Major investigations', state.investigations.filter((i) => (i.contentiousness ?? 0) >= 0.4).slice(0, 5).map((i) => `${i.title} — ${i.contributorCount} contributor(s)`), state.investigations.map((i) => `investigation:${i.id}`)),
    section('consensus', 'Consensus changes', state.consensus.filter((c) => c.disputed).slice(0, 5).map((c) => `Disputed: ${c.position ?? 'unresolved'} (${Math.round(c.agreement * 100)}% agreement)`), state.consensus.map((c) => `consensus:${c.investigationId}`)),
    section('forecasts', 'Forecast shifts', state.forecasts.filter((f) => f.status === 'failed' || f.status === 'confirmed').slice(0, 5).map((f) => `${f.status.toUpperCase()}: ${f.prediction}`), state.forecasts.map((f) => `forecast:${f.id}`)),
    section('governance', 'Governance actions pending', state.governanceQueue.slice(0, 8).map((g) => `[${g.severity}] ${g.label}`), state.governanceQueue.map((g) => `governance:${g.source}:${g.id}`)),
    section('warnings', 'Open alerts', state.warnings.filter((w) => w.level === 'WARNING' || w.level === 'CRITICAL').slice(0, 8).map((w) => `[${w.level}] ${w.title}`), state.warnings.map((w) => `warning:${w.id}`)),
  ];

  return { kind: 'daily', title: 'Daily Executive Brief', headline: summary.summary, sections, limitations: STD_LIMITATIONS, generatedAt: opts.now };
}

/** The WEEKLY brief: rollup of the week's state (same shape, weekly framing). */
export function generateWeeklyBrief(state: UnifiedSystemState, opts: { now: string }): ExecutiveBrief {
  const daily = generateDailyBrief(state, opts);
  return { ...daily, kind: 'weekly', title: 'Weekly Executive Brief', headline: `Week in review — ${daily.headline}` };
}

/** The CRITICAL brief: only CRITICAL/HIGH items. */
export function generateCriticalBrief(state: UnifiedSystemState, opts: { now: string }): ExecutiveBrief {
  const criticalWarnings = state.warnings.filter((w) => w.level === 'CRITICAL');
  const criticalRisks = computeOperationalRisk(state).filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH');
  const criticalGov = state.governanceQueue.filter((g) => g.severity === 'CRITICAL' || g.severity === 'HIGH');

  const sections: BriefSection[] = [
    section('critical_warnings', 'Critical warnings', criticalWarnings.map((w) => w.title), criticalWarnings.map((w) => `warning:${w.id}`)),
    section('critical_risks', 'High/critical risks', criticalRisks.map((r) => `[${r.severity}] ${r.title}`), criticalRisks.map((r) => r.source)),
    section('critical_governance', 'Urgent governance', criticalGov.map((g) => g.label), criticalGov.map((g) => `governance:${g.id}`)),
  ];
  const count = criticalWarnings.length + criticalRisks.length + criticalGov.length;
  return { kind: 'critical', title: 'Critical Brief', headline: count === 0 ? 'No critical items — system within tolerance.' : `${count} critical/high item(s) require attention.`, sections, limitations: STD_LIMITATIONS, generatedAt: opts.now };
}

/** The GOVERNANCE brief: the full governance queue. */
export function generateGovernanceBrief(state: UnifiedSystemState, opts: { now: string }): ExecutiveBrief {
  const bySource = new Map<string, number>();
  for (const g of state.governanceQueue) bySource.set(g.source, (bySource.get(g.source) ?? 0) + 1);
  const sections: BriefSection[] = [
    section('queue', 'Pending governance decisions', state.governanceQueue.map((g) => `[${g.severity}] (${g.source}) ${g.label}`), state.governanceQueue.map((g) => `governance:${g.id}`)),
    section('by_source', 'By source', [...bySource.entries()].map(([s, n]) => `${s}: ${n}`), []),
  ];
  return { kind: 'governance', title: 'Governance Brief', headline: `${state.governanceQueue.length} governance item(s) pending human decision.`, sections, limitations: STD_LIMITATIONS, generatedAt: opts.now };
}

/** The FORECAST brief: forecast shifts + scenario movements. */
export function generateForecastBrief(state: UnifiedSystemState, opts: { now: string }): ExecutiveBrief {
  const sections: BriefSection[] = [
    section('active', 'Active forecasts', state.forecasts.filter((f) => f.status === 'active').slice(0, 10).map((f) => `${f.prediction} (conf ${Math.round(f.confidence * 100)}%, rel ${Math.round(f.reliability * 100)}%)`), state.forecasts.map((f) => `forecast:${f.id}`)),
    section('failing', 'Failing forecasts', state.forecasts.filter((f) => f.status === 'failed').map((f) => f.prediction), []),
    section('scenarios', 'Emerging scenarios', state.scenarios.filter((s) => s.state === 'EMERGING' || s.state === 'ACTIVE').slice(0, 10).map((s) => `${s.title} — ${Math.round(s.likelihood * 100)}% likelihood (${s.state})`), state.scenarios.map((s) => `scenario:${s.id}`)),
  ];
  return { kind: 'forecast', title: 'Forecast Brief', headline: `${state.forecasts.filter((f) => f.status === 'active').length} active forecast(s), ${state.scenarios.length} scenario(s).`, sections, limitations: STD_LIMITATIONS, generatedAt: opts.now };
}

/** The OPERATIONS brief: platform health + ops rollups. */
export function generateOperationsBrief(state: UnifiedSystemState, opts: { now: string }): ExecutiveBrief {
  const sections: BriefSection[] = [
    section('health', 'Platform health', [`Overall: ${state.operations.overallHealth}`, `Active runs: ${state.operations.activeRuns}`, `Queue depth: ${state.operations.queueDepth}`, `Open escalations: ${state.operations.openEscalations}`], ['operations']),
    section('publishing', 'Publishing', [`Published: ${state.publishing.published}`, `In review: ${state.publishing.inReview}`, `Retracted: ${state.publishing.retracted}`], ['publishing']),
    section('outcomes', 'Outcomes', [state.outcomes.successRate !== undefined ? `Success rate: ${Math.round(state.outcomes.successRate * 100)}%` : 'No outcome data.'], ['outcomes']),
  ];
  return { kind: 'operations', title: 'Operations Brief', headline: `Platform ${state.operations.overallHealth}: ${state.operations.activeRuns} active run(s), ${state.operations.openEscalations} escalation(s).`, sections, limitations: STD_LIMITATIONS, generatedAt: opts.now };
}

/** Dispatch by brief kind. */
export function buildExecutiveBrief(kind: BriefKind, state: UnifiedSystemState, opts: { now: string }): ExecutiveBrief {
  switch (kind) {
    case 'weekly': return generateWeeklyBrief(state, opts);
    case 'critical': return generateCriticalBrief(state, opts);
    case 'governance': return generateGovernanceBrief(state, opts);
    case 'forecast': return generateForecastBrief(state, opts);
    case 'operations': return generateOperationsBrief(state, opts);
    case 'daily':
    default: return generateDailyBrief(state, opts);
  }
}
