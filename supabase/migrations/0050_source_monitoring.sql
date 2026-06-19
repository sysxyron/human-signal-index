-- =============================================================================
-- HSI Phase 63 — Automated Source Monitoring.
--
-- Persists the monitoring layer that sits OVER the existing ingestion telemetry:
-- a current per-source state snapshot, an append-only transition log, and the
-- generated alert feed. ADDITIVE — no existing table/column/policy is modified;
-- ingestion, crawler, cadence, adapters, and scheduler are untouched. This phase
-- only consumes Phase 61 reliability + Phase 62 notifications.
--
-- SECURITY MODEL (RLS): reviewer+ may READ (is_reviewer_or_above); admins MANAGE
-- (is_admin). The monitoring run writes as an admin (server action) or via the
-- service-role cron (RLS bypassed deliberately, server-only). No public access.
-- source_id is stored as text (no FK) so monitoring never breaks if a source is
-- removed — it is observational, not part of ingestion.
--
-- IDEMPOTENT (0048/0049 lessons): create-if-not-exists + add-column-if-not-exists
-- before dependent indexes + drop-policy-if-exists before create. Safe to re-run.
-- =============================================================================

-- ---- current per-source monitoring state (one row per source) ---------------
create table if not exists public.source_monitoring_state (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  source_name text,
  source_type text,
  state text not null check (state in ('HEALTHY', 'WARNING', 'DEGRADED', 'STALE', 'BLOCKED', 'UNREACHABLE', 'FAILED', 'RECOVERED')),
  reason text,
  score numeric,
  prev_score numeric,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  days_stale integer,
  evidence jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.source_monitoring_state add column if not exists source_name text;
alter table public.source_monitoring_state add column if not exists source_type text;
alter table public.source_monitoring_state add column if not exists state text not null default 'HEALTHY';
alter table public.source_monitoring_state add column if not exists reason text;
alter table public.source_monitoring_state add column if not exists score numeric;
alter table public.source_monitoring_state add column if not exists prev_score numeric;
alter table public.source_monitoring_state add column if not exists last_success_at timestamptz;
alter table public.source_monitoring_state add column if not exists last_failure_at timestamptz;
alter table public.source_monitoring_state add column if not exists days_stale integer;
alter table public.source_monitoring_state add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.source_monitoring_state add column if not exists evaluated_at timestamptz not null default now();
alter table public.source_monitoring_state add column if not exists created_at timestamptz not null default now();
alter table public.source_monitoring_state add column if not exists updated_at timestamptz;
create index if not exists idx_source_monitoring_state_state on public.source_monitoring_state (state);

-- ---- append-only state transition log ---------------------------------------
create table if not exists public.source_monitoring_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  source_name text,
  from_state text,
  to_state text not null,
  kind text,
  reason text,
  score numeric,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.source_monitoring_events add column if not exists source_name text;
alter table public.source_monitoring_events add column if not exists from_state text;
alter table public.source_monitoring_events add column if not exists to_state text not null default 'HEALTHY';
alter table public.source_monitoring_events add column if not exists kind text;
alter table public.source_monitoring_events add column if not exists reason text;
alter table public.source_monitoring_events add column if not exists score numeric;
alter table public.source_monitoring_events add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.source_monitoring_events add column if not exists created_at timestamptz not null default now();
create index if not exists idx_source_monitoring_events_source on public.source_monitoring_events (source_id, created_at desc);
create index if not exists idx_source_monitoring_events_created on public.source_monitoring_events (created_at desc);

-- ---- generated alert feed ---------------------------------------------------
create table if not exists public.source_monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  source_name text,
  source_type text,
  kind text not null check (kind in ('SOURCE_FAILED', 'SOURCE_RECOVERED', 'SOURCE_BLOCKED', 'SOURCE_STALE', 'SOURCE_DEGRADED', 'COLLECTION_GAP', 'RELIABILITY_DROP')),
  severity text not null check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  state text,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  score_before numeric,
  score_after numeric,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  notification_id uuid references public.notifications (id) on delete set null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.source_monitoring_alerts add column if not exists source_name text;
alter table public.source_monitoring_alerts add column if not exists source_type text;
alter table public.source_monitoring_alerts add column if not exists kind text not null default 'SOURCE_FAILED';
alter table public.source_monitoring_alerts add column if not exists severity text not null default 'WARNING';
alter table public.source_monitoring_alerts add column if not exists state text;
alter table public.source_monitoring_alerts add column if not exists reason text;
alter table public.source_monitoring_alerts add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.source_monitoring_alerts add column if not exists score_before numeric;
alter table public.source_monitoring_alerts add column if not exists score_after numeric;
alter table public.source_monitoring_alerts add column if not exists last_success_at timestamptz;
alter table public.source_monitoring_alerts add column if not exists last_failure_at timestamptz;
alter table public.source_monitoring_alerts add column if not exists notification_id uuid references public.notifications (id) on delete set null;
alter table public.source_monitoring_alerts add column if not exists acknowledged_at timestamptz;
alter table public.source_monitoring_alerts add column if not exists acknowledged_by uuid references public.users (id) on delete set null;
alter table public.source_monitoring_alerts add column if not exists created_at timestamptz not null default now();
create index if not exists idx_source_monitoring_alerts_created on public.source_monitoring_alerts (created_at desc);
create index if not exists idx_source_monitoring_alerts_severity on public.source_monitoring_alerts (severity);
create index if not exists idx_source_monitoring_alerts_source on public.source_monitoring_alerts (source_id);

-- ---- RLS --------------------------------------------------------------------
alter table public.source_monitoring_state enable row level security;
alter table public.source_monitoring_events enable row level security;
alter table public.source_monitoring_alerts enable row level security;

-- reviewer+ read; admin manage. (Service-role cron bypasses RLS server-side.)
drop policy if exists source_monitoring_state_read on public.source_monitoring_state;
create policy source_monitoring_state_read on public.source_monitoring_state
  for select using (public.is_reviewer_or_above());
drop policy if exists source_monitoring_state_admin on public.source_monitoring_state;
create policy source_monitoring_state_admin on public.source_monitoring_state
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists source_monitoring_events_read on public.source_monitoring_events;
create policy source_monitoring_events_read on public.source_monitoring_events
  for select using (public.is_reviewer_or_above());
drop policy if exists source_monitoring_events_admin on public.source_monitoring_events;
create policy source_monitoring_events_admin on public.source_monitoring_events
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists source_monitoring_alerts_read on public.source_monitoring_alerts;
create policy source_monitoring_alerts_read on public.source_monitoring_alerts
  for select using (public.is_reviewer_or_above());
drop policy if exists source_monitoring_alerts_admin on public.source_monitoring_alerts;
create policy source_monitoring_alerts_admin on public.source_monitoring_alerts
  for all using (public.is_admin()) with check (public.is_admin());
