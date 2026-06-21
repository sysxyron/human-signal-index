// =============================================================================
// HSI Phase 74 — Executive Intelligence & Early Warning: shared types (PURE).
//
// A DETECTION layer (not prediction) over existing intelligence. Every alert,
// risk status, and divergence verdict is deterministic, explainable, and
// reproducible from real platform data — no black-box scores, no AI ratings, no
// fabricated metrics. Human review remains authoritative. PURE: no I/O.
// =============================================================================

export const ALERT_TYPES = [
  'NARRATIVE_SURGE', 'CONTRADICTION_SPIKE', 'EVIDENCE_GAP', 'FORECAST_DIVERGENCE',
  'TRUST_DEGRADATION', 'GEO_EXPANSION', 'REVIEW_BACKLOG', 'SOURCE_FAILURE',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/** Mirrors the proposed `executive_alerts` table shape. Computed deterministically
 *  (reproducible from data); persistence for acknowledge/resolve is future work. */
export interface ExecutiveAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  summary: string;        // explains the trigger + threshold (traceable)
  sourceCount: number;
  signalCount: number;
  narrativeCount: number;
  regionCount: number;
  status: AlertStatus;
  createdAt: string;
}

export const RISK_CATEGORIES = ['narrative', 'trust', 'evidence', 'forecast', 'operational', 'collection', 'review', 'geo'] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];
export type RiskStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface RiskCard {
  category: RiskCategory;
  label: string;
  status: RiskStatus;
  detail: string;         // the rule + the real numbers behind the status
}

export const DIVERGENCE_STATUSES = ['on_track', 'diverging', 'missed', 'unresolved'] as const;
export type DivergenceStatus = (typeof DIVERGENCE_STATUSES)[number];

export interface ForecastDivergenceRow {
  id: string;
  title: string;
  status: DivergenceStatus;
  ageDays: number | null;
  owner: string;
  confidence: number | null;
  outcome: string | null;
}

export interface ExecutiveBriefSection { heading: string; lines: string[] }
export interface ExecutiveBrief { generatedAt: string; sections: ExecutiveBriefSection[] }
