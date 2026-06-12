-- =============================================================================
-- Human Signal Index — 0025_forecasting_and_scenarios.sql
-- WorldForge / HSI (Phase 21) — Forecasting, Scenario Planning & Early Warning.
--
-- Phase 21 adds a FORWARD-LOOKING layer: forecasts (hypotheses about what may
-- happen next), scenarios (competing future hypotheses), and early-warning alerts
-- — all human-governed. No prediction is truth; every forecast exposes its
-- assumptions, supporting evidence, invalidation criteria, and limitations.
--
--   * hsin_forecasts             — forecasts (prediction + confidence + reliability
--                                  + signals/assumptions/invalidation/limitations).
--   * hsin_forecast_versions     — APPEND-ONLY forecast version history.
--   * hsin_forecast_outcomes     — observed outcomes per forecast (for reliability).
--   * hsin_forecast_accuracy     — rolled-up accuracy/calibration/Brier metrics.
--   * hsin_forecast_alerts       — forecast-failure / forecast-risk alerts.
--   * hsin_scenarios             — scenarios (lifecycle state + likelihood + drivers).
--   * hsin_scenario_versions     — APPEND-ONLY scenario transition history.
--   * hsin_scenario_comparisons  — APPEND-ONLY scenario comparison snapshots.
--   * hsin_scenario_trees        — branching scenario trees (jsonb).
--   * hsin_early_warning_alerts  — INFO/WATCH/WARNING/CRITICAL early-warning alerts.
--
-- ACCESS MODEL (re-uses the 5-role ladder from 0010): researcher+ READ;
-- curator/admin WRITE; admin all. The FORECAST WORKER uses the service_role key
-- (bypasses RLS). GOVERNANCE: autoPredict/autoAct/autoEscalate/autoPublish = false.
--
-- This migration is ADD-ONLY. It does NOT edit migrations 0001-0024.
-- CONVENTIONS (match 0001-0024): snake_case; gen_random_uuid() PKs; created_at
-- default now(); CHECK-guarded enums; the shared set_updated_at() trigger on
-- mutable tables; APPEND-ONLY tables carry no trigger.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

create table if not exists public.hsin_forecasts (
  id                   uuid primary key default gen_random_uuid(),
  prediction           text,
  confidence           numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reliability          numeric check (reliability is null or (reliability >= 0 and reliability <= 1)),
  status               text check (status in ('active','monitoring','confirmed','failed','expired')) default 'active',
  horizon              text,
  supporting_signals   jsonb,
  assumptions          jsonb,
  invalidation_criteria jsonb,
  limitations          jsonb,
  version              int default 1,
  expires_at           timestamptz,
  created_by           uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz default now()
);
comment on table public.hsin_forecasts is
  'HSIN Phase 21: forecasts (hypotheses) with confidence/reliability + assumptions/invalidation/limitations. No prediction is truth.';

create table if not exists public.hsin_forecast_versions (
  id          uuid primary key default gen_random_uuid(),
  forecast_id uuid references public.hsin_forecasts(id) on delete cascade,
  version     int,
  prediction  text,
  confidence  numeric,
  reliability numeric,
  status      text,
  actor       text,
  reason      text,
  snapshot    jsonb,
  at          timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_forecast_versions is
  'HSIN Phase 21: APPEND-ONLY forecast version history (the audited evolution).';

create table if not exists public.hsin_forecast_outcomes (
  id          uuid primary key default gen_random_uuid(),
  forecast_id uuid references public.hsin_forecasts(id) on delete cascade,
  confidence  numeric,
  success     numeric check (success is null or (success >= 0 and success <= 1)),
  observation text,
  observed_at timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_forecast_outcomes is
  'HSIN Phase 21: observed outcomes per forecast (predicted confidence vs observed success) for reliability metrics.';

create table if not exists public.hsin_forecast_accuracy (
  id            uuid primary key default gen_random_uuid(),
  scope         text,
  success_rate  numeric,
  failure_rate  numeric,
  ece           numeric,
  brier_score   numeric,
  drift         numeric,
  sample_count  int default 0,
  bins          jsonb,
  computed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz default now()
);
comment on table public.hsin_forecast_accuracy is
  'HSIN Phase 21: rolled-up forecast accuracy / calibration (ECE) / Brier / drift metrics.';

create table if not exists public.hsin_forecast_alerts (
  id          uuid primary key default gen_random_uuid(),
  forecast_id uuid references public.hsin_forecasts(id) on delete cascade,
  alert_type  text check (alert_type in ('forecast_failure','forecast_risk','forecast_drift')),
  severity    text check (severity in ('INFO','WATCH','WARNING','CRITICAL')),
  reason      text,
  evidence    jsonb,
  status      text check (status in ('open','acknowledged','resolved')) default 'open',
  resolved_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.hsin_forecast_alerts is
  'HSIN Phase 21: forecast-failure / forecast-risk / forecast-drift alerts (advisory; never auto-resolved).';

create table if not exists public.hsin_scenarios (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique,
  title        text,
  description  text,
  state        text check (state in ('EMERGING','ACTIVE','MONITORING','CONFIRMED','INVALIDATED','ARCHIVED')) default 'EMERGING',
  likelihood   numeric check (likelihood is null or (likelihood >= 0 and likelihood <= 1)),
  drivers      jsonb,
  forecast_ids jsonb,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.hsin_scenarios is
  'HSIN Phase 21: scenarios (competing future hypotheses) with lifecycle state + likelihood + drivers.';

create table if not exists public.hsin_scenario_versions (
  id          uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.hsin_scenarios(id) on delete cascade,
  from_state  text,
  to_state    text,
  actor       text,
  reason      text,
  likelihood  numeric,
  at          timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_scenario_versions is
  'HSIN Phase 21: APPEND-ONLY scenario transition history.';

create table if not exists public.hsin_scenario_comparisons (
  id          uuid primary key default gen_random_uuid(),
  leading     text,
  divergence  numeric,
  ranked      jsonb,
  summary     text,
  limitations jsonb,
  compared_at timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_scenario_comparisons is
  'HSIN Phase 21: APPEND-ONLY scenario comparison snapshots (leader/divergence/ranked).';

create table if not exists public.hsin_scenario_trees (
  id          uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.hsin_scenarios(id) on delete set null,
  title       text,
  tree        jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.hsin_scenario_trees is
  'HSIN Phase 21: branching scenario trees (jsonb node tree with per-branch probabilities).';

create table if not exists public.hsin_early_warning_alerts (
  id             uuid primary key default gen_random_uuid(),
  kind           text check (kind in ('emerging_pattern','signal_acceleration','trust_collapse','narrative_shift','consensus_instability','forecast_risk')),
  level          text check (level in ('INFO','WATCH','WARNING','CRITICAL')),
  title          text,
  signal         text,
  evidence       jsonb,
  recommendation text,
  entity_id      text,
  status         text check (status in ('open','acknowledged','resolved')) default 'open',
  resolved_by    uuid references public.users(id) on delete set null,
  detected_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz default now()
);
comment on table public.hsin_early_warning_alerts is
  'HSIN Phase 21: INFO/WATCH/WARNING/CRITICAL early-warning alerts (advisory; never auto-acted/auto-resolved).';

-- =============================================================================
-- B. INDEXES
-- =============================================================================
create index if not exists idx_hsin_forecasts_status     on public.hsin_forecasts(status);
create index if not exists idx_hsin_forecasts_created_at  on public.hsin_forecasts(created_at);
create index if not exists idx_hsin_forecast_versions_fid on public.hsin_forecast_versions(forecast_id);
create index if not exists idx_hsin_forecast_outcomes_fid on public.hsin_forecast_outcomes(forecast_id);
create index if not exists idx_hsin_forecast_accuracy_scope on public.hsin_forecast_accuracy(scope);
create index if not exists idx_hsin_forecast_alerts_fid   on public.hsin_forecast_alerts(forecast_id);
create index if not exists idx_hsin_forecast_alerts_status on public.hsin_forecast_alerts(status);
create index if not exists idx_hsin_scenarios_state       on public.hsin_scenarios(state);
create index if not exists idx_hsin_scenarios_slug        on public.hsin_scenarios(slug);
create index if not exists idx_hsin_scenario_versions_sid on public.hsin_scenario_versions(scenario_id);
create index if not exists idx_hsin_scenario_comparisons_created on public.hsin_scenario_comparisons(created_at);
create index if not exists idx_hsin_scenario_trees_sid    on public.hsin_scenario_trees(scenario_id);
create index if not exists idx_hsin_early_warning_alerts_level  on public.hsin_early_warning_alerts(level);
create index if not exists idx_hsin_early_warning_alerts_status on public.hsin_early_warning_alerts(status);
create index if not exists idx_hsin_early_warning_alerts_kind   on public.hsin_early_warning_alerts(kind);

-- =============================================================================
-- C. UPDATED_AT TRIGGERS — on the mutable tables. APPEND-ONLY tables
-- (forecast_versions, forecast_outcomes, scenario_versions, scenario_comparisons)
-- carry no trigger.
-- =============================================================================
do $$
declare
  t text;
  mutable text[] := array[
    'hsin_forecasts','hsin_forecast_accuracy','hsin_forecast_alerts',
    'hsin_scenarios','hsin_scenario_trees','hsin_early_warning_alerts'];
begin
  foreach t in array mutable loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format('create trigger trg_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =============================================================================
-- D. ENABLE RLS + E. POLICIES (researcher+ READ; curator/admin WRITE; admin all)
-- =============================================================================
do $$
declare
  t text;
  all_tables text[] := array[
    'hsin_forecasts','hsin_forecast_versions','hsin_forecast_outcomes','hsin_forecast_accuracy',
    'hsin_forecast_alerts','hsin_scenarios','hsin_scenario_versions','hsin_scenario_comparisons',
    'hsin_scenario_trees','hsin_early_warning_alerts'];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_del', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.is_curator_or_admin())', t || '_curator_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin())', t || '_curator_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_curator_or_admin())', t || '_curator_del', t);
  end loop;
end $$;

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS. The Phase-21 FORECAST WORKER uses
-- it to generate forecasts, update scenarios, detect warnings, and persist
-- results. It NEVER auto-predicts as truth, auto-acts, auto-escalates, or
-- auto-publishes — every forecast/scenario is a hypothesis requiring human review.
-- =============================================================================

-- =============================================================================
-- End of 0025_forecasting_and_scenarios.sql
-- =============================================================================
