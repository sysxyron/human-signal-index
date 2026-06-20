-- =============================================================================
-- HSI Phase 70.1 — Production Infrastructure, Resilience & Observability.
--
-- ADMIN-ONLY operational records: backup/restore ledger, deployment ledger, an
-- infrastructure audit-event log, uptime checks, and incidents. ADDITIVE — no
-- existing table/column/policy modified; no ingestion/review/publishing/workflow
-- touched. These are RECORDS of real operational events (recorded by admins or
-- cron); the dashboards compute everything from them + live health probes. No
-- fabricated metrics.
--
-- RLS: admin manage + read (operational/security data). IDEMPOTENT (0048–0055).
-- =============================================================================

-- ---- backup & recovery ledger ----------------------------------------------
create table if not exists public.infra_backups (
  id uuid primary key default gen_random_uuid(),
  backed_up_at timestamptz not null default now(),
  status text not null default 'success' check (status in ('success', 'failed', 'in_progress')),
  kind text not null default 'full' check (kind in ('full', 'incremental')),
  size_bytes bigint,
  restore_tested boolean not null default false,
  restore_tested_at timestamptz,
  note text,
  recorded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.infra_backups add column if not exists kind text not null default 'full';
alter table public.infra_backups add column if not exists size_bytes bigint;
alter table public.infra_backups add column if not exists restore_tested boolean not null default false;
alter table public.infra_backups add column if not exists restore_tested_at timestamptz;
alter table public.infra_backups add column if not exists note text;
alter table public.infra_backups add column if not exists recorded_by uuid references public.users (id) on delete set null;
create index if not exists idx_infra_backups_at on public.infra_backups (backed_up_at desc);

-- ---- deployment ledger ------------------------------------------------------
create table if not exists public.infra_deployments (
  id uuid primary key default gen_random_uuid(),
  version text,
  commit_sha text,
  environment text not null default 'production' check (environment in ('production', 'preview', 'development')),
  status text not null default 'success' check (status in ('success', 'failed', 'rolled_back')),
  deployed_at timestamptz not null default now(),
  note text,
  recorded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.infra_deployments add column if not exists version text;
alter table public.infra_deployments add column if not exists commit_sha text;
alter table public.infra_deployments add column if not exists environment text not null default 'production';
alter table public.infra_deployments add column if not exists status text not null default 'success';
alter table public.infra_deployments add column if not exists note text;
alter table public.infra_deployments add column if not exists recorded_by uuid references public.users (id) on delete set null;
create index if not exists idx_infra_deployments_at on public.infra_deployments (deployed_at desc);

-- ---- infrastructure audit-event log ----------------------------------------
create table if not exists public.infra_events (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('backup', 'restore', 'deployment', 'migration', 'error', 'uptime', 'incident')),
  event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.infra_events add column if not exists severity text not null default 'info';
alter table public.infra_events add column if not exists detail text;
alter table public.infra_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.infra_events add column if not exists actor_id uuid references public.users (id) on delete set null;
create index if not exists idx_infra_events_created on public.infra_events (created_at desc);
create index if not exists idx_infra_events_category on public.infra_events (category, created_at desc);

-- ---- uptime checks ----------------------------------------------------------
create table if not exists public.infra_uptime_checks (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  ok boolean not null default true,
  status_code integer,
  latency_ms integer,
  checked_at timestamptz not null default now()
);
alter table public.infra_uptime_checks add column if not exists status_code integer;
alter table public.infra_uptime_checks add column if not exists latency_ms integer;
create index if not exists idx_infra_uptime_endpoint on public.infra_uptime_checks (endpoint, checked_at desc);
create index if not exists idx_infra_uptime_checked on public.infra_uptime_checks (checked_at desc);

-- ---- incidents --------------------------------------------------------------
create table if not exists public.infra_incidents (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error', 'critical')),
  detail text,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.infra_incidents add column if not exists severity text not null default 'warning';
alter table public.infra_incidents add column if not exists detail text;
alter table public.infra_incidents add column if not exists resolved_at timestamptz;
create index if not exists idx_infra_incidents_status on public.infra_incidents (status, started_at desc);

-- ---- RLS (admin manage + read) ---------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['infra_backups', 'infra_deployments', 'infra_events', 'infra_uptime_checks', 'infra_incidents'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_admin on public.%I;', t, t);
    execute format('create policy %I_admin on public.%I for all using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;
