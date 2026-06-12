// =============================================================================
// @hsi/executive-intelligence — the EXECUTIVE SNAPSHOT + DAILY REPORT.
//
// rankStrategicPriorities() derives priority inputs from EVERY part of the unified
// state and ranks them. buildExecutiveSnapshot() assembles the full command-center
// view. buildDailyIntelligenceReport() / buildExecutiveSnapshot drive the daily
// brief. All advisory — nothing auto-acts.
// =============================================================================

import { computeExecutiveAttention, computeOperationalRisk, computeStrategicOpportunity } from './analysis';
import { rankPriority, round } from './priority';
import { summarizeSystemState } from './unified';
import { generateDailyBrief } from './briefing';
import type {
  DailyIntelligenceReport,
  ExecutiveSnapshot,
  PriorityInput,
  StrategicPriority,
  UnifiedSystemState,
} from './types';

const ACTIVE_INV = ['ACTIVE', 'UNDER_REVIEW', 'CONSENSUS_FORMING'];

/** Derive strategic-priority inputs from the unified state across all sources. */
export function rankStrategicPriorities(state: UnifiedSystemState): StrategicPriority[] {
  const inputs: PriorityInput[] = [];

  for (const w of state.warnings) {
    const sev = w.level === 'CRITICAL' ? 0.9 : w.level === 'WARNING' ? 0.7 : w.level === 'WATCH' ? 0.45 : 0.25;
    inputs.push({ id: `pri-warn-${w.id}`, kind: 'warning', title: w.title, urgency: sev, impact: sev, riskScore: sev, entityRef: w.id });
  }
  for (const c of state.consensus.filter((x) => x.disputed)) {
    inputs.push({ id: `pri-con-${c.investigationId}`, kind: 'consensus', title: `Contested: ${c.position ?? 'consensus'}`, consensusAgreement: c.agreement, confidence: c.confidence, impact: 0.6, entityRef: c.investigationId });
  }
  for (const f of state.forecasts) {
    if (f.status === 'failed') inputs.push({ id: `pri-fc-${f.id}`, kind: 'forecast', title: `Failed: ${f.prediction}`, urgency: 0.7, impact: f.confidence, riskScore: f.confidence, confidence: f.reliability, entityRef: f.id });
    else if (f.status === 'active' && f.confidence >= 0.75 && f.confidence - f.reliability >= 0.2) inputs.push({ id: `pri-fc-${f.id}`, kind: 'forecast', title: `At-risk forecast: ${f.prediction}`, urgency: 0.5, impact: 0.6, riskScore: 0.5, confidence: f.reliability, entityRef: f.id });
  }
  for (const t of state.trust.filter((x) => x.score < 50 || x.trend === 'degrading')) {
    inputs.push({ id: `pri-trust-${t.entityType}-${t.entityId}`, kind: 'trust', title: `Trust: ${t.entityType} ${t.entityId}`, trustScore: t.score, impact: 0.6, confidence: 0.6, entityRef: t.entityId });
  }
  for (const g of state.governanceQueue) {
    const sev = g.severity === 'CRITICAL' ? 0.9 : g.severity === 'HIGH' ? 0.7 : g.severity === 'MEDIUM' ? 0.5 : 0.3;
    inputs.push({ id: `pri-gov-${g.id}`, kind: 'governance', title: g.label, urgency: sev, impact: sev, governancePending: true, riskScore: sev * 0.6, entityRef: g.id });
  }
  for (const o of state.opportunities) {
    const v = o.priority === 'CRITICAL' ? 0.9 : o.priority === 'HIGH' ? 0.7 : o.priority === 'NORMAL' ? 0.5 : 0.3;
    inputs.push({ id: `pri-opp-${o.id}`, kind: 'opportunity', title: o.title, opportunityScore: v, confidence: o.confidence, impact: v, entityRef: o.id });
  }
  for (const i of state.investigations.filter((x) => ACTIVE_INV.includes(x.state) && (x.contentiousness ?? 0) >= 0.5)) {
    inputs.push({ id: `pri-inv-${i.id}`, kind: 'investigation', title: i.title, impact: 0.6, confidence: i.agreementScore, riskScore: i.contentiousness, entityRef: i.id });
  }

  return rankPriority(inputs);
}

/** Build the full executive snapshot. Deterministic. */
export function buildExecutiveSnapshot(state: UnifiedSystemState, opts: { now: string }): ExecutiveSnapshot {
  const priorities = rankStrategicPriorities(state);
  const risks = computeOperationalRisk(state);
  const opportunities = computeStrategicOpportunity(state);
  const attention = computeExecutiveAttention(state);
  const summary = summarizeSystemState(state);

  const activeForecasts = state.forecasts.filter((f) => f.status === 'active');
  const avgConfidence = activeForecasts.length ? round(activeForecasts.reduce((a, f) => a + f.confidence, 0) / activeForecasts.length) : 0;

  return {
    strategicPriorities: priorities,
    operationalRisks: risks,
    opportunities,
    attention,
    investigations: { active: summary.activeInvestigations, disputed: state.investigations.filter((i) => (i.contentiousness ?? 0) >= 0.5).length },
    consensus: { forming: state.consensus.length, disputed: summary.disputedConsensus },
    forecasts: { active: activeForecasts.length, failing: summary.failingForecasts, avgConfidence },
    warnings: { critical: summary.criticalWarnings, total: summary.totalWarnings },
    governanceQueue: state.governanceQueue,
    executiveSummary: summary.summary,
    limitations: [
      'This snapshot ranks ATTENTION and surfaces signals — it creates no new intelligence and makes no decisions.',
      'Every priority, risk, and opportunity is advisory; all actions require human governance.',
    ],
    generatedAt: opts.now,
  };
}

/** Build the full daily intelligence report (snapshot + daily brief + tops). */
export function buildDailyIntelligenceReport(state: UnifiedSystemState, opts: { now: string }): DailyIntelligenceReport {
  const snapshot = buildExecutiveSnapshot(state, opts);
  const brief = generateDailyBrief(state, opts);
  return {
    title: 'Daily Intelligence Report',
    date: opts.now.slice(0, 10),
    snapshot,
    brief,
    topRisks: snapshot.operationalRisks.slice(0, 5),
    topOpportunities: snapshot.opportunities.slice(0, 5),
    generatedAt: opts.now,
  };
}

/** Alias for the spec's generateExecutiveReport(). */
export function generateExecutiveReport(state: UnifiedSystemState, opts: { now: string }): DailyIntelligenceReport {
  return buildDailyIntelligenceReport(state, opts);
}
