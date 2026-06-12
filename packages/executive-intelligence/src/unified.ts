// =============================================================================
// @hsi/executive-intelligence — the UNIFIED SYSTEM STATE.
//
// buildUnifiedSystemState() normalises raw subsystem inputs (research, evidence,
// decisions, outcomes, trust, forecasts, consensus, publishing, governance,
// operations) into ONE model every executive view derives from. summarizeSystemState()
// renders a one-paragraph executive summary + the headline counts. Pure.
// =============================================================================

import { clamp01, round } from './priority';
import type { UnifiedInputs, UnifiedSystemState } from './types';

/** Assemble + normalise the unified system state. NEVER throws. */
export function buildUnifiedSystemState(inputs: UnifiedInputs, opts: { now: string }): UnifiedSystemState {
  return {
    investigations: (inputs.investigations ?? []).map((i) => ({
      id: i.id, title: i.title, state: i.state, contributorCount: Math.max(0, Math.floor(i.contributorCount ?? 0)),
      ...(i.agreementScore !== undefined ? { agreementScore: clamp01(i.agreementScore) } : {}),
      ...(i.contentiousness !== undefined ? { contentiousness: clamp01(i.contentiousness) } : {}),
    })),
    consensus: (inputs.consensus ?? []).map((c) => ({
      investigationId: c.investigationId, position: c.position, agreement: clamp01(c.agreement), confidence: clamp01(c.confidence), disputed: c.disputed === true,
    })),
    forecasts: (inputs.forecasts ?? []).map((f) => ({
      id: f.id, prediction: f.prediction, confidence: clamp01(f.confidence), reliability: clamp01(f.reliability), status: f.status,
    })),
    warnings: (inputs.warnings ?? []).map((w) => ({ id: w.id, kind: w.kind, level: w.level, title: w.title })),
    trust: (inputs.trust ?? []).map((t) => ({
      entityType: t.entityType, entityId: t.entityId, score: Math.max(0, Math.min(100, t.score)), band: t.band, ...(t.trend ? { trend: t.trend } : {}),
    })),
    opportunities: (inputs.opportunities ?? []).map((o) => ({ id: o.id, title: o.title, confidence: clamp01(o.confidence), priority: o.priority })),
    scenarios: (inputs.scenarios ?? []).map((s) => ({ id: s.id, title: s.title, state: s.state, likelihood: clamp01(s.likelihood) })),
    governanceQueue: (inputs.governanceQueue ?? []).map((g) => ({ id: g.id, source: g.source, label: g.label, severity: g.severity })),
    operations: {
      activeRuns: Math.max(0, inputs.operations?.activeRuns ?? 0),
      queueDepth: Math.max(0, inputs.operations?.queueDepth ?? 0),
      openEscalations: Math.max(0, inputs.operations?.openEscalations ?? 0),
      overallHealth: inputs.operations?.overallHealth ?? 'HEALTHY',
    },
    publishing: {
      published: Math.max(0, inputs.publishing?.published ?? 0),
      inReview: Math.max(0, inputs.publishing?.inReview ?? 0),
      retracted: Math.max(0, inputs.publishing?.retracted ?? 0),
    },
    outcomes: {
      ...(inputs.outcomes?.successRate !== undefined ? { successRate: clamp01(inputs.outcomes.successRate) } : {}),
      ...(inputs.outcomes?.failureRate !== undefined ? { failureRate: clamp01(inputs.outcomes.failureRate) } : {}),
    },
    generatedAt: opts.now,
  };
}

/** Counts that summarise the unified state. */
export interface SystemStateSummary {
  activeInvestigations: number;
  disputedConsensus: number;
  activeForecasts: number;
  failingForecasts: number;
  criticalWarnings: number;
  totalWarnings: number;
  governancePending: number;
  openEscalations: number;
  avgForecastConfidence: number;
  avgTrust: number;
  summary: string;
}

const ACTIVE_INV = ['ACTIVE', 'UNDER_REVIEW', 'CONSENSUS_FORMING'];

/** Summarise the system state into headline counts + a one-paragraph summary. */
export function summarizeSystemState(state: UnifiedSystemState): SystemStateSummary {
  const activeInvestigations = state.investigations.filter((i) => ACTIVE_INV.includes(i.state)).length;
  const disputedConsensus = state.consensus.filter((c) => c.disputed).length;
  const activeForecasts = state.forecasts.filter((f) => f.status === 'active').length;
  const failingForecasts = state.forecasts.filter((f) => f.status === 'failed').length;
  const criticalWarnings = state.warnings.filter((w) => w.level === 'CRITICAL').length;
  const governancePending = state.governanceQueue.length;
  const openEscalations = state.operations.openEscalations;

  const confs = state.forecasts.map((f) => f.confidence);
  const avgForecastConfidence = confs.length ? round(confs.reduce((a, n) => a + n, 0) / confs.length) : 0;
  const trustScores = state.trust.map((t) => t.score);
  const avgTrust = trustScores.length ? round(trustScores.reduce((a, n) => a + n, 0) / trustScores.length) : 0;

  const summary =
    `System health ${state.operations.overallHealth}. ` +
    `${activeInvestigations} active investigation(s)${disputedConsensus > 0 ? ` (${disputedConsensus} disputed)` : ''}, ` +
    `${activeForecasts} active forecast(s)${failingForecasts > 0 ? ` (${failingForecasts} failing)` : ''} at ${Math.round(avgForecastConfidence * 100)}% avg confidence, ` +
    `${state.warnings.length} early warning(s)${criticalWarnings > 0 ? ` including ${criticalWarnings} CRITICAL` : ''}, ` +
    `${governancePending} governance item(s) pending, ${openEscalations} open escalation(s). ` +
    `Average trust ${Math.round(avgTrust)}/100. All figures are advisory — leadership review required.`;

  return {
    activeInvestigations, disputedConsensus, activeForecasts, failingForecasts,
    criticalWarnings, totalWarnings: state.warnings.length, governancePending, openEscalations,
    avgForecastConfidence, avgTrust, summary,
  };
}
