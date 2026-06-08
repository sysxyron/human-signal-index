// =============================================================================
// @hsi/source-intelligence — TRIAGE rule-engine types (Phase 8).
//
// A small, typed DSL for routing signals/sources to human review. Rules are
// DATA (conditions + actions), evaluated deterministically. EVERY action the
// engine emits carries a `rationale` explaining WHY it fired (binding principle:
// every alert/action explains itself). Triage NEVER auto-publishes or auto-acts;
// its actions are DRAFTS/requests for the governance + review pipeline.
// =============================================================================

/** A single typed condition over the facts a signal/source presents. */
export interface TriageCondition {
  field:
    | 'risk_level'
    | 'drift_severity'
    | 'watchlist_match'
    | 'source_failures'
    | 'contradiction'
    | 'category'
    | 'confidence';
  op: 'gte' | 'lte' | 'eq' | 'in' | 'is_true';
  value: unknown;
}

/** An action a rule requests when its conditions all hold (DRAFTS only). */
export interface TriageAction {
  type:
    | 'create_alert'
    | 'submit_review'
    | 'assign_sla'
    | 'degrade_source_health'
    | 'request_research_review'
    | 'draft_research';
  /** Optional parameters (e.g. { severity: 'HIGH' }). */
  params?: Record<string, unknown>;
}

/** A triage rule: conditions are ANDed; matched → actions are requested. */
export interface TriageRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  conditions: TriageCondition[];
  actions: TriageAction[];
}

/** The facts a signal/source presents to the triage engine. */
export interface TriageContext {
  /** 0..1 aggregated risk weighting. */
  riskLevel?: number;
  /** 0..1 magnitude of any detected narrative drift. */
  driftSeverity?: number;
  /** Watchlist matches (names) currently hitting this signal. */
  watchlistMatches?: string[];
  /** Consecutive/recent capture failures for the source. */
  sourceFailureCount?: number;
  /** Whether a contradiction was detected for this narrative. */
  contradiction?: boolean;
  /** Thematic category of the signal. */
  category?: string;
  /** Classifier confidence 0..1. */
  confidence?: number;
  /** Ids carried through for traceable, explainable actions. */
  signalId?: string;
  sourceId?: string;
}

/** The outcome of evaluating a TriageContext against a rule set. */
export interface TriageOutcome {
  matchedRuleIds: string[];
  /** Each action with the rationale for WHY it fired (explainability binding). */
  actions: {
    type: TriageAction['type'];
    params?: Record<string, unknown>;
    rationale: string;
  }[];
}
