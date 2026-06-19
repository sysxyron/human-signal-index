-- =============================================================================
-- HSI Phase 67 — Forecast Validation Engine.
--
-- Infrastructure to RECORD forecasts, TRACK outcomes, and MEASURE accuracy +
-- calibration. This does NOT create AI predictions or autonomous forecasts — it
-- evaluates human/agent-recorded forecasts against reality, deterministically.
-- Forecasts are first-class, immutable, time-bound objects. ADDITIVE: no existing
-- table/column/policy modified. RLS: reviewer+ READ (is_reviewer_or_above), admin
-- MANAGE (is_admin). IDEMPOTENT (0048–0053 lessons).
-- =============================================================================

-- ---- forecasts --------------------------------------------------------------
create table if not exists public.forecasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  prediction_type text not null default 'binary'
    check (prediction_type in ('binary', 'probability', 'multi-outcome', 'range', 'narrative', 'event', 'trend')),
  status text not null default 'draft' check (status in ('draft', 'active', 'resolved', 'expired', 'cancelled')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  forecast_date timestamptz not null default now(),
  resolution_date timestamptz,
  outcome text,
  source text,
  agent_id text,
  narrative_id uuid references public.narratives (id) on delete set null,
  graph_node_id uuid references public.graph_nodes (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.forecasts add column if not exists description text;
alter table public.forecasts add column if not exists prediction_type text not null default 'binary';
alter table public.forecasts add column if not exists status text not null default 'draft';
alter table public.forecasts add column if not exists confidence numeric;
alter table public.forecasts add column if not exists forecast_date timestamptz not null default now();
alter table public.forecasts add column if not exists resolution_date timestamptz;
alter table public.forecasts add column if not exists outcome text;
alter table public.forecasts add column if not exists source text;
alter table public.forecasts add column if not exists agent_id text;
alter table public.forecasts add column if not exists narrative_id uuid references public.narratives (id) on delete set null;
alter table public.forecasts add column if not exists graph_node_id uuid references public.graph_nodes (id) on delete set null;
alter table public.forecasts add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.forecasts add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.forecasts add column if not exists created_at timestamptz not null default now();
alter table public.forecasts add column if not exists updated_at timestamptz;
create index if not exists idx_forecasts_status on public.forecasts (status);
create index if not exists idx_forecasts_resolution on public.forecasts (resolution_date);

-- ---- predictions (immutable payload per forecast) ---------------------------
create table if not exists public.forecast_predictions (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.forecasts (id) on delete cascade,
  prediction_type text not null,
  predicted_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.forecast_predictions add column if not exists predicted_value jsonb not null default '{}'::jsonb;
alter table public.forecast_predictions add column if not exists created_at timestamptz not null default now();
create index if not exists idx_forecast_predictions_forecast on public.forecast_predictions (forecast_id);

-- ---- outcomes (reality, recorded) ------------------------------------------
create table if not exists public.forecast_outcomes (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.forecasts (id) on delete cascade,
  actual_value jsonb not null default '{}'::jsonb,
  outcome_label text,
  note text,
  recorded_by uuid references public.users (id) on delete set null,
  recorded_at timestamptz not null default now()
);
alter table public.forecast_outcomes add column if not exists actual_value jsonb not null default '{}'::jsonb;
alter table public.forecast_outcomes add column if not exists outcome_label text;
alter table public.forecast_outcomes add column if not exists note text;
alter table public.forecast_outcomes add column if not exists recorded_by uuid references public.users (id) on delete set null;
alter table public.forecast_outcomes add column if not exists recorded_at timestamptz not null default now();
create index if not exists idx_forecast_outcomes_forecast on public.forecast_outcomes (forecast_id);

-- ---- evaluations (append-only, immutable history) --------------------------
create table if not exists public.forecast_evaluations (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.forecasts (id) on delete cascade,
  result text not null check (result in ('correct', 'incorrect', 'partial', 'unresolved', 'expired')),
  score numeric,
  rationale text,
  evaluated_by uuid references public.users (id) on delete set null,
  evaluated_at timestamptz not null default now()
);
alter table public.forecast_evaluations add column if not exists score numeric;
alter table public.forecast_evaluations add column if not exists rationale text;
alter table public.forecast_evaluations add column if not exists evaluated_by uuid references public.users (id) on delete set null;
alter table public.forecast_evaluations add column if not exists evaluated_at timestamptz not null default now();
create index if not exists idx_forecast_evaluations_forecast on public.forecast_evaluations (forecast_id, evaluated_at desc);

-- ---- scores (latest computed per forecast) ---------------------------------
create table if not exists public.forecast_scores (
  forecast_id uuid primary key references public.forecasts (id) on delete cascade,
  brier_score numeric,
  accuracy numeric,
  confidence numeric,
  error numeric,
  result text,
  computed_at timestamptz not null default now()
);
alter table public.forecast_scores add column if not exists accuracy numeric;
alter table public.forecast_scores add column if not exists confidence numeric;
alter table public.forecast_scores add column if not exists error numeric;
alter table public.forecast_scores add column if not exists result text;
alter table public.forecast_scores add column if not exists computed_at timestamptz not null default now();

-- ---- calibration (global curve buckets; recomputed) ------------------------
create table if not exists public.forecast_calibration (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  predicted_confidence numeric,
  actual_accuracy numeric,
  count integer not null default 0,
  computed_at timestamptz not null default now()
);
alter table public.forecast_calibration add column if not exists predicted_confidence numeric;
alter table public.forecast_calibration add column if not exists actual_accuracy numeric;
alter table public.forecast_calibration add column if not exists count integer not null default 0;
alter table public.forecast_calibration add column if not exists computed_at timestamptz not null default now();
create index if not exists idx_forecast_calibration_computed on public.forecast_calibration (computed_at desc);

-- ---- snapshots (aggregate performance series) ------------------------------
create table if not exists public.forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  active integer not null default 0,
  resolved integer not null default 0,
  expired integer not null default 0,
  accuracy numeric,
  calibration_score numeric,
  volume integer not null default 0,
  snapshot_at timestamptz not null default now()
);
alter table public.forecast_snapshots add column if not exists accuracy numeric;
alter table public.forecast_snapshots add column if not exists calibration_score numeric;
alter table public.forecast_snapshots add column if not exists volume integer not null default 0;
alter table public.forecast_snapshots add column if not exists snapshot_at timestamptz not null default now();
create index if not exists idx_forecast_snapshots_at on public.forecast_snapshots (snapshot_at desc);

-- ---- alerts -----------------------------------------------------------------
create table if not exists public.forecast_alerts (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid references public.forecasts (id) on delete cascade,
  alert_type text not null check (alert_type in (
    'FORECAST_DUE', 'FORECAST_RESOLVED', 'FORECAST_EXPIRED', 'FORECAST_MISSED', 'FORECAST_CALIBRATION_DROP', 'FORECAST_PERFORMANCE_CHANGE'
  )),
  severity text not null default 'NOTICE' check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  notification_id uuid references public.notifications (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.forecast_alerts add column if not exists severity text not null default 'NOTICE';
alter table public.forecast_alerts add column if not exists reason text;
alter table public.forecast_alerts add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.forecast_alerts add column if not exists notification_id uuid references public.notifications (id) on delete set null;
create index if not exists idx_forecast_alerts_forecast on public.forecast_alerts (forecast_id, created_at desc);

-- ---- Phase 66 agent: FORECAST_VALIDATION_AGENT (additive seed) --------------
insert into public.agents (agent_key, name, description, category) values
  ('FORECAST_VALIDATION_AGENT', 'Forecast Validation Agent', 'Detects due forecasts, evaluates recorded outcomes, computes scores, and raises alerts (validation only — no forecasting).', 'forecast')
on conflict (agent_key) do nothing;
insert into public.agent_schedules (agent_key, cadence) values ('FORECAST_VALIDATION_AGENT', 'daily') on conflict (agent_key) do nothing;
insert into public.agent_metrics (agent_key) values ('FORECAST_VALIDATION_AGENT') on conflict (agent_key) do nothing;

-- ---- RLS --------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'forecasts', 'forecast_predictions', 'forecast_outcomes', 'forecast_evaluations',
    'forecast_scores', 'forecast_calibration', 'forecast_snapshots', 'forecast_alerts'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_read on public.%I;', t, t);
    execute format('create policy %I_read on public.%I for select using (public.is_reviewer_or_above());', t, t);
    execute format('drop policy if exists %I_admin on public.%I;', t, t);
    execute format('create policy %I_admin on public.%I for all using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;
