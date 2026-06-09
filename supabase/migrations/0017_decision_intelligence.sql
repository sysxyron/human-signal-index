-- =============================================================================
-- Human Signal Index — 0017_decision_intelligence.sql
-- WorldForge / HSI (Phase 13) — Decision Intelligence & Strategic War Gaming.
--
-- Phase 13 adds a DECISION-INTELLIGENCE layer over the counterfactual / causal /
-- temporal narrative-intelligence graph (Phases 10-12). It records decision RUNS
-- that recommend a strategic action for a narrative (intervene / monitor /
-- escalate / no-action / counter-narrative), captures head-to-head SCENARIO
-- COMPARISONS (war-gaming "scenario A vs scenario B"), ranks candidate
-- INTERVENTIONS by expected effect / risk / confidence, models CROSS-NARRATIVE
-- IMPACTS (how one narrative amplifies/dampens/triggers/competes-with/reinforces
-- another), and stores a tamper-evident DECISION AUDIT (output + confidence +
-- limitations + log) for every run.
--   * hsin_decision_runs            — a recommended strategic action for a narrative;
--   * hsin_scenario_comparisons     — a head-to-head scenario A vs scenario B for a run;
--   * hsin_intervention_rankings    — ranked candidate interventions for a run;
--   * hsin_cross_narrative_impacts  — how one narrative affects another;
--   * hsin_decision_audits          — the audit record (output/confidence/limits/log) for a run.
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7-12 / migrations 0011-0016).
-- ---------------------------------------------------------------------------
-- Every Phase-13 table uses the `hsin_` prefix and references the Phase-8 narrative
-- table public.hsin_narratives(id) (created in 0012) and the Phase-13 run table
-- public.hsin_decision_runs itself.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY. It creates 5 new `hsin_`-prefixed tables (+ indexes,
-- RLS, policies). It does NOT edit migrations 0001-0016, drop existing
-- policies/roles/helpers, or touch any existing table/RLS.
--
-- CONVENTIONS (match 0001-0016):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz not null default now().
--   - FKs to public.hsin_narratives(id) on delete cascade; FKs to the Phase-13 run
--     table on delete cascade (child rows die with their run).
--   - created_by uuid references public.users(id) on delete set null (Phase 5/7 style).
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - No Phase-13 table carries an updated_at column (decision runs + their children
--     are append/recompute, never edited in place), so NO set_updated_at() triggers
--     are attached here — append and recompute stay consistent without them.
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_reviewer_or_above(),
--       public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- ROLE / ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   All 5 tables are part of the SHARED narrative-intelligence graph (like the
--   Phase-11 causal tables in 0015 and the Phase-12 counterfactual tables in 0016):
--     authenticated READ (auth.uid() is not null);
--     researcher+ INSERT/UPDATE/DELETE (public.is_researcher_or_above());
--     admin all (public.is_admin()).
--   The background DECISION WORKER uses the Supabase service_role key, which
--   BYPASSES RLS entirely — it scores decisions, war-games scenario comparisons,
--   ranks interventions, computes cross-narrative impacts, and writes audit records
--   without needing these policies. The policies below govern only user-facing
--   (per-request, cookie-backed) access.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

-- ---------- hsin_decision_runs ------------------------------------------------
-- A single decision-intelligence run over a narrative: it recommends a strategic
-- action (decision_type). confidence (0..1) scores the run; reasoning / limitations
-- carry the structured rationale and caveats; generated_at stamps when the worker
-- produced it.
create table if not exists public.hsin_decision_runs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  narrative_id       uuid not null references public.hsin_narratives(id) on delete cascade,
  decision_name      text,
  decision_type      text check (decision_type in (
                       'intervention','monitor','escalate','no_action','counter_narrative')),
  confidence         numeric check (confidence >= 0 and confidence <= 1),
  recommended_action text,
  reasoning          jsonb,
  limitations        jsonb,
  generated_at       timestamptz,
  created_by         uuid references public.users(id) on delete set null
);
comment on table public.hsin_decision_runs is
  'HSIN Phase 13: a decision-intelligence run recommending a strategic action for a narrative (decision_type/confidence/reasoning/limitations).';

-- ---------- hsin_scenario_comparisons -----------------------------------------
-- A head-to-head "scenario A vs scenario B" war-game for a decision run. winner
-- names the favoured scenario; confidence (0..1) scores the call; scenario_a /
-- scenario_b carry each scenario's payload.
create table if not exists public.hsin_scenario_comparisons (
  id                    uuid primary key default gen_random_uuid(),
  decision_run_id       uuid not null references public.hsin_decision_runs(id) on delete cascade,
  scenario_a            jsonb,
  scenario_b            jsonb,
  winner                text,
  confidence            numeric check (confidence >= 0 and confidence <= 1),
  comparison_reasoning  text,
  created_at            timestamptz not null default now()
);
comment on table public.hsin_scenario_comparisons is
  'HSIN Phase 13: a head-to-head scenario A vs scenario B war-game for a decision run (winner/confidence/reasoning).';

-- ---------- hsin_intervention_rankings ----------------------------------------
-- A ranked candidate intervention for a decision run. expected_effect and
-- risk_score are unbounded numerics; confidence (0..1) scores the estimate;
-- rank_position orders the candidates (1 = top pick).
create table if not exists public.hsin_intervention_rankings (
  id                uuid primary key default gen_random_uuid(),
  decision_run_id   uuid not null references public.hsin_decision_runs(id) on delete cascade,
  intervention_type text,
  expected_effect   numeric,
  risk_score        numeric,
  confidence        numeric check (confidence >= 0 and confidence <= 1),
  rank_position     int,
  reasoning         text,
  created_at        timestamptz not null default now()
);
comment on table public.hsin_intervention_rankings is
  'HSIN Phase 13: a ranked candidate intervention for a decision run (expected_effect/risk_score/confidence/rank_position).';

-- ---------- hsin_cross_narrative_impacts --------------------------------------
-- How a source narrative affects a target narrative. impact_type names the
-- relationship; impact_strength (0..100) and confidence (0..1) score it.
-- unique (source, target, impact_type) keeps one row per directed relationship
-- of a given type (idempotent upsert).
create table if not exists public.hsin_cross_narrative_impacts (
  id                  uuid primary key default gen_random_uuid(),
  source_narrative_id uuid not null references public.hsin_narratives(id) on delete cascade,
  target_narrative_id uuid not null references public.hsin_narratives(id) on delete cascade,
  impact_type         text check (impact_type in (
                        'amplifies','dampens','triggers','competes','reinforces','neutral')),
  impact_strength     numeric check (impact_strength >= 0 and impact_strength <= 100),
  confidence          numeric check (confidence >= 0 and confidence <= 1),
  reasoning           text,
  created_at          timestamptz not null default now(),
  unique (source_narrative_id, target_narrative_id, impact_type)
);
comment on table public.hsin_cross_narrative_impacts is
  'HSIN Phase 13: how a source narrative affects a target (amplifies/dampens/triggers/competes/reinforces/neutral); unique per (source, target, impact_type).';

-- ---------- hsin_decision_audits ----------------------------------------------
-- The audit record for a decision run: decision_output captures the final payload,
-- confidence (0..1) scores it, limitations lists caveats, and audit_log carries the
-- tamper-evident step-by-step trace.
create table if not exists public.hsin_decision_audits (
  id              uuid primary key default gen_random_uuid(),
  decision_run_id uuid not null references public.hsin_decision_runs(id) on delete cascade,
  decision_output jsonb,
  confidence      numeric check (confidence >= 0 and confidence <= 1),
  limitations     jsonb,
  audit_log       jsonb,
  created_at      timestamptz not null default now()
);
comment on table public.hsin_decision_audits is
  'HSIN Phase 13: the audit record for a decision run (decision_output/confidence/limitations/audit_log).';

-- =============================================================================
-- B. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_decision_runs_narrative_id  on public.hsin_decision_runs(narrative_id);
create index if not exists idx_hsin_decision_runs_decision_type on public.hsin_decision_runs(decision_type);
create index if not exists idx_hsin_decision_runs_generated_at  on public.hsin_decision_runs(generated_at);

create index if not exists idx_hsin_scenario_comparisons_run_id on public.hsin_scenario_comparisons(decision_run_id);

create index if not exists idx_hsin_intervention_rankings_run_id   on public.hsin_intervention_rankings(decision_run_id);
create index if not exists idx_hsin_intervention_rankings_rank_pos on public.hsin_intervention_rankings(rank_position);

create index if not exists idx_hsin_cross_narrative_impacts_source on public.hsin_cross_narrative_impacts(source_narrative_id);
create index if not exists idx_hsin_cross_narrative_impacts_target on public.hsin_cross_narrative_impacts(target_narrative_id);
create index if not exists idx_hsin_cross_narrative_impacts_type   on public.hsin_cross_narrative_impacts(impact_type);

create index if not exists idx_hsin_decision_audits_run_id on public.hsin_decision_audits(decision_run_id);

-- =============================================================================
-- C. UPDATED_AT TRIGGERS — none.
-- No Phase-13 table carries an updated_at column (decision runs and their children
-- are append/recompute, never edited in place), so the shared public.set_updated_at()
-- trigger (from 0003) is intentionally NOT attached to any table in this migration.
-- =============================================================================

-- =============================================================================
-- D. ENABLE RLS on all 5 new tables
-- =============================================================================
alter table public.hsin_decision_runs           enable row level security;
alter table public.hsin_scenario_comparisons     enable row level security;
alter table public.hsin_intervention_rankings     enable row level security;
alter table public.hsin_cross_narrative_impacts   enable row level security;
alter table public.hsin_decision_audits           enable row level security;

-- =============================================================================
-- E. POLICIES
-- Convention (matches 0002/0010/0011/0012/0013/0014/0015/0016): permissive policies
-- are OR-combined — a row is visible/writable if ANY policy allows it. All 5
-- Phase-13 tables share the SHARED-INTELLIGENCE shape (like the 0015 causal tables
-- and the 0016 counterfactual tables):
--   authenticated READ; researcher+ INSERT/UPDATE/DELETE; admin all.
-- The background decision worker uses the service_role key and bypasses ALL of these.
-- Drop-then-create for idempotency.
-- =============================================================================

-- ---------- hsin_decision_runs ------------------------------------------------
drop policy if exists hsin_decision_runs_admin_all      on public.hsin_decision_runs;
drop policy if exists hsin_decision_runs_auth_read      on public.hsin_decision_runs;
drop policy if exists hsin_decision_runs_researcher_ins on public.hsin_decision_runs;
drop policy if exists hsin_decision_runs_researcher_upd on public.hsin_decision_runs;
drop policy if exists hsin_decision_runs_researcher_del on public.hsin_decision_runs;

create policy hsin_decision_runs_admin_all on public.hsin_decision_runs
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_decision_runs_auth_read on public.hsin_decision_runs
  for select using (auth.uid() is not null);
create policy hsin_decision_runs_researcher_ins on public.hsin_decision_runs
  for insert with check (public.is_researcher_or_above());
create policy hsin_decision_runs_researcher_upd on public.hsin_decision_runs
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_decision_runs_researcher_del on public.hsin_decision_runs
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_scenario_comparisons -----------------------------------------
drop policy if exists hsin_scenario_comparisons_admin_all      on public.hsin_scenario_comparisons;
drop policy if exists hsin_scenario_comparisons_auth_read      on public.hsin_scenario_comparisons;
drop policy if exists hsin_scenario_comparisons_researcher_ins on public.hsin_scenario_comparisons;
drop policy if exists hsin_scenario_comparisons_researcher_upd on public.hsin_scenario_comparisons;
drop policy if exists hsin_scenario_comparisons_researcher_del on public.hsin_scenario_comparisons;

create policy hsin_scenario_comparisons_admin_all on public.hsin_scenario_comparisons
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_scenario_comparisons_auth_read on public.hsin_scenario_comparisons
  for select using (auth.uid() is not null);
create policy hsin_scenario_comparisons_researcher_ins on public.hsin_scenario_comparisons
  for insert with check (public.is_researcher_or_above());
create policy hsin_scenario_comparisons_researcher_upd on public.hsin_scenario_comparisons
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_scenario_comparisons_researcher_del on public.hsin_scenario_comparisons
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_intervention_rankings ----------------------------------------
drop policy if exists hsin_intervention_rankings_admin_all      on public.hsin_intervention_rankings;
drop policy if exists hsin_intervention_rankings_auth_read      on public.hsin_intervention_rankings;
drop policy if exists hsin_intervention_rankings_researcher_ins on public.hsin_intervention_rankings;
drop policy if exists hsin_intervention_rankings_researcher_upd on public.hsin_intervention_rankings;
drop policy if exists hsin_intervention_rankings_researcher_del on public.hsin_intervention_rankings;

create policy hsin_intervention_rankings_admin_all on public.hsin_intervention_rankings
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_intervention_rankings_auth_read on public.hsin_intervention_rankings
  for select using (auth.uid() is not null);
create policy hsin_intervention_rankings_researcher_ins on public.hsin_intervention_rankings
  for insert with check (public.is_researcher_or_above());
create policy hsin_intervention_rankings_researcher_upd on public.hsin_intervention_rankings
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_intervention_rankings_researcher_del on public.hsin_intervention_rankings
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_cross_narrative_impacts --------------------------------------
drop policy if exists hsin_cross_narrative_impacts_admin_all      on public.hsin_cross_narrative_impacts;
drop policy if exists hsin_cross_narrative_impacts_auth_read      on public.hsin_cross_narrative_impacts;
drop policy if exists hsin_cross_narrative_impacts_researcher_ins on public.hsin_cross_narrative_impacts;
drop policy if exists hsin_cross_narrative_impacts_researcher_upd on public.hsin_cross_narrative_impacts;
drop policy if exists hsin_cross_narrative_impacts_researcher_del on public.hsin_cross_narrative_impacts;

create policy hsin_cross_narrative_impacts_admin_all on public.hsin_cross_narrative_impacts
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_cross_narrative_impacts_auth_read on public.hsin_cross_narrative_impacts
  for select using (auth.uid() is not null);
create policy hsin_cross_narrative_impacts_researcher_ins on public.hsin_cross_narrative_impacts
  for insert with check (public.is_researcher_or_above());
create policy hsin_cross_narrative_impacts_researcher_upd on public.hsin_cross_narrative_impacts
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_cross_narrative_impacts_researcher_del on public.hsin_cross_narrative_impacts
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_decision_audits ----------------------------------------------
drop policy if exists hsin_decision_audits_admin_all      on public.hsin_decision_audits;
drop policy if exists hsin_decision_audits_auth_read      on public.hsin_decision_audits;
drop policy if exists hsin_decision_audits_researcher_ins on public.hsin_decision_audits;
drop policy if exists hsin_decision_audits_researcher_upd on public.hsin_decision_audits;
drop policy if exists hsin_decision_audits_researcher_del on public.hsin_decision_audits;

create policy hsin_decision_audits_admin_all on public.hsin_decision_audits
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_decision_audits_auth_read on public.hsin_decision_audits
  for select using (auth.uid() is not null);
create policy hsin_decision_audits_researcher_ins on public.hsin_decision_audits
  for insert with check (public.is_researcher_or_above());
create policy hsin_decision_audits_researcher_upd on public.hsin_decision_audits
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_decision_audits_researcher_del on public.hsin_decision_audits
  for delete using (public.is_researcher_or_above());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background decision
-- worker (scoring decisions, war-gaming scenario comparisons, ranking
-- interventions, computing cross-narrative impacts, and writing audit records)
-- uses it. User-facing reads/writes go through the per-request, cookie-backed
-- client and are authorized by the policies above. NEVER expose service_role to
-- clients.
-- =============================================================================

-- =============================================================================
-- End of 0017_decision_intelligence.sql
-- =============================================================================
