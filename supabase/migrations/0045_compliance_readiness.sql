-- =============================================================================
-- Human Signal Index — 0045_compliance_readiness.sql
-- Phase 41 — Compliance Readiness Foundation.
--
-- Adds the internal-controls / auditability infrastructure expected by serious
-- buyers (enterprise / government / university / NGO / due-diligence) WITHOUT
-- claiming any certification. Tables: frameworks, controls, evidence, reviews,
-- risk register, policy documents, audit exports, incidents, plus vendors and
-- retention policies (needed for Deliverables K + H).
--
-- GOVERNANCE: ALL writes are ADMIN-ONLY (public.is_admin() from 0011). Global
-- catalog tables (frameworks/controls/policies/vendors/retention) are admin-read;
-- org-relevant tables (evidence/reviews/risks/incidents/audit_exports) are
-- admin-all + organization-scoped read via public.is_org_member() (0039).
--
-- HARD SCOPE: NO changes to RBAC / IAM / middleware / auth / user_roles / billing
-- / Stripe / source ingestion. ADD-ONLY (0001-0044). No automatic deletion of any
-- data (retention is READINESS only — auto_delete defaults false).
-- =============================================================================

-- Shared status vocabulary (Deliverable M — readiness language, never "certified").
-- readiness:  ready | in_progress | not_applicable | evidence_available | needs_policy

-- =============================================================================
-- A. FRAMEWORKS — readiness posture per framework (SOC 2, GDPR, …).
-- =============================================================================
create table if not exists public.compliance_frameworks (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  name              text not null,
  category          text,
  status            text not null default 'in_progress'
                      check (status in ('ready','in_progress','not_applicable','evidence_available','needs_policy')),
  summary           text,
  last_reviewed_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.compliance_frameworks is 'HSI Phase 41: compliance framework readiness posture (NOT certification).';
create index if not exists idx_compliance_frameworks_status on public.compliance_frameworks(status);

-- =============================================================================
-- B. CONTROLS — the internal control library; frameworks[] maps each control to
--    the frameworks it supports (drives the readiness matrix in code).
-- =============================================================================
create table if not exists public.compliance_controls (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  name              text not null,
  category          text not null,
  description       text,
  status            text not null default 'in_progress'
                      check (status in ('ready','in_progress','not_applicable','evidence_available','needs_policy')),
  frameworks        text[] not null default '{}',
  owner             text,
  last_reviewed_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.compliance_controls is 'HSI Phase 41: internal control library; frameworks[] lists supported framework keys.';
create index if not exists idx_compliance_controls_category on public.compliance_controls(category);
create index if not exists idx_compliance_controls_status on public.compliance_controls(status);

-- =============================================================================
-- C. EVIDENCE — artifacts attached to controls (audit log, policy, screenshot…).
-- =============================================================================
create table if not exists public.compliance_evidence (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  control_id      uuid references public.compliance_controls(id) on delete set null,
  title           text not null,
  evidence_type   text not null
                    check (evidence_type in ('audit_log','screenshot','policy','report','system_setting','migration','incident_record','access_review','export')),
  status          text not null default 'collected'
                    check (status in ('collected','verified','stale','missing')),
  reference_url   text,
  notes           text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.compliance_evidence is 'HSI Phase 41: compliance evidence vault; linkable to controls.';
create index if not exists idx_compliance_evidence_control on public.compliance_evidence(control_id);
create index if not exists idx_compliance_evidence_org on public.compliance_evidence(organization_id);
create index if not exists idx_compliance_evidence_status on public.compliance_evidence(status);

-- =============================================================================
-- D. REVIEWS — periodic review log over any compliance subject.
-- =============================================================================
create table if not exists public.compliance_reviews (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  subject_type    text not null check (subject_type in ('framework','control','policy','risk','evidence','vendor','access_review')),
  subject_id      uuid,
  reviewer_id     uuid,
  decision        text,
  notes           text,
  reviewed_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
comment on table public.compliance_reviews is 'HSI Phase 41: append-only compliance review log.';
create index if not exists idx_compliance_reviews_subject on public.compliance_reviews(subject_type, subject_id);
create index if not exists idx_compliance_reviews_org on public.compliance_reviews(organization_id);

-- =============================================================================
-- E. RISK REGISTER.
-- =============================================================================
create table if not exists public.compliance_risk_register (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  title           text not null,
  description     text,
  severity        text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status          text not null default 'open' check (status in ('open','mitigating','accepted','resolved')),
  owner           text,
  mitigation      text,
  review_date     date,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.compliance_risk_register is 'HSI Phase 41: compliance/security risk register.';
create index if not exists idx_compliance_risk_status on public.compliance_risk_register(status);
create index if not exists idx_compliance_risk_severity on public.compliance_risk_register(severity);
create index if not exists idx_compliance_risk_org on public.compliance_risk_register(organization_id);

-- =============================================================================
-- F. POLICY DOCUMENTS.
-- =============================================================================
create table if not exists public.compliance_policy_documents (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,
  name            text not null,
  status          text not null default 'draft' check (status in ('draft','active','archived')),
  owner           text,
  summary         text,
  content_url     text,
  reviewed_at     timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.compliance_policy_documents is 'HSI Phase 41: policy register (draft/active/archived).';
create index if not exists idx_compliance_policies_status on public.compliance_policy_documents(status);

-- =============================================================================
-- G. AUDIT EXPORTS — provenance of every compliance export generated.
-- =============================================================================
create table if not exists public.compliance_audit_exports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  export_type     text not null,
  format          text not null check (format in ('csv','json')),
  row_count       integer not null default 0,
  exported_by     uuid,
  created_at      timestamptz not null default now()
);
comment on table public.compliance_audit_exports is 'HSI Phase 41: audit trail of generated compliance exports.';
create index if not exists idx_compliance_exports_type on public.compliance_audit_exports(export_type, created_at desc);
create index if not exists idx_compliance_exports_org on public.compliance_audit_exports(organization_id);

-- =============================================================================
-- H. INCIDENTS.
-- =============================================================================
create table if not exists public.compliance_incidents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  title           text not null,
  severity        text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status          text not null default 'investigating' check (status in ('investigating','contained','resolved','postmortem')),
  affected_system text,
  detected_at     timestamptz,
  resolved_at     timestamptz,
  owner           text,
  notes           text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.compliance_incidents is 'HSI Phase 41: incident response log.';
create index if not exists idx_compliance_incidents_status on public.compliance_incidents(status);
create index if not exists idx_compliance_incidents_org on public.compliance_incidents(organization_id);

-- =============================================================================
-- I. VENDORS (Deliverable K) — vendor / sub-processor register.
-- =============================================================================
create table if not exists public.compliance_vendors (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  name              text not null,
  service_purpose   text,
  data_access_level text not null default 'metadata' check (data_access_level in ('none','metadata','limited','full')),
  risk_level        text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  review_status     text not null default 'pending' check (review_status in ('pending','reviewed','flagged')),
  notes             text,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.compliance_vendors is 'HSI Phase 41: vendor / sub-processor security register.';
create index if not exists idx_compliance_vendors_risk on public.compliance_vendors(risk_level);

-- =============================================================================
-- J. RETENTION POLICIES (Deliverable H) — READINESS ONLY (no auto-delete).
-- =============================================================================
create table if not exists public.compliance_retention_policies (
  id               uuid primary key default gen_random_uuid(),
  data_type        text not null unique,
  retention_period text,
  basis            text,
  status           text not null default 'planned' check (status in ('planned','active','not_applicable')),
  auto_delete      boolean not null default false,
  notes            text,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.compliance_retention_policies is 'HSI Phase 41: data-retention readiness (NO automatic deletion this phase).';

-- =============================================================================
-- RLS — admin-only writes everywhere. Global catalog: admin read. Org-relevant
-- tables: admin all + organization-scoped read (is_org_member / null = global).
-- =============================================================================
do $$
declare t text;
begin
  -- Global catalog tables: admin all + admin read.
  foreach t in array array['compliance_frameworks','compliance_controls','compliance_policy_documents','compliance_vendors','compliance_retention_policies']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;

  -- Org-relevant tables: admin all + organization-scoped read.
  foreach t in array array['compliance_evidence','compliance_reviews','compliance_risk_register','compliance_audit_exports','compliance_incidents']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_admin() or (organization_id is not null and public.is_org_member(organization_id)))', t || '_org_read', t);
  end loop;
end$$;

-- =============================================================================
-- SEEDS — idempotent (on conflict (key/data_type) do nothing). Readiness
-- language only; NEVER "certified". Data is the source of truth in production;
-- the TS seed constants (lib/compliance/seeds.ts) mirror this for tests.
-- =============================================================================

-- Frameworks (Deliverable B).
insert into public.compliance_frameworks (key, name, category, status, summary) values
  ('soc2',      'SOC 2',        'security', 'in_progress',        'SOC 2 Trust Services readiness. Controls + evidence being assembled; not certified.'),
  ('gdpr',      'GDPR',         'privacy',  'in_progress',        'EU GDPR readiness: data export/deletion, consent tracking, retention planning.'),
  ('ccpa',      'CCPA/CPRA',    'privacy',  'in_progress',        'California CCPA/CPRA readiness: access/deletion rights, do-not-sell posture.'),
  ('hipaa',     'HIPAA',        'healthcare','not_applicable',    'HIPAA readiness. HSI does not currently process PHI; not certified.'),
  ('pci',       'PCI DSS',      'payments', 'evidence_available', 'PCI boundary readiness: Stripe-hosted checkout; no cardholder data stored.'),
  ('iso27001',  'ISO 27001',    'security', 'in_progress',        'ISO 27001 ISMS readiness: control library, risk register, reviews.'),
  ('ferpa',     'FERPA',        'education','needs_policy',       'FERPA readiness for institutional/student-data conversations; policy pending.'),
  ('ngo_donor', 'NGO / Donor due-diligence', 'governance', 'evidence_available', 'NGO/donor due-diligence readiness: governance, security posture, vendor register.')
on conflict (key) do nothing;

-- Control library (Deliverable D). frameworks[] drives the readiness matrix.
insert into public.compliance_controls (key, name, category, status, frameworks) values
  -- Security
  ('mfa_support',            'MFA support',                 'security', 'ready',              array['soc2','iso27001']),
  ('session_controls',       'Session controls',            'security', 'ready',              array['soc2','iso27001']),
  ('rbac',                   'Role-based access control',   'security', 'ready',              array['soc2','iso27001','gdpr']),
  ('tenant_isolation',       'Tenant isolation (RLS)',      'security', 'ready',              array['soc2','iso27001','gdpr','ngo_donor']),
  ('audit_logging',          'Audit logging',               'audit',    'ready',              array['soc2','iso27001','gdpr','ngo_donor']),
  ('admin_activity_logging', 'Admin activity logging',      'audit',    'ready',              array['soc2','iso27001']),
  ('source_capture_logging', 'Source capture logging',      'audit',    'ready',              array['soc2','iso27001']),
  ('billing_event_logging',  'Billing event logging',       'audit',    'ready',              array['soc2','pci']),
  -- Privacy
  ('data_export_readiness',  'Data export readiness',       'privacy',  'in_progress',        array['gdpr','ccpa']),
  ('data_deletion_readiness','Data deletion readiness',     'privacy',  'in_progress',        array['gdpr','ccpa']),
  ('retention_policy',       'Retention policy readiness',  'retention','in_progress',        array['soc2','gdpr','iso27001']),
  ('user_consent_tracking',  'User consent tracking readiness','privacy','needs_policy',     array['gdpr','ccpa']),
  ('data_classification',    'Data classification readiness','data_governance','in_progress',array['soc2','iso27001','hipaa']),
  -- Operations
  ('backup_tracking',        'Backup tracking',             'operations','in_progress',       array['soc2','iso27001']),
  ('incident_response',      'Incident response',           'operations','in_progress',       array['soc2','iso27001','gdpr']),
  ('vendor_register',        'Vendor register',             'operations','evidence_available',array['soc2','iso27001','ngo_donor']),
  ('risk_register',          'Risk register',               'operations','evidence_available',array['soc2','iso27001','ngo_donor']),
  ('access_reviews',         'Access reviews',              'operations','in_progress',       array['soc2','iso27001']),
  ('business_continuity',    'Business continuity',         'operations','needs_policy',      array['soc2','iso27001']),
  -- Payments
  ('stripe_hosted_checkout', 'Stripe-hosted checkout',      'payments', 'ready',              array['pci']),
  ('no_cardholder_data',     'No cardholder data stored',   'payments', 'ready',              array['pci']),
  ('pci_boundary_docs',      'PCI boundary documentation',  'payments', 'evidence_available', array['pci']),
  -- Healthcare
  ('phi_flag_readiness',     'PHI flag readiness',          'healthcare','not_applicable',    array['hipaa']),
  ('hipaa_not_certified',    'HIPAA-not-certified warning', 'healthcare','ready',             array['hipaa']),
  ('healthcare_data_classification','Healthcare data classification readiness','healthcare','not_applicable',array['hipaa']),
  -- Education
  ('ferpa_readiness_notes',  'FERPA readiness notes',       'education','needs_policy',       array['ferpa']),
  ('student_data_warning',   'Student data warning',        'education','ready',              array['ferpa']),
  ('institutional_privacy_review','Institutional privacy review readiness','education','needs_policy',array['ferpa'])
on conflict (key) do nothing;

-- Vendor register (Deliverable K).
insert into public.compliance_vendors (key, name, service_purpose, data_access_level, risk_level, review_status, notes) values
  ('supabase',   'Supabase',   'Database, auth, storage (primary data platform)', 'full',     'high',   'reviewed', 'Primary data store. RLS-enforced tenant isolation. DPA on file recommended.'),
  ('vercel',     'Vercel',     'Application hosting + serverless functions',       'limited',  'medium', 'reviewed', 'Hosts the web app + cron functions. No primary data store.'),
  ('stripe',     'Stripe',     'Payments (hosted checkout)',                       'limited',  'medium', 'reviewed', 'PCI boundary. Hosted checkout; HSI stores no cardholder data.'),
  ('resend',     'Resend',     'Transactional email delivery',                     'metadata', 'low',    'pending',  'Email addresses + message metadata.'),
  ('cloudflare', 'Cloudflare', 'CDN / DNS / DDoS protection',                      'metadata', 'low',    'pending',  'Edge network; request metadata.'),
  ('protonmail', 'ProtonMail', 'Secure internal/support mailbox',                  'metadata', 'low',    'pending',  'Inbound support + confidential reporting mailbox.')
on conflict (key) do nothing;

-- Policy register (Deliverable G).
insert into public.compliance_policy_documents (key, name, status, summary) values
  ('privacy_policy',        'Privacy Policy',            'draft', 'How HSI collects, uses, and protects personal data.'),
  ('terms_of_service',      'Terms of Service',          'draft', 'Terms governing use of the HSI platform.'),
  ('acceptable_use',        'Acceptable Use Policy',     'draft', 'Permitted and prohibited uses of HSI.'),
  ('data_retention',        'Data Retention Policy',     'draft', 'Retention periods + disposition for each data type.'),
  ('incident_response',     'Incident Response Policy',  'draft', 'Detection, containment, resolution, and postmortem process.'),
  ('access_control',        'Access Control Policy',     'draft', 'RBAC, least privilege, and periodic access reviews.'),
  ('vendor_security',       'Vendor Security Policy',    'draft', 'Vendor risk assessment and review cadence.'),
  ('backup_recovery',       'Backup and Recovery Policy','draft', 'Backup cadence, restoration testing, and RPO/RTO targets.'),
  ('ai_use',                'AI Use Policy',             'draft', 'Responsible-AI use, human-in-the-loop, and provenance.'),
  ('source_collection',     'Source Collection Policy',  'draft', 'Public-only ethical source collection boundaries.')
on conflict (key) do nothing;

-- Retention readiness defaults (Deliverable H) — READINESS ONLY, no auto-delete.
insert into public.compliance_retention_policies (data_type, retention_period, basis, status, auto_delete) values
  ('signals',           'Indefinite (review annually)', 'Operational / intelligence value', 'planned', false),
  ('evidence',          'Indefinite (chain-of-custody)','Provenance integrity',             'planned', false),
  ('investigations',    'Indefinite (review annually)', 'Operational',                      'planned', false),
  ('publications',      'Indefinite',                   'Public record',                    'planned', false),
  ('audit_logs',        '24 months minimum',            'Security / compliance',            'planned', false),
  ('source_snapshots',  '12 months (rolling)',          'Change detection window',          'planned', false),
  ('billing_events',    '7 years',                      'Financial / tax',                  'planned', false),
  ('user_accounts',     'Until deletion request + 30d', 'Account lifecycle',                'planned', false),
  ('organization_data', 'Until contract end + 90d',     'Contractual',                      'planned', false)
on conflict (data_type) do nothing;

-- =============================================================================
-- End of 0045_compliance_readiness.sql
-- =============================================================================
