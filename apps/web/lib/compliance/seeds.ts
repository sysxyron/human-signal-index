// =============================================================================
// HSI Phase 41 — Compliance seed definitions (TS mirror of migration 0045).
//
// Source of truth for production data is the migration's idempotent inserts;
// these constants mirror them for tests and for the admin "re-seed" action
// (idempotent — skips existing keys). PURE.
// =============================================================================

import type {
  ReadinessStatus,
  VendorDataAccess,
  VendorRisk,
  VendorReviewStatus,
} from './types';

export interface FrameworkSeed {
  key: string;
  name: string;
  category: string;
  status: ReadinessStatus;
  summary: string;
}

export interface ControlSeed {
  key: string;
  name: string;
  category: string;
  status: ReadinessStatus;
  frameworks: string[];
}

export interface VendorSeed {
  key: string;
  name: string;
  service_purpose: string;
  data_access_level: VendorDataAccess;
  risk_level: VendorRisk;
  review_status: VendorReviewStatus;
  notes: string;
}

export interface PolicySeed {
  key: string;
  name: string;
  summary: string;
}

export interface RetentionSeed {
  data_type: string;
  retention_period: string;
  basis: string;
}

export const FRAMEWORK_SEEDS: FrameworkSeed[] = [
  { key: 'soc2', name: 'SOC 2', category: 'security', status: 'in_progress', summary: 'SOC 2 Trust Services readiness. Controls + evidence being assembled; not certified.' },
  { key: 'gdpr', name: 'GDPR', category: 'privacy', status: 'in_progress', summary: 'EU GDPR readiness: data export/deletion, consent tracking, retention planning.' },
  { key: 'ccpa', name: 'CCPA/CPRA', category: 'privacy', status: 'in_progress', summary: 'California CCPA/CPRA readiness: access/deletion rights, do-not-sell posture.' },
  { key: 'hipaa', name: 'HIPAA', category: 'healthcare', status: 'not_applicable', summary: 'HIPAA readiness. HSI does not currently process PHI; not certified.' },
  { key: 'pci', name: 'PCI DSS', category: 'payments', status: 'evidence_available', summary: 'PCI boundary readiness: Stripe-hosted checkout; no cardholder data stored.' },
  { key: 'iso27001', name: 'ISO 27001', category: 'security', status: 'in_progress', summary: 'ISO 27001 ISMS readiness: control library, risk register, reviews.' },
  { key: 'ferpa', name: 'FERPA', category: 'education', status: 'needs_policy', summary: 'FERPA readiness for institutional/student-data conversations; policy pending.' },
  { key: 'ngo_donor', name: 'NGO / Donor due-diligence', category: 'governance', status: 'evidence_available', summary: 'NGO/donor due-diligence readiness: governance, security posture, vendor register.' },
];

export const CONTROL_SEEDS: ControlSeed[] = [
  // Security
  { key: 'mfa_support', name: 'MFA support', category: 'security', status: 'ready', frameworks: ['soc2', 'iso27001'] },
  { key: 'session_controls', name: 'Session controls', category: 'security', status: 'ready', frameworks: ['soc2', 'iso27001'] },
  { key: 'rbac', name: 'Role-based access control', category: 'security', status: 'ready', frameworks: ['soc2', 'iso27001', 'gdpr'] },
  { key: 'tenant_isolation', name: 'Tenant isolation (RLS)', category: 'security', status: 'ready', frameworks: ['soc2', 'iso27001', 'gdpr', 'ngo_donor'] },
  { key: 'audit_logging', name: 'Audit logging', category: 'audit', status: 'ready', frameworks: ['soc2', 'iso27001', 'gdpr', 'ngo_donor'] },
  { key: 'admin_activity_logging', name: 'Admin activity logging', category: 'audit', status: 'ready', frameworks: ['soc2', 'iso27001'] },
  { key: 'source_capture_logging', name: 'Source capture logging', category: 'audit', status: 'ready', frameworks: ['soc2', 'iso27001'] },
  { key: 'billing_event_logging', name: 'Billing event logging', category: 'audit', status: 'ready', frameworks: ['soc2', 'pci'] },
  // Privacy
  { key: 'data_export_readiness', name: 'Data export readiness', category: 'privacy', status: 'in_progress', frameworks: ['gdpr', 'ccpa'] },
  { key: 'data_deletion_readiness', name: 'Data deletion readiness', category: 'privacy', status: 'in_progress', frameworks: ['gdpr', 'ccpa'] },
  { key: 'retention_policy', name: 'Retention policy readiness', category: 'retention', status: 'in_progress', frameworks: ['soc2', 'gdpr', 'iso27001'] },
  { key: 'user_consent_tracking', name: 'User consent tracking readiness', category: 'privacy', status: 'needs_policy', frameworks: ['gdpr', 'ccpa'] },
  { key: 'data_classification', name: 'Data classification readiness', category: 'data_governance', status: 'in_progress', frameworks: ['soc2', 'iso27001', 'hipaa'] },
  // Operations
  { key: 'backup_tracking', name: 'Backup tracking', category: 'operations', status: 'in_progress', frameworks: ['soc2', 'iso27001'] },
  { key: 'incident_response', name: 'Incident response', category: 'operations', status: 'in_progress', frameworks: ['soc2', 'iso27001', 'gdpr'] },
  { key: 'vendor_register', name: 'Vendor register', category: 'operations', status: 'evidence_available', frameworks: ['soc2', 'iso27001', 'ngo_donor'] },
  { key: 'risk_register', name: 'Risk register', category: 'operations', status: 'evidence_available', frameworks: ['soc2', 'iso27001', 'ngo_donor'] },
  { key: 'access_reviews', name: 'Access reviews', category: 'operations', status: 'in_progress', frameworks: ['soc2', 'iso27001'] },
  { key: 'business_continuity', name: 'Business continuity', category: 'operations', status: 'needs_policy', frameworks: ['soc2', 'iso27001'] },
  // Payments
  { key: 'stripe_hosted_checkout', name: 'Stripe-hosted checkout', category: 'payments', status: 'ready', frameworks: ['pci'] },
  { key: 'no_cardholder_data', name: 'No cardholder data stored', category: 'payments', status: 'ready', frameworks: ['pci'] },
  { key: 'pci_boundary_docs', name: 'PCI boundary documentation', category: 'payments', status: 'evidence_available', frameworks: ['pci'] },
  // Healthcare
  { key: 'phi_flag_readiness', name: 'PHI flag readiness', category: 'healthcare', status: 'not_applicable', frameworks: ['hipaa'] },
  { key: 'hipaa_not_certified', name: 'HIPAA-not-certified warning', category: 'healthcare', status: 'ready', frameworks: ['hipaa'] },
  { key: 'healthcare_data_classification', name: 'Healthcare data classification readiness', category: 'healthcare', status: 'not_applicable', frameworks: ['hipaa'] },
  // Education
  { key: 'ferpa_readiness_notes', name: 'FERPA readiness notes', category: 'education', status: 'needs_policy', frameworks: ['ferpa'] },
  { key: 'student_data_warning', name: 'Student data warning', category: 'education', status: 'ready', frameworks: ['ferpa'] },
  { key: 'institutional_privacy_review', name: 'Institutional privacy review readiness', category: 'education', status: 'needs_policy', frameworks: ['ferpa'] },
];

export const VENDOR_SEEDS: VendorSeed[] = [
  { key: 'supabase', name: 'Supabase', service_purpose: 'Database, auth, storage (primary data platform)', data_access_level: 'full', risk_level: 'high', review_status: 'reviewed', notes: 'Primary data store. RLS-enforced tenant isolation. DPA on file recommended.' },
  { key: 'vercel', name: 'Vercel', service_purpose: 'Application hosting + serverless functions', data_access_level: 'limited', risk_level: 'medium', review_status: 'reviewed', notes: 'Hosts the web app + cron functions. No primary data store.' },
  { key: 'stripe', name: 'Stripe', service_purpose: 'Payments (hosted checkout)', data_access_level: 'limited', risk_level: 'medium', review_status: 'reviewed', notes: 'PCI boundary. Hosted checkout; HSI stores no cardholder data.' },
  { key: 'resend', name: 'Resend', service_purpose: 'Transactional email delivery', data_access_level: 'metadata', risk_level: 'low', review_status: 'pending', notes: 'Email addresses + message metadata.' },
  { key: 'cloudflare', name: 'Cloudflare', service_purpose: 'CDN / DNS / DDoS protection', data_access_level: 'metadata', risk_level: 'low', review_status: 'pending', notes: 'Edge network; request metadata.' },
  { key: 'protonmail', name: 'ProtonMail', service_purpose: 'Secure internal/support mailbox', data_access_level: 'metadata', risk_level: 'low', review_status: 'pending', notes: 'Inbound support + confidential reporting mailbox.' },
];

export const POLICY_SEEDS: PolicySeed[] = [
  { key: 'privacy_policy', name: 'Privacy Policy', summary: 'How HSI collects, uses, and protects personal data.' },
  { key: 'terms_of_service', name: 'Terms of Service', summary: 'Terms governing use of the HSI platform.' },
  { key: 'acceptable_use', name: 'Acceptable Use Policy', summary: 'Permitted and prohibited uses of HSI.' },
  { key: 'data_retention', name: 'Data Retention Policy', summary: 'Retention periods + disposition for each data type.' },
  { key: 'incident_response', name: 'Incident Response Policy', summary: 'Detection, containment, resolution, and postmortem process.' },
  { key: 'access_control', name: 'Access Control Policy', summary: 'RBAC, least privilege, and periodic access reviews.' },
  { key: 'vendor_security', name: 'Vendor Security Policy', summary: 'Vendor risk assessment and review cadence.' },
  { key: 'backup_recovery', name: 'Backup and Recovery Policy', summary: 'Backup cadence, restoration testing, and RPO/RTO targets.' },
  { key: 'ai_use', name: 'AI Use Policy', summary: 'Responsible-AI use, human-in-the-loop, and provenance.' },
  { key: 'source_collection', name: 'Source Collection Policy', summary: 'Public-only ethical source collection boundaries.' },
];

export const RETENTION_SEEDS: RetentionSeed[] = [
  { data_type: 'signals', retention_period: 'Indefinite (review annually)', basis: 'Operational / intelligence value' },
  { data_type: 'evidence', retention_period: 'Indefinite (chain-of-custody)', basis: 'Provenance integrity' },
  { data_type: 'investigations', retention_period: 'Indefinite (review annually)', basis: 'Operational' },
  { data_type: 'publications', retention_period: 'Indefinite', basis: 'Public record' },
  { data_type: 'audit_logs', retention_period: '24 months minimum', basis: 'Security / compliance' },
  { data_type: 'source_snapshots', retention_period: '12 months (rolling)', basis: 'Change detection window' },
  { data_type: 'billing_events', retention_period: '7 years', basis: 'Financial / tax' },
  { data_type: 'user_accounts', retention_period: 'Until deletion request + 30d', basis: 'Account lifecycle' },
  { data_type: 'organization_data', retention_period: 'Until contract end + 90d', basis: 'Contractual' },
];
