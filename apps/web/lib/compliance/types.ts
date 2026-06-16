// =============================================================================
// HSI Phase 41 — Compliance readiness types (shared by DAL, pages, exports).
// Mirrors migration 0045. Pure type module — safe in client + server.
// =============================================================================

export type ReadinessStatus =
  | 'ready'
  | 'in_progress'
  | 'not_applicable'
  | 'evidence_available'
  | 'needs_policy';

export const READINESS_STATUSES: readonly ReadinessStatus[] = [
  'ready',
  'in_progress',
  'not_applicable',
  'evidence_available',
  'needs_policy',
];

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'open' | 'mitigating' | 'accepted' | 'resolved';
export type IncidentStatus = 'investigating' | 'contained' | 'resolved' | 'postmortem';
export type PolicyStatus = 'draft' | 'active' | 'archived';
export type EvidenceStatus = 'collected' | 'verified' | 'stale' | 'missing';
export type EvidenceType =
  | 'audit_log'
  | 'screenshot'
  | 'policy'
  | 'report'
  | 'system_setting'
  | 'migration'
  | 'incident_record'
  | 'access_review'
  | 'export';
export type VendorRisk = 'low' | 'medium' | 'high' | 'critical';
export type VendorReviewStatus = 'pending' | 'reviewed' | 'flagged';
export type VendorDataAccess = 'none' | 'metadata' | 'limited' | 'full';
export type RetentionStatus = 'planned' | 'active' | 'not_applicable';
export type ExportFormat = 'csv' | 'json';

export interface ComplianceFramework {
  id: string;
  key: string;
  name: string;
  category?: string;
  status: ReadinessStatus;
  summary?: string;
  last_reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComplianceControl {
  id: string;
  key: string;
  name: string;
  category: string;
  description?: string;
  status: ReadinessStatus;
  frameworks: string[];
  owner?: string;
  last_reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComplianceEvidence {
  id: string;
  organization_id?: string | null;
  control_id?: string | null;
  title: string;
  evidence_type: EvidenceType;
  status: EvidenceStatus;
  reference_url?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComplianceRisk {
  id: string;
  organization_id?: string | null;
  title: string;
  description?: string;
  severity: RiskSeverity;
  status: RiskStatus;
  owner?: string;
  mitigation?: string;
  review_date?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CompliancePolicy {
  id: string;
  key: string;
  name: string;
  status: PolicyStatus;
  owner?: string;
  summary?: string;
  content_url?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComplianceIncident {
  id: string;
  organization_id?: string | null;
  title: string;
  severity: RiskSeverity;
  status: IncidentStatus;
  affected_system?: string;
  detected_at?: string;
  resolved_at?: string;
  owner?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComplianceVendor {
  id: string;
  key: string;
  name: string;
  service_purpose?: string;
  data_access_level: VendorDataAccess;
  risk_level: VendorRisk;
  review_status: VendorReviewStatus;
  notes?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComplianceRetentionPolicy {
  id: string;
  data_type: string;
  retention_period?: string;
  basis?: string;
  status: RetentionStatus;
  auto_delete: boolean;
  notes?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AccessReviewRow {
  user_id: string;
  email?: string;
  role: string;
  isAdmin: boolean;
  organizations: string[];
  elevated: boolean;
  lastLoginAt?: string;
  inactive: boolean;
}
