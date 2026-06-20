// =============================================================================
// HSI Phase 66 — Agent registry (PURE metadata). The 8 operational agents are
// registered CENTRALLY here — there is no dynamic code execution; each agent_key
// maps to a fixed, statically-defined handler (see ./handlers). PURE: no I/O.
// =============================================================================

import type { AgentKey, ScheduleCadence } from './types';

export interface AgentDefinition {
  key: AgentKey;
  name: string;
  description: string;
  category: string;
  defaultCadence: ScheduleCadence;
  consumes: string[]; // which phases/services this agent reads (reuse, no duplication)
}

export const AGENT_REGISTRY: AgentDefinition[] = [
  { key: 'SOURCE_HEALTH_AGENT', name: 'Source Health Agent', description: 'Detects source failures, stale sources, collection gaps, and reliability drops.', category: 'monitoring', defaultCadence: 'daily', consumes: ['Phase 61', 'Phase 63'] },
  { key: 'NARRATIVE_WATCH_AGENT', name: 'Narrative Watch Agent', description: 'Tracks narrative growth, decline, fragmentation, and contradiction spikes.', category: 'narrative', defaultCadence: 'daily', consumes: ['Phase 65'] },
  { key: 'GRAPH_ANALYST_AGENT', name: 'Graph Analyst Agent', description: 'Finds isolated nodes, concentration, and highly connected entities.', category: 'graph', defaultCadence: 'weekly', consumes: ['Phase 64'] },
  { key: 'REVIEW_QUEUE_AGENT', name: 'Review Queue Agent', description: 'Detects review bottlenecks, aging submissions, and backlog (no assignments).', category: 'workflow', defaultCadence: 'daily', consumes: ['Submission Queue', 'Review Queue'] },
  { key: 'PUBLICATION_MONITOR_AGENT', name: 'Publication Monitor Agent', description: 'Tracks publication velocity, correction trends, and publication health.', category: 'publication', defaultCadence: 'weekly', consumes: ['Publications', 'Corrections'] },
  { key: 'TRUST_ANOMALY_AGENT', name: 'Trust Anomaly Agent', description: 'Flags unusual trust shifts, concentration, and evidence anomalies (flag only).', category: 'trust', defaultCadence: 'daily', consumes: ['Phase 64', 'Phase 65'] },
  { key: 'EXECUTIVE_BRIEF_AGENT', name: 'Executive Brief Agent', description: 'Produces explainable daily/weekly executive intelligence summaries.', category: 'executive', defaultCadence: 'daily', consumes: ['Phase 61', 'Phase 64', 'Phase 65'] },
  { key: 'FORECAST_PREP_AGENT', name: 'Forecast Prep Agent', description: 'Computes forecast-readiness indicators across Phases 61–65 (no forecasting).', category: 'forecast', defaultCadence: 'weekly', consumes: ['Phase 61', 'Phase 64', 'Phase 65'] },
  { key: 'FORECAST_VALIDATION_AGENT', name: 'Forecast Validation Agent', description: 'Detects due forecasts, evaluates recorded outcomes, computes scores, and raises alerts (validation only — no forecasting).', category: 'forecast', defaultCadence: 'daily', consumes: ['Phase 67'] },
  { key: 'SOURCE_DISCOVERY_AGENT', name: 'Source Discovery Agent', description: 'Suggests new source candidates from domains already referenced in real evidence (never fabricates URLs). All results enter review.', category: 'discovery', defaultCadence: 'weekly', consumes: ['Source Registry', 'Evidence'] },
  { key: 'SIGNAL_SCOUT_AGENT', name: 'Signal Scout Agent', description: 'Suggests signal candidates from real recent signals + watchlist/narrative matches. Never publishes; human review required.', category: 'discovery', defaultCadence: 'daily', consumes: ['Signals', 'Watchlists', 'Narratives'] },
];

export function getAgentDefinition(key: string): AgentDefinition | undefined {
  return AGENT_REGISTRY.find((a) => a.key === key);
}
