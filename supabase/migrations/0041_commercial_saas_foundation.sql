-- =============================================================================
-- Human Signal Index — 0041_commercial_saas_foundation.sql
-- WorldForge / HSI (Phase 37, v1.1) — Commercial SaaS foundation (NO payments).
--
-- Adds plans, feature entitlements, per-org subscriptions, usage tracking,
-- organization branding, and a subscription audit log. NO Stripe / invoices /
-- payment processing (Phase 38). High Community limits — framework only; nothing
-- blocks existing behaviour.
--
-- GOVERNANCE: entitlements gate FEATURES, never RBAC/auth/user_roles. Subscription
-- + branding are org-isolated (member read; admin/org-admin write). ADD-ONLY
-- (0001-0040). Conventions match prior migrations.
-- =============================================================================

-- =============================================================================
-- A. PLANS (seed Community/Professional/Enterprise/Government).
-- =============================================================================
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  tier        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.plans is 'HSI Phase 37: commercial plan catalog.';
insert into public.plans (slug, name, description, tier) values
  ('community','Community','Open contribution — generous defaults.',0),
  ('professional','Professional','Teams + advanced analytics + API.',1),
  ('enterprise','Enterprise','White-label, custom domains, AI agents.',2),
  ('government','Government','Enterprise + advanced governance.',3)
on conflict (slug) do nothing;

-- =============================================================================
-- B. FEATURE ENTITLEMENTS (seed the matrix from @hsi/entitlements).
-- =============================================================================
create table if not exists public.feature_entitlements (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  enabled     boolean not null default false,
  limit_value integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now(),
  unique (plan_id, feature_key)
);
comment on table public.feature_entitlements is 'HSI Phase 37: per-plan feature flags + limits.';

insert into public.feature_entitlements (plan_id, feature_key, enabled, limit_value)
select p.id, x.fk, x.en, x.lim
from public.plans p
join (values
  ('community','advanced_analytics',false,null::int),('community','white_label',false,null),('community','api_access',false,null),
  ('community','custom_domains',false,null),('community','ai_agents',false,null),('community','bulk_exports',false,null),
  ('community','advanced_governance',false,null),('community','organization_branding',true,null),('community','team_workspaces',true,null),
  ('community','investigations_limit',true,10000),('community','publications_limit',true,10000),('community','contributors_limit',true,10000),
  ('professional','advanced_analytics',true,null),('professional','white_label',false,null),('professional','api_access',true,null),
  ('professional','custom_domains',false,null),('professional','ai_agents',false,null),('professional','bulk_exports',true,null),
  ('professional','advanced_governance',false,null),('professional','organization_branding',true,null),('professional','team_workspaces',true,null),
  ('professional','investigations_limit',true,100000),('professional','publications_limit',true,100000),('professional','contributors_limit',true,100000),
  ('enterprise','advanced_analytics',true,null),('enterprise','white_label',true,null),('enterprise','api_access',true,null),
  ('enterprise','custom_domains',true,null),('enterprise','ai_agents',true,null),('enterprise','bulk_exports',true,null),
  ('enterprise','advanced_governance',true,null),('enterprise','organization_branding',true,null),('enterprise','team_workspaces',true,null),
  ('enterprise','investigations_limit',true,null),('enterprise','publications_limit',true,null),('enterprise','contributors_limit',true,null),
  ('government','advanced_analytics',true,null),('government','white_label',true,null),('government','api_access',true,null),
  ('government','custom_domains',true,null),('government','ai_agents',true,null),('government','bulk_exports',true,null),
  ('government','advanced_governance',true,null),('government','organization_branding',true,null),('government','team_workspaces',true,null),
  ('government','investigations_limit',true,null),('government','publications_limit',true,null),('government','contributors_limit',true,null)
) x(slug, fk, en, lim) on p.slug = x.slug
on conflict (plan_id, feature_key) do nothing;

-- =============================================================================
-- C. ORGANIZATION SUBSCRIPTIONS (seed all orgs → Community / active).
-- =============================================================================
create table if not exists public.organization_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade unique,
  plan_id         uuid not null references public.plans(id) on delete restrict,
  status          text not null default 'active' check (status in ('trial','active','paused','expired')),
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);
comment on table public.organization_subscriptions is 'HSI Phase 37: per-org plan subscription (no payments yet).';
insert into public.organization_subscriptions (organization_id, plan_id, status)
  select o.id, (select id from public.plans where slug = 'community'), 'active' from public.organizations o
  on conflict (organization_id) do nothing;

-- =============================================================================
-- D. USAGE TRACKING.
-- =============================================================================
create table if not exists public.organization_usage (
  organization_id      uuid primary key references public.organizations(id) on delete cascade,
  investigations_created integer not null default 0,
  publications_created integer not null default 0,
  contributors         integer not null default 0,
  evidence_items       integer not null default 0,
  storage_usage_bytes  bigint not null default 0,
  worker_executions    integer not null default 0,
  computed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz default now()
);
comment on table public.organization_usage is 'HSI Phase 37: per-org usage rollups (worker-refreshed).';

-- =============================================================================
-- I. ORGANIZATION BRANDING (infrastructure only; no runtime theming yet).
-- =============================================================================
create table if not exists public.organization_branding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  logo_url        text,
  primary_color   text,
  secondary_color text,
  accent_color    text,
  favicon_url     text,
  footer_text     text,
  updated_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);
comment on table public.organization_branding is 'HSI Phase 37: per-org white-label branding (stored; not yet rendered).';

-- =============================================================================
-- H. ORGANIZATION settings — extra contact fields on organizations.
-- =============================================================================
alter table public.organizations
  add column if not exists contact_email text,
  add column if not exists website text,
  add column if not exists support_email text;

-- =============================================================================
-- M. SUBSCRIPTION AUDIT LOG — APPEND-ONLY.
-- =============================================================================
create table if not exists public.subscription_audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor           uuid references public.users(id) on delete set null,
  action          text not null,
  previous_value  jsonb,
  new_value       jsonb,
  created_at      timestamptz not null default now()
);
comment on table public.subscription_audit_log is 'HSI Phase 37: APPEND-ONLY plan/entitlement/branding/settings change log.';
create index if not exists idx_sub_audit_org on public.subscription_audit_log(organization_id, created_at desc);

-- =============================================================================
-- updated_at triggers.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['plans','feature_entitlements','organization_subscriptions','organization_usage','organization_branding']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- RLS.
--   plans / feature_entitlements : world-readable catalog; admin writes.
--   subscriptions / usage        : org members read; admin all (worker service-role writes).
--   branding                     : org members read; org-admins + admins write.
--   audit                        : org-admins + admins read.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['plans','feature_entitlements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
  end loop;
end$$;

alter table public.organization_subscriptions enable row level security;
drop policy if exists org_subs_admin_all on public.organization_subscriptions;
drop policy if exists org_subs_member_read on public.organization_subscriptions;
create policy org_subs_admin_all on public.organization_subscriptions for all using (public.is_admin()) with check (public.is_admin());
create policy org_subs_member_read on public.organization_subscriptions for select using (public.is_org_member(organization_id));

alter table public.organization_usage enable row level security;
drop policy if exists org_usage_admin_all on public.organization_usage;
drop policy if exists org_usage_member_read on public.organization_usage;
create policy org_usage_admin_all on public.organization_usage for all using (public.is_admin()) with check (public.is_admin());
create policy org_usage_member_read on public.organization_usage for select using (public.is_org_member(organization_id));

alter table public.organization_branding enable row level security;
drop policy if exists org_branding_admin_all on public.organization_branding;
drop policy if exists org_branding_member_read on public.organization_branding;
drop policy if exists org_branding_org_admin_write on public.organization_branding;
create policy org_branding_admin_all on public.organization_branding for all using (public.is_admin()) with check (public.is_admin());
create policy org_branding_member_read on public.organization_branding for select using (public.is_org_member(organization_id));
create policy org_branding_org_admin_write on public.organization_branding for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

alter table public.subscription_audit_log enable row level security;
drop policy if exists sub_audit_admin_all on public.subscription_audit_log;
drop policy if exists sub_audit_org_admin_read on public.subscription_audit_log;
create policy sub_audit_admin_all on public.subscription_audit_log for all using (public.is_admin()) with check (public.is_admin());
create policy sub_audit_org_admin_read on public.subscription_audit_log for select using (public.is_org_admin(organization_id));

-- =============================================================================
-- NOTE
-- @hsi/entitlements resolves a plan's feature set (DB rows + engine defaults). The
-- DAL gates features per organization (requireFeature); Phase-37 ships high limits
-- so nothing blocks. Subscription writes are admin-only (no self-upgrade until
-- Phase 38 billing). No RBAC/auth/user_roles changes; org isolation preserved.
-- =============================================================================

-- =============================================================================
-- End of 0041_commercial_saas_foundation.sql
-- =============================================================================
