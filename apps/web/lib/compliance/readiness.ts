// =============================================================================
// HSI Phase 41 — Framework readiness scoring (Deliverable B). PURE.
//
// Maps the control library onto each framework (via control.frameworks[]) and
// computes present / missing / not-applicable counts + a 0..1 score and a
// readiness STATUS label. NEVER expresses certification — only readiness.
// =============================================================================

import type { ComplianceControl, ReadinessStatus } from './types';

/** A control "counts toward readiness" when it is satisfied. */
export function isControlPresent(status: ReadinessStatus): boolean {
  return status === 'ready' || status === 'evidence_available';
}
/** A control is an outstanding gap when in progress or needing a policy. */
export function isControlMissing(status: ReadinessStatus): boolean {
  return status === 'in_progress' || status === 'needs_policy';
}

export interface FrameworkReadiness {
  frameworkKey: string;
  derivedStatus: ReadinessStatus;
  present: ComplianceControl[];
  missing: ComplianceControl[];
  notApplicable: ComplianceControl[];
  evidenceCount: number;
  applicable: number;
  score: number; // 0..1 over applicable controls (present / applicable)
  percent: number; // 0..100 rounded
}

/** Score a single framework from the control library. PURE. */
export function scoreFramework(
  frameworkKey: string,
  controls: ComplianceControl[],
): FrameworkReadiness {
  const relevant = controls.filter((c) => c.frameworks?.includes(frameworkKey));
  const present: ComplianceControl[] = [];
  const missing: ComplianceControl[] = [];
  const notApplicable: ComplianceControl[] = [];
  let evidenceCount = 0;

  for (const c of relevant) {
    if (c.status === 'not_applicable') notApplicable.push(c);
    else if (isControlPresent(c.status)) present.push(c);
    else missing.push(c);
    if (c.status === 'evidence_available') evidenceCount += 1;
  }

  const applicable = present.length + missing.length;
  const score = applicable === 0 ? 0 : present.length / applicable;
  const percent = Math.round(score * 100);

  let derivedStatus: ReadinessStatus;
  if (relevant.length > 0 && applicable === 0) derivedStatus = 'not_applicable';
  else if (applicable === 0) derivedStatus = 'needs_policy';
  else if (score === 1) derivedStatus = 'ready';
  else if (present.length > 0) derivedStatus = evidenceCount > 0 ? 'evidence_available' : 'in_progress';
  else derivedStatus = 'needs_policy';

  return { frameworkKey, derivedStatus, present, missing, notApplicable, evidenceCount, applicable, score, percent };
}

/** Score every framework key against the control library. PURE. */
export function scoreFrameworks(
  frameworkKeys: string[],
  controls: ComplianceControl[],
): Record<string, FrameworkReadiness> {
  const out: Record<string, FrameworkReadiness> = {};
  for (const k of frameworkKeys) out[k] = scoreFramework(k, controls);
  return out;
}

/** Overall control-library readiness across all controls. PURE. */
export function overallReadiness(controls: ComplianceControl[]): {
  ready: number;
  evidence: number;
  inProgress: number;
  needsPolicy: number;
  notApplicable: number;
  total: number;
  percent: number;
} {
  let ready = 0;
  let evidence = 0;
  let inProgress = 0;
  let needsPolicy = 0;
  let notApplicable = 0;
  for (const c of controls) {
    switch (c.status) {
      case 'ready': ready += 1; break;
      case 'evidence_available': evidence += 1; break;
      case 'in_progress': inProgress += 1; break;
      case 'needs_policy': needsPolicy += 1; break;
      case 'not_applicable': notApplicable += 1; break;
    }
  }
  const applicable = ready + evidence + inProgress + needsPolicy;
  const percent = applicable === 0 ? 0 : Math.round(((ready + evidence) / applicable) * 100);
  return { ready, evidence, inProgress, needsPolicy, notApplicable, total: controls.length, percent };
}
