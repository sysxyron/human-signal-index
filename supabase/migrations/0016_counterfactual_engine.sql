-- =============================================================================
-- Human Signal Index — 0016_counterfactual_engine.sql
-- WorldForge / HSI (Phase 12) — Counterfactual Simulation Engine.
--
-- Phase 12 adds a COUNTERFACTUAL + BACKTESTING layer over the causal/temporal
-- narrative-intelligence graph (Phases 10-11). It records simulation RUNS that
-- ask "what if?" of a narrative (remove/delay/accelerate an event, change
-- amplification, add/remove a source or community, shift reliability or
-- contradiction), captures the per-event ACTIONS each run applied, stores the
-- simulated RESULTS against real forecasts, tracks rolling FORECAST ACCURACY /
-- calibration per narrative window, and materializes WorldForge SCENARIOS
-- (alternate world-states) for the "imagine a different world" bridge.
--   * hsin_counterfactual_runs    — a single "what if?" simulation over a narrative;
--   * hsin_counterfactual_events  — the action a run applied to a causal event;
--   * hsin_simulation_results     — a simulated state/probability vs the actual;
--   * hsin_forecast_accuracy      — rolling accuracy/calibration per narrative window;
--   * hsin_worldforge_scenarios   — an alternate world-state generated from a run.
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7-11 / migrations 0011-0015).
-- ---------------------------------------------------------------------------
-- Every Phase-12 table uses the `hsin_` prefix and references the Phase-8 narrative
-- table public.hsin_narratives(id) (created in 0012), the Phase-11 causal events
-- (public.hsin_causal_events, 0015), the Phase-10 forecasts
-- (public.hsin_narrative_forecasts, 0014), the WorldForge links
-- (public.hsin_worldforge_links, 0013), and the Phase-12 run table itself.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY. It creates 5 new `hsin_`-prefixed tables (+ indexes,
-- RLS, policies, one updated_at trigger). It does NOT edit migrations 0001-0015,
-- drop existing policies/roles/helpers, or touch any existing table/RLS.
--
-- CONVENTIONS (match 0001-0015):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz not null default now().
--   - FKs to public.hsin_narratives(id) on delete cascade; nullable FKs to the
--     causal/forecast/worldforge tables use `on delete set null` so a run survives
--     pruning of the underlying source row.
--   - created_by uuid references public.users(id) on delete set null (Phase 5/7 style).
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - mutable tables (hsin_forecast_accuracy) get an updated_at column + the shared
--     public.set_updated_at() trigger (from 0003).
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_reviewer_or_above(),
--       public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- ROLE / ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   All 5 tables are part of the SHARED narrative-intelligence graph (like the
--   Phase-11 causal tables in 0015):
--     authenticated READ (auth.uid() is not null);
--     researcher+ INSERT/UPDATE/DELETE (public.is_researcher_or_above());
--     admin all (public.is_admin()).
--   The background COUNTERFACTUAL WORKER uses the Supabase service_role key, which
--   BYPASSES RLS entirely — it runs simulations, applies event actions, scores
--   results against forecasts, recomputes accuracy/calibration, and materializes
--   WorldForge scenarios without needing these policies. The policies below govern
--   only user-facing (per-request, cookie-backed) access.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

-- ---------- hsin_counterfactual_runs -----------------------------------------
-- A single "what if?" simulation over a narrative. scenario_type names the
-- intervention applied (remove/delay/accelerate an event, change amplification,
-- add/remove a source or community, shift reliability or contradiction).
-- confidence (0..1) scores the run; inputs_json / results_json carry the run's
-- parameters and outputs; generated_at stamps when the worker produced it.
create table if not exists public.hsin_counterfactual_runs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  narrative_id  uuid not null references public.hsin_narratives(id) on delete cascade,
  scenario_name text,
  scenario_type text not null check (scenario_type in (
                  'remove_event','delay_event','accelerate_event',
                  'reduce_amplification','increase_amplification',
                  'remove_source','add_source','remove_community',
                  'increase_reliability','decrease_reliability',
                  'remove_contradiction','increase_contradiction')),
  confidence    numeric check (confidence >= 0 and confidence <= 1),
  summary       text,
  inputs_json   jsonb,
  results_json  jsonb,
  generated_at  timestamptz,
  created_by    uuid references public.users(id) on delete set null
);
comment on table public.hsin_counterfactual_runs is
  'HSIN Phase 12: a single "what if?" counterfactual simulation over a narrative (scenario_type/confidence/inputs/results).';

-- ---------- hsin_counterfactual_events ----------------------------------------
-- The action a run applied to a specific causal event (removed/reduced/amplified/
-- delayed/accelerated), with an impact_score and reasoning. original_event_id is
-- nullable (set null on delete) so the action record survives pruning of the
-- underlying causal event.
create table if not exists public.hsin_counterfactual_events (
  id                    uuid primary key default gen_random_uuid(),
  counterfactual_run_id uuid not null references public.hsin_counterfactual_runs(id) on delete cascade,
  original_event_id     uuid references public.hsin_causal_events(id) on delete set null,
  action                text check (action in ('removed','reduced','amplified','delayed','accelerated')),
  impact_score          numeric,
  reasoning             text,
  created_at            timestamptz not null default now()
);
comment on table public.hsin_counterfactual_events is
  'HSIN Phase 12: the action a counterfactual run applied to a causal event (removed/reduced/amplified/delayed/accelerated).';

-- ---------- hsin_simulation_results -------------------------------------------
-- A simulated predicted state/probability for a run, scored against the actual
-- state/probability, with an error_score. forecast_id is nullable (set null on
-- delete) so the result survives pruning of the underlying forecast.
create table if not exists public.hsin_simulation_results (
  id                    uuid primary key default gen_random_uuid(),
  counterfactual_run_id uuid not null references public.hsin_counterfactual_runs(id) on delete cascade,
  forecast_id           uuid references public.hsin_narrative_forecasts(id) on delete set null,
  predicted_state       text,
  predicted_probability numeric,
  actual_state          text,
  actual_probability    numeric,
  error_score           numeric,
  created_at            timestamptz not null default now()
);
comment on table public.hsin_simulation_results is
  'HSIN Phase 12: a simulated predicted state/probability for a run, scored against the actual.';

-- ---------- hsin_forecast_accuracy --------------------------------------------
-- Rolling accuracy/calibration per narrative + forecast_window. accuracy_score
-- and calibration_score are 0..1. unique (narrative_id, forecast_window) keeps one
-- rolling row per window (idempotent upsert). This is the one mutable Phase-12
-- table (recomputed in place), so it carries updated_at + set_updated_at trigger.
create table if not exists public.hsin_forecast_accuracy (
  id                uuid primary key default gen_random_uuid(),
  narrative_id      uuid not null references public.hsin_narratives(id) on delete cascade,
  forecast_window   text,
  prediction_count  int,
  accuracy_score    numeric check (accuracy_score >= 0 and accuracy_score <= 1),
  calibration_score numeric check (calibration_score >= 0 and calibration_score <= 1),
  updated_at        timestamptz default now(),
  created_at        timestamptz not null default now(),
  unique (narrative_id, forecast_window)
);
comment on table public.hsin_forecast_accuracy is
  'HSIN Phase 12: rolling accuracy/calibration per narrative + forecast_window; unique per (narrative, window).';

-- ---------- hsin_worldforge_scenarios -----------------------------------------
-- An alternate world-state materialized from a counterfactual run, optionally
-- linked to a WorldForge link. world_state carries the alternate-world payload;
-- confidence (0..1) scores it. worldforge_link_id is nullable (set null on delete)
-- so the scenario survives pruning of the underlying WorldForge link.
create table if not exists public.hsin_worldforge_scenarios (
  id                    uuid primary key default gen_random_uuid(),
  counterfactual_run_id uuid not null references public.hsin_counterfactual_runs(id) on delete cascade,
  worldforge_link_id    uuid references public.hsin_worldforge_links(id) on delete set null,
  scenario_title        text,
  scenario_summary      text,
  world_state           jsonb,
  confidence            numeric check (confidence >= 0 and confidence <= 1),
  created_at            timestamptz not null default now()
);
comment on table public.hsin_worldforge_scenarios is
  'HSIN Phase 12: an alternate world-state materialized from a counterfactual run (world_state/confidence).';

-- =============================================================================
-- B. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_counterfactual_runs_narrative_id  on public.hsin_counterfactual_runs(narrative_id);
create index if not exists idx_hsin_counterfactual_runs_scenario_type on public.hsin_counterfactual_runs(scenario_type);
create index if not exists idx_hsin_counterfactual_runs_generated_at  on public.hsin_counterfactual_runs(generated_at);

create index if not exists idx_hsin_counterfactual_events_run_id on public.hsin_counterfactual_events(counterfactual_run_id);

create index if not exists idx_hsin_simulation_results_run_id on public.hsin_simulation_results(counterfactual_run_id);

create index if not exists idx_hsin_forecast_accuracy_narrative_id on public.hsin_forecast_accuracy(narrative_id);

create index if not exists idx_hsin_worldforge_scenarios_run_id  on public.hsin_worldforge_scenarios(counterfactual_run_id);
create index if not exists idx_hsin_worldforge_scenarios_link_id on public.hsin_worldforge_scenarios(worldforge_link_id);

-- =============================================================================
-- C. UPDATED_AT TRIGGER (mutable table only)
-- Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_forecast_accuracy;
create trigger trg_set_updated_at before update on public.hsin_forecast_accuracy
  for each row execute function public.set_updated_at();

-- =============================================================================
-- D. ENABLE RLS on all 5 new tables
-- =============================================================================
alter table public.hsin_counterfactual_runs   enable row level security;
alter table public.hsin_counterfactual_events  enable row level security;
alter table public.hsin_simulation_results     enable row level security;
alter table public.hsin_forecast_accuracy      enable row level security;
alter table public.hsin_worldforge_scenarios   enable row level security;

-- =============================================================================
-- E. POLICIES
-- Convention (matches 0002/0010/0011/0012/0013/0014/0015): permissive policies are
-- OR-combined — a row is visible/writable if ANY policy allows it. All 5 Phase-12
-- tables share the SHARED-INTELLIGENCE shape (like the 0015 causal tables):
--   authenticated READ; researcher+ INSERT/UPDATE/DELETE; admin all.
-- The background counterfactual worker uses the service_role key and bypasses ALL of these.
-- =============================================================================

-- ---------- hsin_counterfactual_runs ------------------------------------------
drop policy if exists hsin_counterfactual_runs_admin_all      on public.hsin_counterfactual_runs;
drop policy if exists hsin_counterfactual_runs_auth_read      on public.hsin_counterfactual_runs;
drop policy if exists hsin_counterfactual_runs_researcher_ins on public.hsin_counterfactual_runs;
drop policy if exists hsin_counterfactual_runs_researcher_upd on public.hsin_counterfactual_runs;
drop policy if exists hsin_counterfactual_runs_researcher_del on public.hsin_counterfactual_runs;

create policy hsin_counterfactual_runs_admin_all on public.hsin_counterfactual_runs
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_counterfactual_runs_auth_read on public.hsin_counterfactual_runs
  for select using (auth.uid() is not null);
create policy hsin_counterfactual_runs_researcher_ins on public.hsin_counterfactual_runs
  for insert with check (public.is_researcher_or_above());
create policy hsin_counterfactual_runs_researcher_upd on public.hsin_counterfactual_runs
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_counterfactual_runs_researcher_del on public.hsin_counterfactual_runs
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_counterfactual_events ----------------------------------------
drop policy if exists hsin_counterfactual_events_admin_all      on public.hsin_counterfactual_events;
drop policy if exists hsin_counterfactual_events_auth_read      on public.hsin_counterfactual_events;
drop policy if exists hsin_counterfactual_events_researcher_ins on public.hsin_counterfactual_events;
drop policy if exists hsin_counterfactual_events_researcher_upd on public.hsin_counterfactual_events;
drop policy if exists hsin_counterfactual_events_researcher_del on public.hsin_counterfactual_events;

create policy hsin_counterfactual_events_admin_all on public.hsin_counterfactual_events
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_counterfactual_events_auth_read on public.hsin_counterfactual_events
  for select using (auth.uid() is not null);
create policy hsin_counterfactual_events_researcher_ins on public.hsin_counterfactual_events
  for insert with check (public.is_researcher_or_above());
create policy hsin_counterfactual_events_researcher_upd on public.hsin_counterfactual_events
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_counterfactual_events_researcher_del on public.hsin_counterfactual_events
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_simulation_results -------------------------------------------
drop policy if exists hsin_simulation_results_admin_all      on public.hsin_simulation_results;
drop policy if exists hsin_simulation_results_auth_read      on public.hsin_simulation_results;
drop policy if exists hsin_simulation_results_researcher_ins on public.hsin_simulation_results;
drop policy if exists hsin_simulation_results_researcher_upd on public.hsin_simulation_results;
drop policy if exists hsin_simulation_results_researcher_del on public.hsin_simulation_results;

create policy hsin_simulation_results_admin_all on public.hsin_simulation_results
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_simulation_results_auth_read on public.hsin_simulation_results
  for select using (auth.uid() is not null);
create policy hsin_simulation_results_researcher_ins on public.hsin_simulation_results
  for insert with check (public.is_researcher_or_above());
create policy hsin_simulation_results_researcher_upd on public.hsin_simulation_results
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_simulation_results_researcher_del on public.hsin_simulation_results
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_forecast_accuracy --------------------------------------------
drop policy if exists hsin_forecast_accuracy_admin_all      on public.hsin_forecast_accuracy;
drop policy if exists hsin_forecast_accuracy_auth_read      on public.hsin_forecast_accuracy;
drop policy if exists hsin_forecast_accuracy_researcher_ins on public.hsin_forecast_accuracy;
drop policy if exists hsin_forecast_accuracy_researcher_upd on public.hsin_forecast_accuracy;
drop policy if exists hsin_forecast_accuracy_researcher_del on public.hsin_forecast_accuracy;

create policy hsin_forecast_accuracy_admin_all on public.hsin_forecast_accuracy
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_forecast_accuracy_auth_read on public.hsin_forecast_accuracy
  for select using (auth.uid() is not null);
create policy hsin_forecast_accuracy_researcher_ins on public.hsin_forecast_accuracy
  for insert with check (public.is_researcher_or_above());
create policy hsin_forecast_accuracy_researcher_upd on public.hsin_forecast_accuracy
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_forecast_accuracy_researcher_del on public.hsin_forecast_accuracy
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_worldforge_scenarios -----------------------------------------
drop policy if exists hsin_worldforge_scenarios_admin_all      on public.hsin_worldforge_scenarios;
drop policy if exists hsin_worldforge_scenarios_auth_read      on public.hsin_worldforge_scenarios;
drop policy if exists hsin_worldforge_scenarios_researcher_ins on public.hsin_worldforge_scenarios;
drop policy if exists hsin_worldforge_scenarios_researcher_upd on public.hsin_worldforge_scenarios;
drop policy if exists hsin_worldforge_scenarios_researcher_del on public.hsin_worldforge_scenarios;

create policy hsin_worldforge_scenarios_admin_all on public.hsin_worldforge_scenarios
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_worldforge_scenarios_auth_read on public.hsin_worldforge_scenarios
  for select using (auth.uid() is not null);
create policy hsin_worldforge_scenarios_researcher_ins on public.hsin_worldforge_scenarios
  for insert with check (public.is_researcher_or_above());
create policy hsin_worldforge_scenarios_researcher_upd on public.hsin_worldforge_scenarios
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_worldforge_scenarios_researcher_del on public.hsin_worldforge_scenarios
  for delete using (public.is_researcher_or_above());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background
-- counterfactual worker (running simulations, applying event actions, scoring
-- results against forecasts, recomputing accuracy/calibration, and materializing
-- WorldForge scenarios) uses it. User-facing reads/writes go through the
-- per-request, cookie-backed client and are authorized by the policies above.
-- NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0016_counterfactual_engine.sql
-- =============================================================================
