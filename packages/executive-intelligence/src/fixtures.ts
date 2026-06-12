// =============================================================================
// @hsi/executive-intelligence — deterministic offline fixtures + end-to-end demo.
//
// `executiveDemo()` assembles a unified state from every subsystem and runs the
// full command-center chain: priorities → risks → opportunities → attention →
// snapshot → briefs → report → governance. Deterministic; offline.
// =============================================================================

import { buildUnifiedSystemState } from './unified';
import { buildExecutiveSnapshot, buildDailyIntelligenceReport, rankStrategicPriorities } from './snapshot';
import { generateCriticalBrief, generateGovernanceBrief, generateForecastBrief, generateOperationsBrief, generateWeeklyBrief } from './briefing';
import { approveExecutiveDecision, queueExecutiveReview } from './governance';
import { computeOperationalRisk, computeStrategicOpportunity } from './analysis';
import type { UnifiedInputs } from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** A rich demo unified-state input spanning every subsystem. */
export const DEMO_INPUTS: UnifiedInputs = {
  investigations: [
    { id: 'inv-1', title: 'Reassessing an early settlement date', state: 'CONSENSUS_FORMING', contributorCount: 5, agreementScore: 0.78, contentiousness: 0.3 },
    { id: 'inv-2', title: 'Contested migration route', state: 'ACTIVE', contributorCount: 4, agreementScore: 0.42, contentiousness: 0.7 },
  ],
  consensus: [
    { investigationId: 'inv-1', position: 'Earlier settlement', agreement: 0.78, confidence: 0.7, disputed: false },
    { investigationId: 'inv-2', position: 'Northern route', agreement: 0.42, confidence: 0.5, disputed: true },
  ],
  forecasts: [
    { id: 'fc-1', prediction: 'Narrative N resurges in 30d', confidence: 0.82, reliability: 0.55, status: 'active' },
    { id: 'fc-2', prediction: 'Source S goes dormant', confidence: 0.6, reliability: 0.65, status: 'active' },
    { id: 'fc-3', prediction: 'Spike subsides', confidence: 0.7, reliability: 0.4, status: 'failed' },
  ],
  warnings: [
    { id: 'w-1', kind: 'trust_collapse', level: 'CRITICAL', title: 'Trust collapse: src-reuters' },
    { id: 'w-2', kind: 'forecast_risk', level: 'WARNING', title: 'Forecast at risk: Narrative N' },
    { id: 'w-3', kind: 'signal_acceleration', level: 'WATCH', title: 'Mention velocity accelerating' },
  ],
  trust: [
    { entityType: 'source', entityId: 'src-reuters', score: 28, band: 'low', trend: 'degrading' },
    { entityType: 'narrative', entityId: 'narr-supply', score: 64, band: 'medium', trend: 'stable' },
    { entityType: 'decision', entityId: 'dec-go', score: 73, band: 'high', trend: 'improving' },
  ],
  opportunities: [
    { id: 'opp-1', title: 'Investigate ceramic typology gap', confidence: 0.8, priority: 'HIGH' },
    { id: 'opp-2', title: 'Cross-narrative spillover study', confidence: 0.6, priority: 'NORMAL' },
  ],
  scenarios: [
    { id: 'sc-1', title: 'Narrative resurges', state: 'ACTIVE', likelihood: 0.62 },
    { id: 'sc-2', title: 'Narrative fades', state: 'EMERGING', likelihood: 0.28 },
  ],
  governanceQueue: [
    { id: 'g-1', source: 'recalibration', label: 'Recalibration proposal for src-reuters', severity: 'HIGH' },
    { id: 'g-2', source: 'consensus', label: 'Consensus review for inv-2', severity: 'MEDIUM' },
    { id: 'g-3', source: 'publication', label: 'Publication review: early settlement', severity: 'LOW' },
  ],
  operations: { activeRuns: 6, queueDepth: 12, openEscalations: 2, overallHealth: 'DEGRADED' },
  publishing: { published: 14, inReview: 3, retracted: 1 },
  outcomes: { successRate: 0.71, failureRate: 0.29 },
};

/** Run the full executive command-center chain offline. Deterministic. */
export function executiveDemo() {
  const now = FIXTURE_NOW;
  const state = buildUnifiedSystemState(DEMO_INPUTS, { now });
  const priorities = rankStrategicPriorities(state);
  const risks = computeOperationalRisk(state);
  const opportunities = computeStrategicOpportunity(state);
  const snapshot = buildExecutiveSnapshot(state, { now });
  const report = buildDailyIntelligenceReport(state, { now });
  const briefs = {
    weekly: generateWeeklyBrief(state, { now }),
    critical: generateCriticalBrief(state, { now }),
    governance: generateGovernanceBrief(state, { now }),
    forecast: generateForecastBrief(state, { now }),
    operations: generateOperationsBrief(state, { now }),
  };
  const review = queueExecutiveReview(priorities[0], { now, id: 'rev-1' });
  const decision = approveExecutiveDecision(review, { reviewer: 'exec-alice', reason: 'Confirmed — escalate to governance.' }, { now });

  return { now, state, priorities, risks, opportunities, snapshot, report, briefs, review, decision };
}
