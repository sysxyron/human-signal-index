// =============================================================================
// HSI Phase 41 — Compliance language guardrails (Deliverable M). PURE.
//
// HSI is compliance-READY, not certified. This module is the single source of
// truth for the readiness vocabulary and a validator that refuses any string
// claiming certification ("SOC 2 Certified", "HIPAA Certified", …). UI labels
// and exports route through here so a certification claim can never ship.
// =============================================================================

import type { ReadinessStatus } from './types';

/** The disclaimer shown across the compliance UI + exports + docs. */
export const COMPLIANCE_DISCLAIMER =
  'HSI is compliance-ready, not certified. The platform provides internal controls, ' +
  'auditability, tenant isolation, access controls, retention planning, vendor ' +
  'tracking, and evidence management to support future certification or customer ' +
  'due diligence. HSI is not currently certified under SOC 2, ISO 27001, HIPAA, ' +
  'PCI DSS, or FERPA.';

/** Human label for a readiness status (never implies certification). */
export function readinessLabel(status: ReadinessStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'in_progress':
      return 'In progress';
    case 'not_applicable':
      return 'Not applicable';
    case 'evidence_available':
      return 'Evidence available';
    case 'needs_policy':
      return 'Needs policy';
    default:
      return 'Unknown';
  }
}

/** A tone token (matches the app palette) for a readiness status. */
export function readinessTone(status: ReadinessStatus): 'green' | 'blue' | 'orange' | 'neutral' {
  switch (status) {
    case 'ready':
      return 'green';
    case 'evidence_available':
      return 'blue';
    case 'in_progress':
    case 'needs_policy':
      return 'orange';
    case 'not_applicable':
    default:
      return 'neutral';
  }
}

/** Approved framework-readiness phrasings (Deliverable M). */
export const APPROVED_FRAMEWORK_PHRASES: Record<string, string> = {
  soc2: 'SOC 2 readiness',
  gdpr: 'GDPR readiness',
  ccpa: 'CCPA readiness',
  hipaa: 'HIPAA readiness',
  pci: 'PCI boundary readiness',
  iso27001: 'ISO 27001 readiness',
  ferpa: 'FERPA readiness',
  ngo_donor: 'NGO/donor due-diligence readiness',
};

/**
 * Forbidden phrasings — any claim of certification. Matched case-insensitively.
 * "<framework> certified" / "certified <framework>" / "<framework> compliant".
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bsoc\s*2\s*(?:type\s*(?:i{1,2}|1|2)\s*)?certified\b/i,
  /\bhipaa\s*certified\b/i,
  /\bpci\s*(?:dss\s*)?certified\b/i,
  /\biso\s*27001\s*certified\b/i,
  /\bferpa\s*certified\b/i,
  /\bgdpr\s*certified\b/i,
  /\bcertified\s+(?:soc\s*2|hipaa|pci|iso\s*27001|ferpa|gdpr)\b/i,
  /\b(?:soc\s*2|hipaa|pci\s*dss|iso\s*27001|ferpa)\s*compliant\b/i,
  /\bfully\s+compliant\b/i,
];

/** True if the text contains a forbidden certification/compliance claim. PURE. */
export function containsCertificationClaim(text: string): boolean {
  if (!text) return false;
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

/**
 * Assert a string is safe to display (no certification claim). Returns the text
 * unchanged when safe; throws when it contains a forbidden claim. Used to guard
 * any free-text that flows into compliance UI / exports.
 */
export function assertNoCertificationClaim(text: string): string {
  if (containsCertificationClaim(text)) {
    throw new Error(
      `Refusing certification claim in compliance text: "${text}". ` +
        'HSI is compliance-ready, not certified — use "readiness" language.',
    );
  }
  return text;
}
