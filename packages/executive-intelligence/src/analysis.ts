// =============================================================================
// @hsi/executive-intelligence — RISK / OPPORTUNITY / ATTENTION analysis.
//
// computeOperationalRisk derives risks from warnings, failing forecasts, disputed
// consensus, low trust, and open escalations. computeStrategicOpportunity derives
// opportunities from research opportunities, high-confidence forecasts, strong
// consensus, and high-trust publishable findings. computeExecutiveAttention rolls
// the most-demanding items into a 0..100 attention index. All advisory.
// =============================================================================

import { attentionForScore, clamp01, round } from './priority';
import type {
  ExecutiveAttention,
  ExecutiveSeverity,
  OperationalRisk,
  StrategicOpportunity,
  UnifiedSystemState,
} from './types';

const WARNING_SEVERITY: Record<string, ExecutiveSeverity> = { CRITICAL: 'CRITICAL', WARNING: 'HIGH', WATCH: 'MEDIUM', INFO: 'LOW' };
const SEVERITY_LIKELIHOOD: Record<ExecutiveSeverity, number> = { CRITICAL: 0.85, HIGH: 0.65, MEDIUM: 0.45, LOW: 0.25 };

function riskScore(likelihood: number, impact: number): number {
  return round(clamp01(likelihood) * clamp01(impact) * 100);
}

/** Derive operational risks from the unified state. Sorted high→low. */
export function computeOperationalRisk(state: UnifiedSystemState): OperationalRisk[] {
  const risks: OperationalRisk[] = [];

  // 1. Early warnings (WARNING/CRITICAL).
  for (const w of state.warnings.filter((x) => x.level === 'WARNING' || x.level === 'CRITICAL')) {
    const severity = WARNING_SEVERITY[w.level];
    const likelihood = SEVERITY_LIKELIHOOD[severity];
    const impact = severity === 'CRITICAL' ? 0.85 : 0.65;
    risks.push({
      id: `risk-warn-${w.id}`, title: w.title, source: `warning:${w.kind}`, severity, likelihood, impact, score: riskScore(likelihood, impact),
      explanation: [`Early warning '${w.kind}' at ${w.level} level.`], recommendation: 'Acknowledge or resolve the warning (advisory).',
    });
  }
  // 2. Failing forecasts.
  for (const f of state.forecasts.filter((x) => x.status === 'failed')) {
    const likelihood = 0.7; const impact = clamp01(f.confidence);
    risks.push({
      id: `risk-fc-${f.id}`, title: `Failed forecast: ${f.prediction}`, source: 'forecast', severity: impact >= 0.7 ? 'HIGH' : 'MEDIUM', likelihood, impact, score: riskScore(likelihood, impact),
      explanation: [`A forecast at ${Math.round(f.confidence * 100)}% confidence failed.`], recommendation: 'Review what invalidated the forecast; recalibrate (advisory).',
    });
  }
  // 3. Disputed consensus.
  for (const c of state.consensus.filter((x) => x.disputed)) {
    const likelihood = clamp01(1 - c.agreement); const impact = 0.6;
    risks.push({
      id: `risk-con-${c.investigationId}`, title: `Disputed consensus: ${c.position ?? 'unresolved'}`, source: 'consensus', severity: c.agreement < 0.4 ? 'HIGH' : 'MEDIUM', likelihood, impact, score: riskScore(likelihood, impact),
      explanation: [`Consensus agreement only ${Math.round(c.agreement * 100)}% — contested.`], recommendation: 'Route to governance; hold dependent decisions (advisory).',
    });
  }
  // 4. Low / collapsing trust.
  for (const t of state.trust.filter((x) => x.score < 40 || x.trend === 'degrading' || x.trend === 'volatile')) {
    const likelihood = clamp01((50 - Math.min(50, t.score)) / 50 + (t.trend === 'degrading' ? 0.3 : 0)); const impact = 0.7;
    risks.push({
      id: `risk-trust-${t.entityType}-${t.entityId}`, title: `Trust risk: ${t.entityType} ${t.entityId}`, source: 'trust', severity: t.score < 30 ? 'HIGH' : 'MEDIUM', likelihood: clamp01(likelihood), impact, score: riskScore(likelihood, impact),
      explanation: [`Trust ${Math.round(t.score)}/100${t.trend ? `, ${t.trend}` : ''}.`], recommendation: 'Open a recalibration proposal via trust governance (advisory).',
    });
  }
  // 5. Open escalations (aggregate).
  if (state.operations.openEscalations > 0) {
    const likelihood = clamp01(state.operations.openEscalations / 10); const impact = 0.6;
    risks.push({
      id: 'risk-escalations', title: `${state.operations.openEscalations} open escalation(s)`, source: 'operations', severity: state.operations.openEscalations >= 5 ? 'HIGH' : 'MEDIUM', likelihood, impact, score: riskScore(likelihood, impact),
      explanation: [`${state.operations.openEscalations} operational escalation(s) await attention.`], recommendation: 'Triage the escalation queue (advisory).',
    });
  }

  return risks.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Derive strategic opportunities from the unified state. Sorted high→low. */
export function computeStrategicOpportunity(state: UnifiedSystemState): StrategicOpportunity[] {
  const opps: StrategicOpportunity[] = [];
  const PRIORITY_VALUE: Record<string, number> = { CRITICAL: 0.9, HIGH: 0.7, NORMAL: 0.5, LOW: 0.3 };

  // 1. Proposed research opportunities.
  for (const o of state.opportunities) {
    const value = PRIORITY_VALUE[o.priority] ?? 0.5; const confidence = clamp01(o.confidence);
    opps.push({
      id: `opp-research-${o.id}`, title: o.title, source: 'research', value, confidence, score: round(value * confidence * 100),
      explanation: [`${o.priority} research opportunity at ${Math.round(o.confidence * 100)}% confidence.`], recommendation: 'Triage and consider accepting the opportunity (advisory).',
    });
  }
  // 2. High-confidence, reliable forecasts.
  for (const f of state.forecasts.filter((x) => x.status === 'active' && x.confidence >= 0.7 && x.reliability >= 0.6)) {
    const value = clamp01(f.confidence); const confidence = clamp01(f.reliability);
    opps.push({
      id: `opp-fc-${f.id}`, title: `Actionable forecast: ${f.prediction}`, source: 'forecast', value, confidence, score: round(value * confidence * 100),
      explanation: [`High-confidence (${Math.round(f.confidence * 100)}%), reliable (${Math.round(f.reliability * 100)}%) forecast.`], recommendation: 'Plan ahead of the forecast; verify before acting (advisory).',
    });
  }
  // 3. Strong, undisputed consensus ready to publish.
  for (const c of state.consensus.filter((x) => !x.disputed && x.agreement >= 0.7 && x.confidence >= 0.6)) {
    const value = clamp01(c.confidence); const confidence = clamp01(c.agreement);
    opps.push({
      id: `opp-con-${c.investigationId}`, title: `Publishable finding: ${c.position ?? 'consensus'}`, source: 'consensus', value, confidence, score: round(value * confidence * 100),
      explanation: [`Strong consensus (${Math.round(c.agreement * 100)}% agreement) ready for governance.`], recommendation: 'Route to publishing governance for review (advisory).',
    });
  }

  return opps.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Compute the executive attention index + the items demanding attention. */
export function computeExecutiveAttention(state: UnifiedSystemState): ExecutiveAttention {
  const items: ExecutiveAttention['items'] = [];
  let pressure = 0;

  const critical = state.warnings.filter((w) => w.level === 'CRITICAL');
  for (const w of critical) {
    items.push({ id: w.id, label: w.title, level: 'urgent', reason: 'CRITICAL early warning' });
    pressure += 18;
  }
  for (const c of state.consensus.filter((x) => x.disputed)) {
    items.push({ id: c.investigationId, label: `Disputed: ${c.position ?? 'consensus'}`, level: 'elevated', reason: 'contested consensus' });
    pressure += 10;
  }
  for (const f of state.forecasts.filter((x) => x.status === 'failed')) {
    items.push({ id: f.id, label: `Failed forecast: ${f.prediction}`, level: 'elevated', reason: 'forecast failure' });
    pressure += 8;
  }
  for (const g of state.governanceQueue.filter((x) => x.severity === 'CRITICAL' || x.severity === 'HIGH')) {
    items.push({ id: g.id, label: g.label, level: g.severity === 'CRITICAL' ? 'urgent' : 'elevated', reason: 'governance decision pending' });
    pressure += g.severity === 'CRITICAL' ? 12 : 8;
  }
  for (const t of state.trust.filter((x) => x.score < 30)) {
    items.push({ id: t.entityId, label: `Low trust: ${t.entityType} ${t.entityId}`, level: 'elevated', reason: 'trust collapse risk' });
    pressure += 9;
  }
  if (state.operations.overallHealth === 'DOWN') pressure += 20;
  else if (state.operations.overallHealth === 'DEGRADED') pressure += 8;

  const index = round(Math.min(100, pressure));
  const level = attentionForScore(index);
  const explanation = [
    `${critical.length} CRITICAL warning(s), ${state.consensus.filter((c) => c.disputed).length} disputed consensus, ` +
      `${state.forecasts.filter((f) => f.status === 'failed').length} failed forecast(s), ${state.governanceQueue.length} governance item(s).`,
    `System health: ${state.operations.overallHealth}. Attention index ${index}/100 (${level}).`,
    'Attention is advisory — it directs where leadership should look, never what to decide.',
  ];

  items.sort((a, b) => (a.level === 'urgent' ? 0 : 1) - (b.level === 'urgent' ? 0 : 1));
  return { index, level, items: items.slice(0, 20), explanation };
}
