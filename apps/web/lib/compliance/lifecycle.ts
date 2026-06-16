// =============================================================================
// HSI Phase 41 — Status lifecycle rules for risks / policies / incidents. PURE.
// Used by the DAL to validate transitions and by the UI to offer next states.
// =============================================================================

import type { IncidentStatus, PolicyStatus, RiskStatus } from './types';

export const RISK_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  open: ['mitigating', 'accepted', 'resolved'],
  mitigating: ['accepted', 'resolved', 'open'],
  accepted: ['resolved', 'open'],
  resolved: ['open'], // reopen
};

export const POLICY_TRANSITIONS: Record<PolicyStatus, PolicyStatus[]> = {
  draft: ['active', 'archived'],
  active: ['archived', 'draft'],
  archived: ['draft'], // restore to draft for revision
};

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  investigating: ['contained', 'resolved'],
  contained: ['resolved', 'investigating'],
  resolved: ['postmortem', 'investigating'],
  postmortem: ['investigating'], // reopen
};

function canTransition<T extends string>(
  map: Record<T, T[]>,
  from: T,
  to: T,
): boolean {
  if (from === to) return true; // idempotent no-op allowed
  return Boolean(map[from]?.includes(to));
}

export const isValidRiskTransition = (from: RiskStatus, to: RiskStatus): boolean =>
  canTransition(RISK_TRANSITIONS, from, to);
export const isValidPolicyTransition = (from: PolicyStatus, to: PolicyStatus): boolean =>
  canTransition(POLICY_TRANSITIONS, from, to);
export const isValidIncidentTransition = (from: IncidentStatus, to: IncidentStatus): boolean =>
  canTransition(INCIDENT_TRANSITIONS, from, to);
