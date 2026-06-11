-- =============================================================================
-- Human Signal Index — 0021_trust_history_and_governance.sql
-- WorldForge / HSI (Phase 17) — Public Trust, Recalibration & Intelligence
-- Governance.
--
-- Phase 17 sits on top of the Phase-16 calibration & trust layer (migration
-- 0020). Where Phase 16 MEASURES trust at a point in time, Phase 17 tracks how
-- trust EVOLVES, detects drift, recommends recalibration, routes it through
-- governance, and publishes trust transparently:
--
--   * hsin_trust_history          — APPEND-ONLY trust snapshots over time (one
--       row per (entity, moment): trust_score/confidence/calibration/band). The
--       series behind the trend + drift analysis. NOTHING overwrites history.
--   * hsin_trust_drift            — detected trust-drift events (collapse /
--       degradation / instability / over- / under-confidence / stable) with
--       severity, magnitude, evidence, and an advisory recommendation.
--   * hsin_recalibration_proposals— RECOMMENDED confidence recalibrations
--       (proposal only — never auto-applied): current vs recommended confidence,
--       trigger, direction, severity, reason, supporting evidence, status.
--   * hsin_recalibration_reviews  — governance decisions over a proposal
--       (approved / rejected) with reviewer, reason, previous→new state,
--       reversible flag, and an append-only audit trail.
--   * hsin_trust_overrides        — APPEND-ONLY record of applied trust changes
--       (previous→new score/band, reason, who) — the auditable, reversible trail
--       of every human trust change.
--   * hsin_trust_publications     — trust attached to published intelligence
--       (confidence + calibrated reliability + trust score + provenance) per
--       research / evidence / decision / forecast / simulation report.
--
-- It also EXTENDS the hsin_decision_alerts.alert_type CHECK (last set in 0020)
-- with the four NEW Phase-17 alert types (trust_degrading, trust_instability,
-- recalibration_required, trust_override_applied) while keeping ALL existing ones
-- (six Phase-15 + four Phase-16, which already includes trust_collapse).
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7-16 / migrations 0011-0020).
-- ---------------------------------------------------------------------------
-- entity_id is a POLYMORPHIC text reference (a source/narrative/decision uuid OR a
-- forecast/recommendation key) — like the Phase-16 trust-entity model — so it
-- carries NO FK; (entity_type, entity_id) is indexed instead. created_by /
-- reviewer_id / overridden_by / published_by reference public.users(id) on delete
-- set null. proposal_id FKs reference public.hsin_recalibration_proposals(id).
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY (plus the one ALTER to extend the existing CHECK on
-- hsin_decision_alerts). It does NOT edit migrations 0001-0020, drop existing
-- policies/roles/helpers, or touch any other existing table/RLS.
--
-- CONVENTIONS (match 0001-0020):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz not null default now().
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - The shared public.set_updated_at() trigger (from 0003) is attached ONLY to
--     the one mutable table (hsin_recalibration_proposals — its status changes on
--     a decision). The five APPEND-ONLY tables carry no updated_at trigger.
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- ROLE / ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   READ: researcher / reviewer / curator / admin may read trust history,
--     drift, proposals, reviews, overrides, and publications — guarded by
--     public.is_researcher_or_above() on SELECT.
--   WRITE: only curator / admin may produce/modify trust history, drift,
--     proposals, reviews, overrides, and publications (governance is a curator+
--     action) — guarded by public.is_curator_or_admin() on INSERT/UPDATE/DELETE.
--   admin has full control everywhere (public.is_admin()).
--   The background TRUST-MONITORING / ALERT WORKER uses the Supabase service_role
--   key, which BYPASSES RLS entirely — it records trust snapshots, detects drift,
--   raises proposals, and raises the four new alert types without these policies.
-- =============================================================================

-- =============================================================================
-- A. EXTEND hsin_decision_alerts.alert_type (last set by migration 0020)
-- Add the 4 NEW Phase-17 alert types while keeping ALL existing ones (six
-- Phase-15 + four Phase-16). The 0020 CHECK was named
-- hsin_decision_alerts_alert_type_check; drop that and re-add the full set.
-- (trust_collapse already exists from Phase 16 — not duplicated here.)
-- =============================================================================
alter table public.hsin_decision_alerts
  drop constraint if exists hsin_decision_alerts_alert_type_check;

alter table public.hsin_decision_alerts
  add constraint hsin_decision_alerts_alert_type_check check (alert_type in (
    -- existing Phase-15 alert types
    'recommendation_failed','confidence_drift','narrative_spike',
    'forecast_miss','resurgence','security_anomaly',
    -- existing Phase-16 alert types
    'calibration_drift','trust_collapse','confidence_instability','forecast_miscalibration',
    -- new Phase-17 alert types
    'trust_degrading','trust_instability','recalibration_required','trust_override_applied'));

-- =============================================================================
-- B. TABLES
-- =============================================================================

-- ---------- hsin_trust_history ------------------------------------------------
-- APPEND-ONLY trust snapshots over time. One row per (entity, moment): the
-- trust_score (0..100) + the signals behind it. The series powering trend + drift.
-- NOTHING ever overwrites a snapshot — history is only added.
create table if not exists public.hsin_trust_history (
  id                uuid primary key default gen_random_uuid(),
  entity_type       text check (entity_type in (
                      'source','narrative','forecast','intervention','recommendation','decision')),
  entity_id         text,
  trust_score       numeric check (trust_score >= 0 and trust_score <= 100),
  confidence        numeric check (confidence >= 0 and confidence <= 1),
  calibration_score numeric,
  evidence_count    int default 0,
  band              text check (band in ('low','medium','high')),
  snapshot_at       timestamptz,
  source_snapshot   jsonb,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
comment on table public.hsin_trust_history is
  'HSIN Phase 17: APPEND-ONLY trust snapshots over time (per entity/moment: trust_score/confidence/calibration/band). The series behind trend + drift; never overwritten.';

-- ---------- hsin_trust_drift --------------------------------------------------
-- A detected trust-drift event: how the latest trust compares to its baseline.
-- drift_kind classifies the shift; severity/magnitude size it; evidence carries
-- the numbers; recommendation is ADVISORY (never an auto-correction).
create table if not exists public.hsin_trust_drift (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text check (entity_type in (
                   'source','narrative','forecast','intervention','recommendation','decision')),
  entity_id      text,
  drift_kind     text check (drift_kind in (
                   'collapse','degradation','instability','overconfidence','underconfidence','stable')),
  severity       text check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  magnitude      numeric,
  current_trust  numeric,
  baseline_trust numeric,
  reason         text,
  evidence       jsonb,
  recommendation text,
  detected_at    timestamptz,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_trust_drift is
  'HSIN Phase 17: detected trust-drift events (collapse/degradation/instability/over-/under-confidence/stable) with severity, magnitude, evidence, and an advisory recommendation.';

-- ---------- hsin_recalibration_proposals --------------------------------------
-- A RECOMMENDED confidence recalibration — PROPOSAL ONLY, never auto-applied.
-- current vs recommended confidence (0..1), the trigger, direction, severity,
-- reason, supporting evidence, and lifecycle status. The ONE mutable table
-- (status flips on a governance decision) — carries the updated_at trigger.
create table if not exists public.hsin_recalibration_proposals (
  id                     uuid primary key default gen_random_uuid(),
  entity_type            text check (entity_type in (
                           'source','narrative','forecast','intervention','recommendation','decision')),
  entity_id              text,
  trigger                text check (trigger in (
                           'trust_drift','trust_collapse','calibration_error','overconfidence',
                           'underconfidence','source_overstated','manual')),
  current_confidence     numeric check (current_confidence >= 0 and current_confidence <= 1),
  recommended_confidence numeric check (recommended_confidence >= 0 and recommended_confidence <= 1),
  current_trust          numeric,
  recommended_trust      numeric,
  direction              text check (direction in ('downward','upward','none')),
  magnitude              numeric,
  severity               text check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  reason                 text,
  supporting_evidence    jsonb,
  status                 text check (status in ('pending','approved','rejected')) default 'pending',
  created_by             uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz default now()
);
comment on table public.hsin_recalibration_proposals is
  'HSIN Phase 17: RECOMMENDED confidence recalibrations (proposal only, never auto-applied): current vs recommended confidence, trigger, direction, severity, status.';

-- ---------- hsin_recalibration_reviews ----------------------------------------
-- A governance decision over a proposal (approved / rejected). Carries the
-- reviewer, reason, the previous→new state (for reversal), a reversible flag,
-- the validity checks, and an APPEND-ONLY audit trail. One row per decision.
create table if not exists public.hsin_recalibration_reviews (
  id             uuid primary key default gen_random_uuid(),
  proposal_id    uuid references public.hsin_recalibration_proposals(id) on delete cascade,
  reviewer_id    uuid references public.users(id) on delete set null,
  decision       text check (decision in ('approved','rejected')),
  reason         text,
  valid          boolean,
  checks         jsonb,
  previous_state jsonb,
  new_state      jsonb,
  reversible     boolean default true,
  audit_trail    jsonb,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_recalibration_reviews is
  'HSIN Phase 17: governance decisions over a recalibration proposal (approved/rejected) with reviewer, reason, previous→new state, reversible flag, and an audit trail.';

-- ---------- hsin_trust_overrides ----------------------------------------------
-- An APPEND-ONLY record of every APPLIED trust change (previous→new score/band,
-- reason, who, optional originating proposal). The auditable, reversible trail of
-- human trust changes — distinct from the in-place override flag on the Phase-16
-- trust tables.
create table if not exists public.hsin_trust_overrides (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text check (entity_type in (
                   'source','narrative','forecast','intervention','recommendation','decision')),
  entity_id      text,
  previous_score numeric,
  new_score      numeric,
  previous_band  text,
  new_band       text,
  reason         text,
  proposal_id    uuid references public.hsin_recalibration_proposals(id) on delete set null,
  reversible     boolean default true,
  overridden_by  uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_trust_overrides is
  'HSIN Phase 17: APPEND-ONLY record of applied trust changes (previous→new score/band, reason, who) — the auditable, reversible trail of human trust changes.';

-- ---------- hsin_trust_publications -------------------------------------------
-- Trust attached to a published intelligence report: confidence + calibrated
-- reliability + trust score + provenance, per research/evidence/decision/forecast/
-- simulation report. APPEND-ONLY (a publication is a historical fact).
create table if not exists public.hsin_trust_publications (
  id                     uuid primary key default gen_random_uuid(),
  entity_type            text check (entity_type in (
                           'source','narrative','forecast','intervention','recommendation','decision')),
  entity_id              text,
  report_type            text check (report_type in (
                           'research','evidence','decision','forecast','simulation')),
  confidence             numeric check (confidence >= 0 and confidence <= 1),
  calibrated_reliability numeric check (calibrated_reliability >= 0 and calibrated_reliability <= 1),
  trust_score            numeric check (trust_score >= 0 and trust_score <= 100),
  provenance             jsonb,
  published_by           uuid references public.users(id) on delete set null,
  published_at           timestamptz,
  created_at             timestamptz not null default now()
);
comment on table public.hsin_trust_publications is
  'HSIN Phase 17: trust attached to published intelligence (confidence + calibrated reliability + trust score + provenance) per research/evidence/decision/forecast/simulation report.';

-- =============================================================================
-- C. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_trust_history_entity      on public.hsin_trust_history(entity_type, entity_id);
create index if not exists idx_hsin_trust_history_snapshot_at on public.hsin_trust_history(snapshot_at);
create index if not exists idx_hsin_trust_history_created_at  on public.hsin_trust_history(created_at);

create index if not exists idx_hsin_trust_drift_entity     on public.hsin_trust_drift(entity_type, entity_id);
create index if not exists idx_hsin_trust_drift_kind       on public.hsin_trust_drift(drift_kind);
create index if not exists idx_hsin_trust_drift_severity   on public.hsin_trust_drift(severity);
create index if not exists idx_hsin_trust_drift_created_at on public.hsin_trust_drift(created_at);

create index if not exists idx_hsin_recal_proposals_entity     on public.hsin_recalibration_proposals(entity_type, entity_id);
create index if not exists idx_hsin_recal_proposals_status     on public.hsin_recalibration_proposals(status);
create index if not exists idx_hsin_recal_proposals_severity   on public.hsin_recalibration_proposals(severity);
create index if not exists idx_hsin_recal_proposals_created_at on public.hsin_recalibration_proposals(created_at);

create index if not exists idx_hsin_recal_reviews_proposal_id on public.hsin_recalibration_reviews(proposal_id);
create index if not exists idx_hsin_recal_reviews_decision    on public.hsin_recalibration_reviews(decision);
create index if not exists idx_hsin_recal_reviews_created_at  on public.hsin_recalibration_reviews(created_at);

create index if not exists idx_hsin_trust_overrides_entity      on public.hsin_trust_overrides(entity_type, entity_id);
create index if not exists idx_hsin_trust_overrides_proposal_id on public.hsin_trust_overrides(proposal_id);
create index if not exists idx_hsin_trust_overrides_created_at  on public.hsin_trust_overrides(created_at);

create index if not exists idx_hsin_trust_publications_entity      on public.hsin_trust_publications(entity_type, entity_id);
create index if not exists idx_hsin_trust_publications_report_type on public.hsin_trust_publications(report_type);
create index if not exists idx_hsin_trust_publications_published_at on public.hsin_trust_publications(published_at);

-- =============================================================================
-- D. UPDATED_AT TRIGGER — only on the one mutable table
-- (hsin_recalibration_proposals; its status flips on a decision). Re-uses
-- public.set_updated_at() from 0003. Drop-then-create for idempotency. The five
-- APPEND-ONLY tables carry no updated_at column, so no trigger.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_recalibration_proposals;
create trigger trg_set_updated_at before update on public.hsin_recalibration_proposals
  for each row execute function public.set_updated_at();

-- =============================================================================
-- E. ENABLE RLS on all 6 new tables
-- =============================================================================
alter table public.hsin_trust_history           enable row level security;
alter table public.hsin_trust_drift             enable row level security;
alter table public.hsin_recalibration_proposals enable row level security;
alter table public.hsin_recalibration_reviews   enable row level security;
alter table public.hsin_trust_overrides         enable row level security;
alter table public.hsin_trust_publications      enable row level security;

-- =============================================================================
-- F. POLICIES
-- Convention (matches 0002/0010/0011-0020): permissive policies are OR-combined.
-- Drop-then-create for idempotency. The background trust-monitoring/alert worker
-- uses the service_role key and bypasses ALL of these.
--
-- Uniform shape for all 6 tables:
--   researcher+ READ (public.is_researcher_or_above());
--   curator/admin INSERT/UPDATE/DELETE (public.is_curator_or_admin());
--   admin all (public.is_admin()).
-- =============================================================================

-- ---------- hsin_trust_history ------------------------------------------------
drop policy if exists hsin_trust_history_admin_all   on public.hsin_trust_history;
drop policy if exists hsin_trust_history_read        on public.hsin_trust_history;
drop policy if exists hsin_trust_history_curator_ins on public.hsin_trust_history;
drop policy if exists hsin_trust_history_curator_upd on public.hsin_trust_history;
drop policy if exists hsin_trust_history_curator_del on public.hsin_trust_history;

create policy hsin_trust_history_admin_all on public.hsin_trust_history
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_trust_history_read on public.hsin_trust_history
  for select using (public.is_researcher_or_above());
create policy hsin_trust_history_curator_ins on public.hsin_trust_history
  for insert with check (public.is_curator_or_admin());
create policy hsin_trust_history_curator_upd on public.hsin_trust_history
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_trust_history_curator_del on public.hsin_trust_history
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_trust_drift --------------------------------------------------
drop policy if exists hsin_trust_drift_admin_all   on public.hsin_trust_drift;
drop policy if exists hsin_trust_drift_read        on public.hsin_trust_drift;
drop policy if exists hsin_trust_drift_curator_ins on public.hsin_trust_drift;
drop policy if exists hsin_trust_drift_curator_upd on public.hsin_trust_drift;
drop policy if exists hsin_trust_drift_curator_del on public.hsin_trust_drift;

create policy hsin_trust_drift_admin_all on public.hsin_trust_drift
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_trust_drift_read on public.hsin_trust_drift
  for select using (public.is_researcher_or_above());
create policy hsin_trust_drift_curator_ins on public.hsin_trust_drift
  for insert with check (public.is_curator_or_admin());
create policy hsin_trust_drift_curator_upd on public.hsin_trust_drift
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_trust_drift_curator_del on public.hsin_trust_drift
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_recalibration_proposals --------------------------------------
drop policy if exists hsin_recal_proposals_admin_all   on public.hsin_recalibration_proposals;
drop policy if exists hsin_recal_proposals_read        on public.hsin_recalibration_proposals;
drop policy if exists hsin_recal_proposals_curator_ins on public.hsin_recalibration_proposals;
drop policy if exists hsin_recal_proposals_curator_upd on public.hsin_recalibration_proposals;
drop policy if exists hsin_recal_proposals_curator_del on public.hsin_recalibration_proposals;

create policy hsin_recal_proposals_admin_all on public.hsin_recalibration_proposals
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_recal_proposals_read on public.hsin_recalibration_proposals
  for select using (public.is_researcher_or_above());
create policy hsin_recal_proposals_curator_ins on public.hsin_recalibration_proposals
  for insert with check (public.is_curator_or_admin());
create policy hsin_recal_proposals_curator_upd on public.hsin_recalibration_proposals
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_recal_proposals_curator_del on public.hsin_recalibration_proposals
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_recalibration_reviews ----------------------------------------
drop policy if exists hsin_recal_reviews_admin_all   on public.hsin_recalibration_reviews;
drop policy if exists hsin_recal_reviews_read        on public.hsin_recalibration_reviews;
drop policy if exists hsin_recal_reviews_curator_ins on public.hsin_recalibration_reviews;
drop policy if exists hsin_recal_reviews_curator_upd on public.hsin_recalibration_reviews;
drop policy if exists hsin_recal_reviews_curator_del on public.hsin_recalibration_reviews;

create policy hsin_recal_reviews_admin_all on public.hsin_recalibration_reviews
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_recal_reviews_read on public.hsin_recalibration_reviews
  for select using (public.is_researcher_or_above());
create policy hsin_recal_reviews_curator_ins on public.hsin_recalibration_reviews
  for insert with check (public.is_curator_or_admin());
create policy hsin_recal_reviews_curator_upd on public.hsin_recalibration_reviews
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_recal_reviews_curator_del on public.hsin_recalibration_reviews
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_trust_overrides ----------------------------------------------
drop policy if exists hsin_trust_overrides_admin_all   on public.hsin_trust_overrides;
drop policy if exists hsin_trust_overrides_read        on public.hsin_trust_overrides;
drop policy if exists hsin_trust_overrides_curator_ins on public.hsin_trust_overrides;
drop policy if exists hsin_trust_overrides_curator_upd on public.hsin_trust_overrides;
drop policy if exists hsin_trust_overrides_curator_del on public.hsin_trust_overrides;

create policy hsin_trust_overrides_admin_all on public.hsin_trust_overrides
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_trust_overrides_read on public.hsin_trust_overrides
  for select using (public.is_researcher_or_above());
create policy hsin_trust_overrides_curator_ins on public.hsin_trust_overrides
  for insert with check (public.is_curator_or_admin());
create policy hsin_trust_overrides_curator_upd on public.hsin_trust_overrides
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_trust_overrides_curator_del on public.hsin_trust_overrides
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_trust_publications -------------------------------------------
drop policy if exists hsin_trust_publications_admin_all   on public.hsin_trust_publications;
drop policy if exists hsin_trust_publications_read        on public.hsin_trust_publications;
drop policy if exists hsin_trust_publications_curator_ins on public.hsin_trust_publications;
drop policy if exists hsin_trust_publications_curator_upd on public.hsin_trust_publications;
drop policy if exists hsin_trust_publications_curator_del on public.hsin_trust_publications;

create policy hsin_trust_publications_admin_all on public.hsin_trust_publications
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_trust_publications_read on public.hsin_trust_publications
  for select using (public.is_researcher_or_above());
create policy hsin_trust_publications_curator_ins on public.hsin_trust_publications
  for insert with check (public.is_curator_or_admin());
create policy hsin_trust_publications_curator_upd on public.hsin_trust_publications
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_trust_publications_curator_del on public.hsin_trust_publications
  for delete using (public.is_curator_or_admin());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background
-- trust-monitoring/alert worker (recording trust snapshots, detecting drift,
-- raising recalibration proposals, and raising the four new Phase-17 alert types)
-- uses it. User-facing reads/writes go through the per-request, cookie-backed
-- client and are authorized by the policies above. NEVER expose service_role.
-- =============================================================================

-- =============================================================================
-- End of 0021_trust_history_and_governance.sql
-- =============================================================================
