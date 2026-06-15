-- =============================================================================
-- Human Signal Index — 0043_saas_operations.sql
-- WorldForge / HSI (Phase 39, v1.1) — Commercial operations & SaaS intelligence.
--
-- Adds the analytics + operations layer over Phases 37-38: revenue snapshots,
-- churn events, cohort snapshots, subscription health, usage rollups, and a
-- webhook dead-letter queue. Read surfaces for admins; per-org health/usage
-- members can read. NO billing automation here — analytics + ops only.
--
-- GOVERNANCE: NO RBAC/auth/user_roles changes. Tenant-isolated (member read on
-- org-scoped tables; admin-only on platform analytics). Webhook dead-letters write
-- via the service-role (server-only). ADD-ONLY (0001-0042).
-- =============================================================================

-- =============================================================================
-- A. REVENUE SNAPSHOTS — periodic MRR/ARR + movement (platform analytics).
-- =============================================================================
create table if not exists public.revenue_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  period               text not null,            -- 'YYYY-MM' or ISO date
  mrr                  bigint not null default 0,
  arr                  bigint not null default 0,
  growth_rate          numeric not null default 0,
  expansion_revenue    bigint not null default 0,
  contraction_revenue  bigint not null default 0,
  churned_revenue      bigint not null default 0,
  net_new_revenue      bigint not null default 0,
  currency             text not null default 'usd',
  mrr_by_org           jsonb not null default '{}'::jsonb,  -- prior-period basis for next diff
  created_at           timestamptz not null default now()
);
comment on table public.revenue_snapshots is 'HSI Phase 39: periodic platform revenue snapshots.';
create index if not exists idx_revenue_snapshots_period on public.revenue_snapshots(period, created_at desc);

-- =============================================================================
-- B. CHURN EVENTS — per-org churn risk assessments.
-- =============================================================================
create table if not exists public.churn_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  risk            text not null check (risk in ('low','medium','high')),
  score           integer not null default 0,
  reasons         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
comment on table public.churn_events is 'HSI Phase 39: per-org churn risk assessments (history).';
create index if not exists idx_churn_events_org on public.churn_events(organization_id, created_at desc);
create index if not exists idx_churn_events_risk on public.churn_events(risk, created_at desc);

-- =============================================================================
-- C. COHORT SNAPSHOTS — retention/engagement/churn by cohort.
-- =============================================================================
create table if not exists public.cohort_snapshots (
  id              uuid primary key default gen_random_uuid(),
  cohort_key      text not null,                  -- signup_month|activation_month|plan
  cohort          text not null,                  -- e.g. '2026-01' or 'professional'
  size            integer not null default 0,
  retained        integer not null default 0,
  churned         integer not null default 0,
  retention_rate  numeric not null default 0,
  engagement_rate numeric not null default 0,
  created_at      timestamptz not null default now()
);
comment on table public.cohort_snapshots is 'HSI Phase 39: cohort retention/engagement snapshots.';
create index if not exists idx_cohort_snapshots_key on public.cohort_snapshots(cohort_key, created_at desc);

-- =============================================================================
-- D. SUBSCRIPTION HEALTH — per-org health + churn risk (latest-wins by org).
-- =============================================================================
create table if not exists public.subscription_health (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status          text not null default 'healthy' check (status in ('healthy','warning','at-risk')),
  score           integer not null default 0,
  churn_risk      text not null default 'low' check (churn_risk in ('low','medium','high')),
  usage_trend     numeric not null default 0,
  reasons         jsonb not null default '[]'::jsonb,
  computed_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);
comment on table public.subscription_health is 'HSI Phase 39: per-org subscription health + churn risk.';
create index if not exists idx_subscription_health_status on public.subscription_health(status);

-- =============================================================================
-- E. USAGE ROLLUPS — monthly per-org usage snapshots (current/previous/lifetime).
-- =============================================================================
create table if not exists public.usage_rollups (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period          text not null,                  -- 'YYYY-MM' or 'lifetime'
  signals         bigint not null default 0,
  investigations  bigint not null default 0,
  publications    bigint not null default 0,
  storage         bigint not null default 0,
  users           integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, period)
);
comment on table public.usage_rollups is 'HSI Phase 39: per-org monthly usage rollups.';
create index if not exists idx_usage_rollups_org on public.usage_rollups(organization_id, period);

-- =============================================================================
-- F. WEBHOOK DEAD-LETTERS — failed Stripe events for replay/retry ops.
-- =============================================================================
create table if not exists public.webhook_deadletters (
  id              uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type            text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  attempts        integer not null default 1,
  last_error      text,
  payload         jsonb,
  resolved        boolean not null default false,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);
comment on table public.webhook_deadletters is 'HSI Phase 39: failed Stripe webhook events for replay/retry (replay-safe).';
create index if not exists idx_webhook_deadletters_unresolved on public.webhook_deadletters(resolved, created_at desc);

-- =============================================================================
-- updated_at triggers.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['subscription_health','webhook_deadletters']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- RLS.
--   revenue_snapshots / cohort_snapshots / churn_events / webhook_deadletters :
--     admin-only (platform analytics + ops).
--   subscription_health / usage_rollups : org members read; admin all.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['revenue_snapshots','cohort_snapshots','churn_events','webhook_deadletters']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end$$;

alter table public.subscription_health enable row level security;
drop policy if exists sub_health_admin_all on public.subscription_health;
drop policy if exists sub_health_member_read on public.subscription_health;
create policy sub_health_admin_all on public.subscription_health for all using (public.is_admin()) with check (public.is_admin());
create policy sub_health_member_read on public.subscription_health for select using (public.is_org_member(organization_id));

alter table public.usage_rollups enable row level security;
drop policy if exists usage_rollups_admin_all on public.usage_rollups;
drop policy if exists usage_rollups_member_read on public.usage_rollups;
create policy usage_rollups_admin_all on public.usage_rollups for all using (public.is_admin()) with check (public.is_admin());
create policy usage_rollups_member_read on public.usage_rollups for select using (public.is_org_member(organization_id));

-- =============================================================================
-- NOTE
-- @hsi/saas-ops computes all analytics (revenue movement, churn, health, LTV,
-- cohorts, usage rollups, proration preview, forecasting, webhook replay). The web
-- DAL snapshots results here and powers the admin dashboards + org billing
-- insights. Proration is previewed in HSI but APPLIED by Stripe (source of truth)
-- and reflected back via webhooks. No RBAC/auth/user_roles changes; tenant
-- isolation preserved.
-- =============================================================================

-- =============================================================================
-- End of 0043_saas_operations.sql
-- =============================================================================
