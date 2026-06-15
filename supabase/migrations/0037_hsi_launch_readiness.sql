-- =============================================================================
-- Human Signal Index — 0037_hsi_launch_readiness.sql
-- WorldForge / HSI (Phase 33) — HSI 1.0 Launch Readiness & Production Hardening.
--
-- Adds OPERATIONS / observability storage for the 1.0 release candidate:
--   * system_failures   — APPEND-ONLY failure log (Deliverable 5).
--   * incident_log      — incident management (Deliverable 6).
--   * backup_runs       — backup registry (Deliverable 10).
--   * recovery_tests    — recovery-drill audit (Deliverable 11).
--   * rate_limits       — documented rate-limit registry (Deliverable 13).
--
-- This phase adds NO business features. GOVERNANCE: all tables are ADMIN-ONLY
-- (observability). Nothing here changes auth, middleware, RBAC, or user_roles.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0036. CONVENTIONS match 0001-0036.
-- =============================================================================

create table if not exists public.system_failures (
  id         uuid primary key default gen_random_uuid(),
  source     text not null,
  severity   text not null default 'warning' check (severity in ('info','warning','critical')),
  message    text not null,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
comment on table public.system_failures is 'HSI Phase 33: APPEND-ONLY system failure log (workers/queues/services).';
create index if not exists idx_system_failures_created on public.system_failures(created_at desc);
create index if not exists idx_system_failures_source on public.system_failures(source, created_at desc);

create table if not exists public.incident_log (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  severity    text not null default 'warning' check (severity in ('info','warning','critical')),
  status      text not null default 'open' check (status in ('open','investigating','resolved')),
  opened_by   uuid references public.users(id) on delete set null,
  notes       text,
  opened_at   timestamptz not null default now(),
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.incident_log is 'HSI Phase 33: incident management log.';
create index if not exists idx_incident_log_status on public.incident_log(status, opened_at desc);

create table if not exists public.backup_runs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'database' check (kind in ('database','storage','config')),
  status     text not null check (status in ('success','failed','partial')),
  size_bytes bigint,
  detail     text,
  ran_at     timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.backup_runs is 'HSI Phase 33: backup run registry.';
create index if not exists idx_backup_runs_ran on public.backup_runs(ran_at desc);

create table if not exists public.recovery_tests (
  id         uuid primary key default gen_random_uuid(),
  scenario   text not null,
  status     text not null check (status in ('pass','fail','skipped')),
  notes      text,
  tested_by  uuid references public.users(id) on delete set null,
  tested_at  timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.recovery_tests is 'HSI Phase 33: recovery-drill audit (restore verification).';

create table if not exists public.rate_limits (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  scope         text not null check (scope in ('ip','user','global','route')),
  limit_value   integer not null,
  window_label  text not null default 'per_minute',
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz default now()
);
comment on table public.rate_limits is 'HSI Phase 33: documented rate-limit registry (monitoring).';

-- Seed the documented limits (idempotent).
insert into public.rate_limits (key, scope, limit_value, window_label, notes) values
  ('auth_login', 'ip', 10, 'per_minute', 'Sign-in attempts per IP.'),
  ('signal_submit', 'user', 30, 'per_minute', 'Manual signal submissions per user.'),
  ('issue_report', 'user', 20, 'per_minute', 'Beta issue reports per user.'),
  ('api_default', 'user', 120, 'per_minute', 'Default authenticated API budget.')
on conflict (key) do nothing;

-- =============================================================================
-- updated_at triggers (mutable tables only).
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['incident_log','rate_limits']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- RLS — ADMIN-ONLY (observability). rate_limits is also readable by researcher+
-- (so the registry can be surfaced); the rest are admin-only.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['system_failures','incident_log','backup_runs','recovery_tests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end$$;

alter table public.rate_limits enable row level security;
drop policy if exists rate_limits_admin_all on public.rate_limits;
drop policy if exists rate_limits_read on public.rate_limits;
create policy rate_limits_admin_all on public.rate_limits for all using (public.is_admin()) with check (public.is_admin());
create policy rate_limits_read on public.rate_limits for select using (public.is_researcher_or_above());

-- =============================================================================
-- NOTE
-- The launch-readiness DAL reads these tables (admin-only) plus existing
-- materialized tables (user_contribution_stats / trust_profiles / graph_health) to
-- derive worker health, and computes integrity/KPIs/readiness via the pure
-- @hsi/launch-readiness engine. No auth/RBAC/middleware changes.
-- =============================================================================

-- =============================================================================
-- End of 0037_hsi_launch_readiness.sql
-- =============================================================================
