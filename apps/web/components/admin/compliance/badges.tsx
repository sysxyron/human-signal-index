// =============================================================================
// HSI Phase 41 — compliance badges (pure, server-safe — no 'use client').
// =============================================================================

import { readinessLabel, readinessTone } from '@/lib/compliance/guardrails';
import type {
  EvidenceStatus,
  IncidentStatus,
  PolicyStatus,
  ReadinessStatus,
  RiskSeverity,
  RiskStatus,
  VendorReviewStatus,
} from '@/lib/compliance/types';

const TONE: Record<string, string> = {
  green: '#10B981',
  blue: '#3B82F6',
  orange: '#F59E0B',
  red: '#EF4444',
  purple: '#8B5CF6',
  neutral: '#94A3B8',
};

export function Pill({ label, tone }: { label: string; tone: keyof typeof TONE }) {
  const color = TONE[tone] ?? TONE.neutral;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-label font-semibold capitalize"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      {label}
    </span>
  );
}

export function ReadinessBadge({ status }: { status: ReadinessStatus }) {
  return <Pill label={readinessLabel(status)} tone={readinessTone(status)} />;
}

const SEVERITY_TONE: Record<RiskSeverity, keyof typeof TONE> = {
  low: 'blue',
  medium: 'orange',
  high: 'red',
  critical: 'red',
};
export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  return <Pill label={severity} tone={SEVERITY_TONE[severity] ?? 'neutral'} />;
}

const RISK_TONE: Record<RiskStatus, keyof typeof TONE> = {
  open: 'red',
  mitigating: 'orange',
  accepted: 'blue',
  resolved: 'green',
};
export function RiskStatusBadge({ status }: { status: RiskStatus }) {
  return <Pill label={status} tone={RISK_TONE[status] ?? 'neutral'} />;
}

const INCIDENT_TONE: Record<IncidentStatus, keyof typeof TONE> = {
  investigating: 'red',
  contained: 'orange',
  resolved: 'green',
  postmortem: 'purple',
};
export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Pill label={status} tone={INCIDENT_TONE[status] ?? 'neutral'} />;
}

const POLICY_TONE: Record<PolicyStatus, keyof typeof TONE> = {
  draft: 'orange',
  active: 'green',
  archived: 'neutral',
};
export function PolicyStatusBadge({ status }: { status: PolicyStatus }) {
  return <Pill label={status} tone={POLICY_TONE[status] ?? 'neutral'} />;
}

const EVIDENCE_TONE: Record<EvidenceStatus, keyof typeof TONE> = {
  collected: 'blue',
  verified: 'green',
  stale: 'orange',
  missing: 'red',
};
export function EvidenceStatusBadge({ status }: { status: EvidenceStatus }) {
  return <Pill label={status} tone={EVIDENCE_TONE[status] ?? 'neutral'} />;
}

const VENDOR_TONE: Record<VendorReviewStatus, keyof typeof TONE> = {
  reviewed: 'green',
  pending: 'orange',
  flagged: 'red',
};
export function VendorReviewBadge({ status }: { status: VendorReviewStatus }) {
  return <Pill label={status} tone={VENDOR_TONE[status] ?? 'neutral'} />;
}
