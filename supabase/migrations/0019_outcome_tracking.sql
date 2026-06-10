-- =============================================================================
-- Human Signal Index — 0019_outcome_tracking.sql
-- WorldForge / HSI (Phase 15) — Recommendation Outcome Tracking, Alerting &
-- Governance.
--
-- Phase 15 closes the loop on the decision-intelligence layer (Phase 13,
-- migration 0017). Where Phase 13 RECOMMENDS strategic actions for a narrative
-- (the hsin_decision_runs table + its scenario comparisons, intervention
-- rankings, cross-narrative impacts, audits), Phase 15 TRACKS WHAT ACTUALLY
-- HAPPENED: it records the OUTCOME of each recommendation (successful /
-- partially_successful / neutral / unsuccessful / inconclusive), the
-- per-metric MEASUREMENTS behind that verdict, a CONFIDENCE-LEARNING table that
-- calibrates expected confidence per intervention type from observed history,
-- a DECISION-ALERT feed (recommendation failures, confidence drift, narrative
-- spikes, forecast misses, resurgences, security anomalies), a GOVERNANCE-REVIEW
-- workflow for validating outcomes, and lightweight USER FEEDBACK on outcomes.
--
--   * hsin_recommendation_outcomes  — the observed outcome of a Phase-13 decision run;
--   * hsin_outcome_measurements     — per-metric expected vs observed values for an outcome;
--   * hsin_confidence_learning      — calibrated confidence per intervention type from history;
--   * hsin_decision_alerts          — the decision-intelligence alert feed;
--   * hsin_governance_reviews       — the validation/governance workflow over outcomes;
--   * hsin_recommendation_feedback  — per-user 1..5 rating + free-text feedback on an outcome.
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7-13 / migrations 0011-0017).
-- ---------------------------------------------------------------------------
-- Every Phase-15 table uses the `hsin_` prefix and references the Phase-13 run
-- table public.hsin_decision_runs(id) (created in 0017) and/or the Phase-15
-- outcome table public.hsin_recommendation_outcomes itself.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY. It creates 6 new `hsin_`-prefixed tables (+ indexes,
-- RLS, policies, 3 updated_at triggers). It does NOT edit migrations 0001-0018,
-- drop existing policies/roles/helpers, or touch any existing table/RLS.
--
-- CONVENTIONS (match 0001-0018):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz not null default now().
--   - FKs to public.hsin_decision_runs(id): on delete cascade where the child row
--     has no meaning without its run (outcomes), on delete set null where the row
--     stands on its own (alerts, governance reviews keep a soft link).
--   - FKs to public.hsin_recommendation_outcomes(id) on delete cascade (child rows
--     — measurements, governance reviews, feedback — die with their outcome).
--   - created_by / reviewer_id / user_id uuid references public.users(id)
--     on delete set null (Phase 5/7/13 style).
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - The shared public.set_updated_at() trigger (from 0003) is attached to the 3
--     mutable, edited-in-place tables: hsin_recommendation_outcomes,
--     hsin_confidence_learning, hsin_governance_reviews.
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_reviewer_or_above(),
--       public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- ROLE / ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   All 6 tables are part of the SHARED decision-intelligence graph (consistent
--   with the Phase-13 tables in 0017):
--     authenticated READ (auth.uid() is not null).
--   Outcome VALIDATION is a privileged action — per spec, only admin / curator /
--   reviewer (i.e. reviewer-or-above) may VALIDATE outcomes — so INSERT/UPDATE on
--   the validation-bearing tables (hsin_recommendation_outcomes,
--   hsin_outcome_measurements, hsin_governance_reviews, hsin_decision_alerts,
--   hsin_confidence_learning) require public.is_reviewer_or_above().
--   hsin_recommendation_feedback is the exception: ANY authenticated user may
--   INSERT their OWN feedback (user_id = auth.uid()), and reviewer+ read all.
--   admin has full control everywhere (public.is_admin()).
--   The background OUTCOME-ALERT WORKER uses the Supabase service_role key, which
--   BYPASSES RLS entirely — it measures outcomes, calibrates confidence, raises
--   alerts, and seeds governance reviews without needing these policies. The
--   policies below govern only user-facing (per-request, cookie-backed) access.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

-- ---------- hsin_recommendation_outcomes --------------------------------------
-- The observed outcome of a Phase-13 decision run. status is the verdict;
-- expected_outcome / observed_outcome carry the structured payloads;
-- confidence_before / confidence_after (0..1) bracket the run's confidence around
-- the observation; success_score (0..100) scores how well it went; explanation /
-- limitations carry the structured rationale and caveats.
create table if not exists public.hsin_recommendation_outcomes (
  id                uuid primary key default gen_random_uuid(),
  decision_run_id   uuid references public.hsin_decision_runs(id) on delete cascade,
  recommendation_id text,
  status            text check (status in (
                      'successful','partially_successful','neutral','unsuccessful','inconclusive')),
  expected_outcome  jsonb,
  observed_outcome  jsonb,
  confidence_before numeric check (confidence_before >= 0 and confidence_before <= 1),
  confidence_after  numeric check (confidence_after >= 0 and confidence_after <= 1),
  success_score     numeric check (success_score >= 0 and success_score <= 100),
  explanation       jsonb,
  limitations       jsonb,
  notes             text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.hsin_recommendation_outcomes is
  'HSIN Phase 15: the observed outcome of a Phase-13 decision run (status/expected vs observed/confidence_before vs after/success_score).';

-- ---------- hsin_outcome_measurements -----------------------------------------
-- A per-metric expected-vs-observed measurement behind an outcome verdict. delta
-- is the observed minus expected gap; within_expectation flags whether the
-- observed value fell inside the expected band.
create table if not exists public.hsin_outcome_measurements (
  id                 uuid primary key default gen_random_uuid(),
  outcome_id         uuid not null references public.hsin_recommendation_outcomes(id) on delete cascade,
  metric             text,
  expected_value     numeric,
  observed_value     numeric,
  delta              numeric,
  within_expectation boolean,
  created_at         timestamptz not null default now()
);
comment on table public.hsin_outcome_measurements is
  'HSIN Phase 15: a per-metric expected vs observed measurement (delta/within_expectation) behind an outcome verdict.';

-- ---------- hsin_confidence_learning ------------------------------------------
-- Calibrated confidence per intervention type, learned from observed outcome
-- history. sample_count / success_count accumulate the evidence; avg_success_score
-- summarises it; calibrated_confidence (0..1) is the learned confidence;
-- adjustment is the delta applied to raw model confidence. unique(intervention_type)
-- keeps one calibration row per type (idempotent upsert by the worker).
create table if not exists public.hsin_confidence_learning (
  id                    uuid primary key default gen_random_uuid(),
  intervention_type     text not null,
  sample_count          int default 0,
  success_count         int default 0,
  avg_success_score     numeric,
  calibrated_confidence numeric check (calibrated_confidence >= 0 and calibrated_confidence <= 1),
  adjustment            numeric,
  rationale             text,
  updated_at            timestamptz default now(),
  created_at            timestamptz not null default now(),
  unique (intervention_type)
);
comment on table public.hsin_confidence_learning is
  'HSIN Phase 15: calibrated confidence per intervention type learned from outcome history; unique per intervention_type.';

-- ---------- hsin_decision_alerts ----------------------------------------------
-- The decision-intelligence alert feed. alert_type classifies the signal; severity
-- ranks it; status tracks the triage lifecycle (open -> acknowledged/escalated ->
-- resolved); message/explanation carry the human-readable detail; metadata carries
-- the structured payload. decision_run_id is a SOFT link (on delete set null) — an
-- alert may outlive its run.
create table if not exists public.hsin_decision_alerts (
  id              uuid primary key default gen_random_uuid(),
  decision_run_id uuid references public.hsin_decision_runs(id) on delete set null,
  alert_type      text check (alert_type in (
                    'recommendation_failed','confidence_drift','narrative_spike',
                    'forecast_miss','resurgence','security_anomaly')),
  severity        text check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  message         text,
  explanation     text,
  status          text check (status in ('open','acknowledged','resolved','escalated')) default 'open',
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
comment on table public.hsin_decision_alerts is
  'HSIN Phase 15: the decision-intelligence alert feed (alert_type/severity/status/message/explanation/metadata).';

-- ---------- hsin_governance_reviews -------------------------------------------
-- The validation/governance workflow over an outcome. decision tracks the review
-- verdict (pending -> approved/rejected/escalated/validated); reviewer_id records
-- the validating reviewer (reviewer-or-above per the access model). decision_run_id
-- is a SOFT link (on delete set null) so a review keeps context if its run is
-- removed.
create table if not exists public.hsin_governance_reviews (
  id              uuid primary key default gen_random_uuid(),
  outcome_id      uuid references public.hsin_recommendation_outcomes(id) on delete cascade,
  decision_run_id uuid references public.hsin_decision_runs(id) on delete set null,
  reviewer_id     uuid references public.users(id) on delete set null,
  decision        text check (decision in ('pending','approved','rejected','escalated','validated')) default 'pending',
  notes           text,
  status          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.hsin_governance_reviews is
  'HSIN Phase 15: the validation/governance workflow over an outcome (decision/reviewer_id/notes/status).';

-- ---------- hsin_recommendation_feedback --------------------------------------
-- Per-user 1..5 rating + free-text feedback on an outcome. user_id records the
-- author (any authenticated user may leave their own feedback).
create table if not exists public.hsin_recommendation_feedback (
  id         uuid primary key default gen_random_uuid(),
  outcome_id uuid references public.hsin_recommendation_outcomes(id) on delete cascade,
  user_id    uuid references public.users(id) on delete set null,
  rating     int check (rating >= 1 and rating <= 5),
  feedback   text,
  created_at timestamptz not null default now()
);
comment on table public.hsin_recommendation_feedback is
  'HSIN Phase 15: per-user 1..5 rating + free-text feedback on a recommendation outcome.';

-- =============================================================================
-- B. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_recommendation_outcomes_run_id     on public.hsin_recommendation_outcomes(decision_run_id);
create index if not exists idx_hsin_recommendation_outcomes_status     on public.hsin_recommendation_outcomes(status);
create index if not exists idx_hsin_recommendation_outcomes_created_at on public.hsin_recommendation_outcomes(created_at);

create index if not exists idx_hsin_outcome_measurements_outcome_id on public.hsin_outcome_measurements(outcome_id);

create index if not exists idx_hsin_confidence_learning_type on public.hsin_confidence_learning(intervention_type);

create index if not exists idx_hsin_decision_alerts_run_id     on public.hsin_decision_alerts(decision_run_id);
create index if not exists idx_hsin_decision_alerts_alert_type on public.hsin_decision_alerts(alert_type);
create index if not exists idx_hsin_decision_alerts_severity   on public.hsin_decision_alerts(severity);
create index if not exists idx_hsin_decision_alerts_status     on public.hsin_decision_alerts(status);
create index if not exists idx_hsin_decision_alerts_created_at on public.hsin_decision_alerts(created_at);

create index if not exists idx_hsin_governance_reviews_outcome_id on public.hsin_governance_reviews(outcome_id);
create index if not exists idx_hsin_governance_reviews_run_id     on public.hsin_governance_reviews(decision_run_id);
create index if not exists idx_hsin_governance_reviews_decision   on public.hsin_governance_reviews(decision);
create index if not exists idx_hsin_governance_reviews_created_at on public.hsin_governance_reviews(created_at);

create index if not exists idx_hsin_recommendation_feedback_outcome_id on public.hsin_recommendation_feedback(outcome_id);

-- =============================================================================
-- C. UPDATED_AT TRIGGERS — only on the 3 mutable, edited-in-place tables.
-- Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- The append-only tables (hsin_outcome_measurements, hsin_decision_alerts,
-- hsin_recommendation_feedback) carry no updated_at column, so no trigger is
-- attached to them.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_recommendation_outcomes;
create trigger trg_set_updated_at before update on public.hsin_recommendation_outcomes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_confidence_learning;
create trigger trg_set_updated_at before update on public.hsin_confidence_learning
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_governance_reviews;
create trigger trg_set_updated_at before update on public.hsin_governance_reviews
  for each row execute function public.set_updated_at();

-- =============================================================================
-- D. ENABLE RLS on all 6 new tables
-- =============================================================================
alter table public.hsin_recommendation_outcomes enable row level security;
alter table public.hsin_outcome_measurements     enable row level security;
alter table public.hsin_confidence_learning       enable row level security;
alter table public.hsin_decision_alerts           enable row level security;
alter table public.hsin_governance_reviews        enable row level security;
alter table public.hsin_recommendation_feedback   enable row level security;

-- =============================================================================
-- E. POLICIES
-- Convention (matches 0002/0010/0011-0018): permissive policies are OR-combined —
-- a row is visible/writable if ANY policy allows it. Drop-then-create for
-- idempotency. The background outcome-alert worker uses the service_role key and
-- bypasses ALL of these.
--
-- Shape for the 5 VALIDATION-bearing tables (outcomes, measurements,
-- governance_reviews, decision_alerts, confidence_learning):
--   authenticated READ; reviewer+ INSERT/UPDATE/DELETE; admin all.
-- (Per spec, only admin/curator/reviewer may VALIDATE outcomes ->
--  public.is_reviewer_or_above() guards writes.)
-- =============================================================================

-- ---------- hsin_recommendation_outcomes --------------------------------------
drop policy if exists hsin_recommendation_outcomes_admin_all    on public.hsin_recommendation_outcomes;
drop policy if exists hsin_recommendation_outcomes_auth_read    on public.hsin_recommendation_outcomes;
drop policy if exists hsin_recommendation_outcomes_reviewer_ins on public.hsin_recommendation_outcomes;
drop policy if exists hsin_recommendation_outcomes_reviewer_upd on public.hsin_recommendation_outcomes;
drop policy if exists hsin_recommendation_outcomes_reviewer_del on public.hsin_recommendation_outcomes;

create policy hsin_recommendation_outcomes_admin_all on public.hsin_recommendation_outcomes
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_recommendation_outcomes_auth_read on public.hsin_recommendation_outcomes
  for select using (auth.uid() is not null);
create policy hsin_recommendation_outcomes_reviewer_ins on public.hsin_recommendation_outcomes
  for insert with check (public.is_reviewer_or_above());
create policy hsin_recommendation_outcomes_reviewer_upd on public.hsin_recommendation_outcomes
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_recommendation_outcomes_reviewer_del on public.hsin_recommendation_outcomes
  for delete using (public.is_reviewer_or_above());

-- ---------- hsin_outcome_measurements -----------------------------------------
drop policy if exists hsin_outcome_measurements_admin_all    on public.hsin_outcome_measurements;
drop policy if exists hsin_outcome_measurements_auth_read    on public.hsin_outcome_measurements;
drop policy if exists hsin_outcome_measurements_reviewer_ins on public.hsin_outcome_measurements;
drop policy if exists hsin_outcome_measurements_reviewer_upd on public.hsin_outcome_measurements;
drop policy if exists hsin_outcome_measurements_reviewer_del on public.hsin_outcome_measurements;

create policy hsin_outcome_measurements_admin_all on public.hsin_outcome_measurements
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_outcome_measurements_auth_read on public.hsin_outcome_measurements
  for select using (auth.uid() is not null);
create policy hsin_outcome_measurements_reviewer_ins on public.hsin_outcome_measurements
  for insert with check (public.is_reviewer_or_above());
create policy hsin_outcome_measurements_reviewer_upd on public.hsin_outcome_measurements
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_outcome_measurements_reviewer_del on public.hsin_outcome_measurements
  for delete using (public.is_reviewer_or_above());

-- ---------- hsin_confidence_learning ------------------------------------------
drop policy if exists hsin_confidence_learning_admin_all    on public.hsin_confidence_learning;
drop policy if exists hsin_confidence_learning_auth_read    on public.hsin_confidence_learning;
drop policy if exists hsin_confidence_learning_reviewer_ins on public.hsin_confidence_learning;
drop policy if exists hsin_confidence_learning_reviewer_upd on public.hsin_confidence_learning;
drop policy if exists hsin_confidence_learning_reviewer_del on public.hsin_confidence_learning;

create policy hsin_confidence_learning_admin_all on public.hsin_confidence_learning
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_confidence_learning_auth_read on public.hsin_confidence_learning
  for select using (auth.uid() is not null);
create policy hsin_confidence_learning_reviewer_ins on public.hsin_confidence_learning
  for insert with check (public.is_reviewer_or_above());
create policy hsin_confidence_learning_reviewer_upd on public.hsin_confidence_learning
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_confidence_learning_reviewer_del on public.hsin_confidence_learning
  for delete using (public.is_reviewer_or_above());

-- ---------- hsin_decision_alerts ----------------------------------------------
drop policy if exists hsin_decision_alerts_admin_all    on public.hsin_decision_alerts;
drop policy if exists hsin_decision_alerts_auth_read    on public.hsin_decision_alerts;
drop policy if exists hsin_decision_alerts_reviewer_ins on public.hsin_decision_alerts;
drop policy if exists hsin_decision_alerts_reviewer_upd on public.hsin_decision_alerts;
drop policy if exists hsin_decision_alerts_reviewer_del on public.hsin_decision_alerts;

create policy hsin_decision_alerts_admin_all on public.hsin_decision_alerts
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_decision_alerts_auth_read on public.hsin_decision_alerts
  for select using (auth.uid() is not null);
create policy hsin_decision_alerts_reviewer_ins on public.hsin_decision_alerts
  for insert with check (public.is_reviewer_or_above());
create policy hsin_decision_alerts_reviewer_upd on public.hsin_decision_alerts
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_decision_alerts_reviewer_del on public.hsin_decision_alerts
  for delete using (public.is_reviewer_or_above());

-- ---------- hsin_governance_reviews -------------------------------------------
drop policy if exists hsin_governance_reviews_admin_all    on public.hsin_governance_reviews;
drop policy if exists hsin_governance_reviews_auth_read    on public.hsin_governance_reviews;
drop policy if exists hsin_governance_reviews_reviewer_ins on public.hsin_governance_reviews;
drop policy if exists hsin_governance_reviews_reviewer_upd on public.hsin_governance_reviews;
drop policy if exists hsin_governance_reviews_reviewer_del on public.hsin_governance_reviews;

create policy hsin_governance_reviews_admin_all on public.hsin_governance_reviews
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_governance_reviews_auth_read on public.hsin_governance_reviews
  for select using (auth.uid() is not null);
create policy hsin_governance_reviews_reviewer_ins on public.hsin_governance_reviews
  for insert with check (public.is_reviewer_or_above());
create policy hsin_governance_reviews_reviewer_upd on public.hsin_governance_reviews
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_governance_reviews_reviewer_del on public.hsin_governance_reviews
  for delete using (public.is_reviewer_or_above());

-- ---------- hsin_recommendation_feedback --------------------------------------
-- Exception to the validation shape: ANY authenticated user may INSERT their OWN
-- feedback (user_id = auth.uid()); reviewer+ read all; admin full control.
drop policy if exists hsin_recommendation_feedback_admin_all     on public.hsin_recommendation_feedback;
drop policy if exists hsin_recommendation_feedback_reviewer_read on public.hsin_recommendation_feedback;
drop policy if exists hsin_recommendation_feedback_self_ins      on public.hsin_recommendation_feedback;

create policy hsin_recommendation_feedback_admin_all on public.hsin_recommendation_feedback
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_recommendation_feedback_reviewer_read on public.hsin_recommendation_feedback
  for select using (public.is_reviewer_or_above());
create policy hsin_recommendation_feedback_self_ins on public.hsin_recommendation_feedback
  for insert with check (auth.uid() is not null and user_id = auth.uid());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background
-- outcome-alert worker (measuring outcomes, calibrating per-intervention
-- confidence, raising decision alerts, and seeding governance reviews) uses it.
-- User-facing reads/writes go through the per-request, cookie-backed client and
-- are authorized by the policies above. NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0019_outcome_tracking.sql
-- =============================================================================
