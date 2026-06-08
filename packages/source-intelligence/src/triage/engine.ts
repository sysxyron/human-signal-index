// =============================================================================
// @hsi/source-intelligence — TRIAGE engine (Phase 8).
//
// Evaluates a TriageContext against a set of TriageRules. For each ENABLED rule
// whose conditions ALL hold (AND), its actions are emitted with an explainable
// `rationale` (which conditions fired and with what values). Pure, deterministic,
// no clocks/random. Disabled rules are skipped. Actions are DRAFTS/requests —
// triage NEVER auto-publishes or auto-acts; a human decides.
//
// Principle (binding): every emitted action explains WHY it fired.
// =============================================================================

import type {
  TriageAction,
  TriageCondition,
  TriageContext,
  TriageOutcome,
  TriageRule,
} from './types';

/** Resolve the numeric/boolean/array fact for a condition's field. */
function factFor(field: TriageCondition['field'], ctx: TriageContext): unknown {
  switch (field) {
    case 'risk_level':
      return ctx.riskLevel ?? 0;
    case 'drift_severity':
      return ctx.driftSeverity ?? 0;
    case 'watchlist_match':
      return ctx.watchlistMatches ?? [];
    case 'source_failures':
      return ctx.sourceFailureCount ?? 0;
    case 'contradiction':
      return ctx.contradiction ?? false;
    case 'category':
      return ctx.category ?? '';
    case 'confidence':
      return ctx.confidence ?? 0;
    default:
      return undefined;
  }
}

/** Evaluate one condition against the context. Deterministic + total. */
function evalCondition(cond: TriageCondition, ctx: TriageContext): boolean {
  const fact = factFor(cond.field, ctx);
  switch (cond.op) {
    case 'gte':
      return typeof fact === 'number' && typeof cond.value === 'number' && fact >= cond.value;
    case 'lte':
      return typeof fact === 'number' && typeof cond.value === 'number' && fact <= cond.value;
    case 'eq':
      return fact === cond.value;
    case 'in': {
      // `in` means: the fact (or any element of an array fact) is IN cond.value[].
      if (!Array.isArray(cond.value)) return false;
      const allowed: unknown[] = cond.value;
      if (Array.isArray(fact)) return fact.some((f) => allowed.includes(f));
      return allowed.includes(fact);
    }
    case 'is_true':
      // `watchlist_match` is_true → at least one match present.
      if (Array.isArray(fact)) return fact.length > 0;
      return fact === true;
    default:
      return false;
  }
}

/** Human-readable phrase for a single condition outcome (for the rationale). */
function describeCondition(cond: TriageCondition, ctx: TriageContext): string {
  const fact = factFor(cond.field, ctx);
  const factStr = Array.isArray(fact) ? `[${fact.join(', ')}]` : String(fact);
  const valStr = Array.isArray(cond.value) ? `[${cond.value.join(', ')}]` : String(cond.value);
  switch (cond.op) {
    case 'gte':
      return `${cond.field} ${factStr} ≥ ${valStr}`;
    case 'lte':
      return `${cond.field} ${factStr} ≤ ${valStr}`;
    case 'eq':
      return `${cond.field} = ${valStr}`;
    case 'in':
      return `${cond.field} ${factStr} ∈ ${valStr}`;
    case 'is_true':
      return `${cond.field} is present/true (${factStr})`;
    default:
      return `${cond.field} ${cond.op} ${valStr}`;
  }
}

/**
 * Evaluate a TriageContext against rules. Returns matched rule ids and the
 * actions to take, each with an explainable rationale. Pure & deterministic.
 */
export function evaluateTriage(ctx: TriageContext, rules: TriageRule[]): TriageOutcome {
  const matchedRuleIds: string[] = [];
  const actions: TriageOutcome['actions'] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue; // disabled rules are skipped
    if (rule.conditions.length === 0) continue; // no conditions → never fires
    const allHold = rule.conditions.every((c) => evalCondition(c, ctx));
    if (!allHold) continue;

    matchedRuleIds.push(rule.id);
    const why = rule.conditions.map((c) => describeCondition(c, ctx)).join(' AND ');
    const target = ctx.signalId
      ? `signal ${ctx.signalId}`
      : ctx.sourceId
        ? `source ${ctx.sourceId}`
        : 'the context';
    for (const action of rule.actions) {
      actions.push({
        type: action.type,
        params: action.params,
        rationale:
          `Rule "${rule.name}" fired for ${target} because ${why}. ` +
          `→ ${action.type}. This is a DRAFT/request for human review — not auto-actioned.`,
      });
    }
  }

  return { matchedRuleIds, actions };
}

/**
 * DEFAULT triage rules implementing the Phase-8 spec. Thresholds are explicit
 * and explainable; tune per deployment. All actions are DRAFTS/requests.
 */
export const DEFAULT_TRIAGE_RULES: TriageRule[] = [
  {
    id: 'tr_high_risk_signal',
    name: 'High-risk signal',
    description: 'A high risk_level signal → create an alert and submit for review.',
    enabled: true,
    conditions: [{ field: 'risk_level', op: 'gte', value: 0.7 }],
    actions: [
      { type: 'create_alert', params: { severity: 'HIGH', alertType: 'high_risk_signal' } },
      { type: 'submit_review', params: { priority: 'high' } },
    ],
  },
  {
    id: 'tr_high_drift',
    name: 'High drift severity',
    description: 'A large narrative drift → create an alert and assign an SLA.',
    enabled: true,
    conditions: [{ field: 'drift_severity', op: 'gte', value: 0.6 }],
    actions: [
      { type: 'create_alert', params: { severity: 'HIGH', alertType: 'narrative_shift' } },
      { type: 'assign_sla', params: { severity: 'HIGH' } },
    ],
  },
  {
    id: 'tr_watchlist_match',
    name: 'Watchlist match',
    description: 'Any watchlist match → create an alert for review.',
    enabled: true,
    conditions: [{ field: 'watchlist_match', op: 'is_true', value: true }],
    actions: [
      { type: 'create_alert', params: { severity: 'MEDIUM', alertType: 'watchlist_match' } },
    ],
  },
  {
    id: 'tr_source_failures',
    name: 'Repeated source failures',
    description: 'Repeated capture failures → degrade source health.',
    enabled: true,
    conditions: [{ field: 'source_failures', op: 'gte', value: 3 }],
    actions: [{ type: 'degrade_source_health', params: { reason: 'repeated_capture_failures' } }],
  },
  {
    id: 'tr_contradiction',
    name: 'Contradiction detected',
    description: 'A detected contradiction → request a research review.',
    enabled: true,
    conditions: [{ field: 'contradiction', op: 'is_true', value: true }],
    actions: [{ type: 'request_research_review', params: { reason: 'contradiction_detected' } }],
  },
];
