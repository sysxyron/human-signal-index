-- =============================================================================
-- HSI Phase 66 — Agent Automation Layer.
--
-- Operational agents that automate intelligence workflows with DETERMINISTIC
-- rules over the existing Phase 61–65 services. Agents do NOT publish, review,
-- moderate, or score truth — they observe, analyze, and produce explainable,
-- auditable, reproducible findings + alerts. Every run, action, and finding is
-- recorded. ADDITIVE: no existing table/column/policy modified.
--
-- Identity is the stable text agent_key (no dynamic code). RLS: reviewer+ READ
-- (is_reviewer_or_above), admin MANAGE (is_admin). IDEMPOTENT (0048–0052 lessons).
-- =============================================================================

-- ---- registry ---------------------------------------------------------------
create table if not exists public.agents (
  agent_key text primary key,
  name text not null,
  description text,
  category text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.agents add column if not exists description text;
alter table public.agents add column if not exists category text;
alter table public.agents add column if not exists enabled boolean not null default true;
alter table public.agents add column if not exists updated_at timestamptz;

create table if not exists public.agent_schedules (
  agent_key text primary key references public.agents (agent_key) on delete cascade,
  cadence text not null default 'manual' check (cadence in ('manual', 'hourly', 'daily', 'weekly', 'disabled')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  updated_at timestamptz
);
alter table public.agent_schedules add column if not exists last_run_at timestamptz;
alter table public.agent_schedules add column if not exists next_run_at timestamptz;
alter table public.agent_schedules add column if not exists updated_at timestamptz;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references public.agents (agent_key) on delete cascade,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  trigger text not null default 'manual' check (trigger in ('manual', 'scheduled', 'retry')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  findings_count integer not null default 0,
  alerts_count integer not null default 0,
  error text,
  actor_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.agent_runs add column if not exists finished_at timestamptz;
alter table public.agent_runs add column if not exists duration_ms integer;
alter table public.agent_runs add column if not exists findings_count integer not null default 0;
alter table public.agent_runs add column if not exists alerts_count integer not null default 0;
alter table public.agent_runs add column if not exists error text;
alter table public.agent_runs add column if not exists actor_id uuid references public.users (id) on delete set null;
create index if not exists idx_agent_runs_agent on public.agent_runs (agent_key, started_at desc);

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  agent_key text not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.agent_actions add column if not exists detail text;
create index if not exists idx_agent_actions_run on public.agent_actions (run_id);

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references public.agents (agent_key) on delete cascade,
  trigger text not null default 'scheduled',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  scheduled_for timestamptz,
  run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.agent_jobs add column if not exists scheduled_for timestamptz;
alter table public.agent_jobs add column if not exists run_id uuid references public.agent_runs (id) on delete set null;
alter table public.agent_jobs add column if not exists updated_at timestamptz;
create index if not exists idx_agent_jobs_status on public.agent_jobs (status, scheduled_for);

create table if not exists public.agent_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  agent_key text not null,
  finding text not null,
  severity text not null default 'INFO' check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  category text,
  evidence jsonb not null default '{}'::jsonb,
  source text,
  created_at timestamptz not null default now()
);
alter table public.agent_results add column if not exists category text;
alter table public.agent_results add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.agent_results add column if not exists source text;
create index if not exists idx_agent_results_run on public.agent_results (run_id);
create index if not exists idx_agent_results_agent on public.agent_results (agent_key, created_at desc);

create table if not exists public.agent_alerts (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null,
  run_id uuid references public.agent_runs (id) on delete set null,
  alert_type text not null check (alert_type in ('AGENT_ALERT', 'AGENT_FAILURE', 'AGENT_FINDING', 'AGENT_WARNING', 'AGENT_RECOMMENDATION')),
  severity text not null default 'NOTICE' check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  notification_id uuid references public.notifications (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.agent_alerts add column if not exists reason text;
alter table public.agent_alerts add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.agent_alerts add column if not exists notification_id uuid references public.notifications (id) on delete set null;
create index if not exists idx_agent_alerts_agent on public.agent_alerts (agent_key, created_at desc);

create table if not exists public.agent_metrics (
  agent_key text primary key references public.agents (agent_key) on delete cascade,
  total_runs integer not null default 0,
  successes integer not null default 0,
  failures integer not null default 0,
  avg_duration_ms integer,
  last_status text,
  last_run_at timestamptz,
  success_rate numeric,
  updated_at timestamptz
);
alter table public.agent_metrics add column if not exists avg_duration_ms integer;
alter table public.agent_metrics add column if not exists last_status text;
alter table public.agent_metrics add column if not exists last_run_at timestamptz;
alter table public.agent_metrics add column if not exists success_rate numeric;
alter table public.agent_metrics add column if not exists updated_at timestamptz;

-- ---- seed the registry (idempotent) ----------------------------------------
insert into public.agents (agent_key, name, description, category) values
  ('SOURCE_HEALTH_AGENT',        'Source Health Agent',        'Detects source failures, stale sources, collection gaps, and reliability drops.', 'monitoring'),
  ('NARRATIVE_WATCH_AGENT',      'Narrative Watch Agent',      'Tracks narrative growth, decline, fragmentation, and contradiction spikes.',      'narrative'),
  ('GRAPH_ANALYST_AGENT',        'Graph Analyst Agent',        'Finds isolated nodes, concentration, and highly connected entities.',             'graph'),
  ('REVIEW_QUEUE_AGENT',         'Review Queue Agent',         'Detects review bottlenecks, aging submissions, and backlog (no assignments).',     'workflow'),
  ('PUBLICATION_MONITOR_AGENT',  'Publication Monitor Agent',  'Tracks publication velocity, correction trends, and publication health.',          'publication'),
  ('TRUST_ANOMALY_AGENT',        'Trust Anomaly Agent',        'Flags unusual trust shifts, concentration, and evidence anomalies (flag only).',   'trust'),
  ('EXECUTIVE_BRIEF_AGENT',      'Executive Brief Agent',      'Produces explainable daily/weekly executive intelligence summaries.',              'executive'),
  ('FORECAST_PREP_AGENT',        'Forecast Prep Agent',        'Computes forecast-readiness indicators across Phases 61–65 (no forecasting).',     'forecast')
on conflict (agent_key) do nothing;

insert into public.agent_schedules (agent_key, cadence) values
  ('SOURCE_HEALTH_AGENT', 'daily'), ('NARRATIVE_WATCH_AGENT', 'daily'), ('GRAPH_ANALYST_AGENT', 'weekly'),
  ('REVIEW_QUEUE_AGENT', 'daily'), ('PUBLICATION_MONITOR_AGENT', 'weekly'), ('TRUST_ANOMALY_AGENT', 'daily'),
  ('EXECUTIVE_BRIEF_AGENT', 'daily'), ('FORECAST_PREP_AGENT', 'weekly')
on conflict (agent_key) do nothing;

insert into public.agent_metrics (agent_key) values
  ('SOURCE_HEALTH_AGENT'), ('NARRATIVE_WATCH_AGENT'), ('GRAPH_ANALYST_AGENT'), ('REVIEW_QUEUE_AGENT'),
  ('PUBLICATION_MONITOR_AGENT'), ('TRUST_ANOMALY_AGENT'), ('EXECUTIVE_BRIEF_AGENT'), ('FORECAST_PREP_AGENT')
on conflict (agent_key) do nothing;

-- ---- RLS --------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'agents', 'agent_schedules', 'agent_runs', 'agent_actions', 'agent_jobs',
    'agent_results', 'agent_alerts', 'agent_metrics'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_read on public.%I;', t, t);
    execute format('create policy %I_read on public.%I for select using (public.is_reviewer_or_above());', t, t);
    execute format('drop policy if exists %I_admin on public.%I;', t, t);
    execute format('create policy %I_admin on public.%I for all using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;
