-- =============================================================================
-- Human Signal Index — 0039_multi_tenant_organizations.sql
-- WorldForge / HSI (Phase 35) — Multi-Tenant & Organization Workspaces foundation.
--
-- Turns HSI into a multi-tenant platform: organizations, members, org audit, and
-- tenant ISOLATION on the intelligence tables. Infrastructure only — no billing,
-- subscriptions, or SSO.
--
-- SAFETY (preserve HSI 1.0): isolation is added with RESTRICTIVE RLS policies that
-- AND with the existing permissive policies (they never widen access). All existing
-- rows backfill to a DEFAULT organization, and every existing user is auto-enrolled
-- in it — so current behaviour is identical, while NEW organizations are isolated.
-- Records with organization_id = NULL are "platform/global" and remain visible.
--
-- GOVERNANCE (hard constraints): organization membership_role is ORG-SCOPED and
-- does NOT alter global RBAC / user_roles / auth / middleware. Platform admins
-- (public.is_admin()) retain GLOBAL visibility. Append-only audit. ADD-ONLY:
-- does not edit migrations 0001-0038.
-- =============================================================================

-- =============================================================================
-- A. ORGANIZATIONS + MEMBERS + AUDIT.
-- =============================================================================
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  logo_url    text,
  status      text not null default 'active' check (status in ('active','suspended','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.organizations is 'HSI Phase 35: tenant organizations (workspaces).';

-- Deterministic default org so backfills are stable + idempotent.
insert into public.organizations (id, slug, name, description)
  values ('00000000-0000-0000-0000-000000000001', 'default', 'Human Signal Index', 'Default platform organization (HSI 1.0 data).')
  on conflict (id) do nothing;

create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  membership_role text not null default 'contributor'
                    check (membership_role in ('owner','administrator','reviewer','researcher','contributor','tester')),
  joined_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now(),
  unique (organization_id, user_id)
);
comment on table public.organization_members is 'HSI Phase 35: org membership. membership_role is ORG-SCOPED — NEVER global RBAC.';
create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_org_members_org on public.organization_members(organization_id);

-- Auto-enroll every existing user into the default org (preserves their access).
insert into public.organization_members (organization_id, user_id, membership_role)
  select '00000000-0000-0000-0000-000000000001', u.id, 'contributor' from public.users u
  on conflict (organization_id, user_id) do nothing;

create table if not exists public.organization_audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor           uuid references public.users(id) on delete set null,
  action          text not null,
  target_user     uuid references public.users(id) on delete set null,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
comment on table public.organization_audit_log is 'HSI Phase 35: APPEND-ONLY org audit (membership changes, edits, invites, removals).';
create index if not exists idx_org_audit_org on public.organization_audit_log(organization_id, created_at desc);

-- =============================================================================
-- B. MEMBERSHIP HELPERS (security definer; org-scoped, not RBAC).
-- =============================================================================
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m where m.organization_id = org and m.user_id = auth.uid());
$$;
comment on function public.is_org_member(uuid) is 'HSI Phase 35: caller is a member of org. Render/isolation only — not a permission grant.';

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.membership_role in ('owner','administrator'));
$$;
comment on function public.is_org_admin(uuid) is 'HSI Phase 35: caller is an org owner/administrator (org-scoped admin, not global RBAC).';

-- =============================================================================
-- C. updated_at triggers.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['organizations','organization_members']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- D. RLS on org tables.
--    organizations    : members read own; global admin all.
--    members          : self + same-org members read; org-admins + global admins write.
--    audit            : org-admins + global admins read.
-- =============================================================================
alter table public.organizations enable row level security;
drop policy if exists organizations_admin_all on public.organizations;
drop policy if exists organizations_member_read on public.organizations;
create policy organizations_admin_all on public.organizations for all using (public.is_admin()) with check (public.is_admin());
create policy organizations_member_read on public.organizations for select using (public.is_org_member(id));

alter table public.organization_members enable row level security;
drop policy if exists org_members_admin_all on public.organization_members;
drop policy if exists org_members_self_read on public.organization_members;
drop policy if exists org_members_same_org_read on public.organization_members;
drop policy if exists org_members_org_admin_write on public.organization_members;
create policy org_members_admin_all on public.organization_members for all using (public.is_admin()) with check (public.is_admin());
create policy org_members_self_read on public.organization_members for select using (user_id = auth.uid());
create policy org_members_same_org_read on public.organization_members for select using (public.is_org_member(organization_id));
create policy org_members_org_admin_write on public.organization_members for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

alter table public.organization_audit_log enable row level security;
drop policy if exists org_audit_admin_all on public.organization_audit_log;
drop policy if exists org_audit_org_admin_read on public.organization_audit_log;
create policy org_audit_admin_all on public.organization_audit_log for all using (public.is_admin()) with check (public.is_admin());
create policy org_audit_org_admin_read on public.organization_audit_log for select using (public.is_org_admin(organization_id));

-- =============================================================================
-- E. TENANT ISOLATION — add organization_id, backfill default, index, and a
--    RESTRICTIVE org-isolation policy on each intelligence table. RESTRICTIVE
--    policies AND with the existing permissive ones (never widen). NULL org =
--    platform/global. Tables that don't have RLS enabled keep the (inert) policy
--    — we never ENABLE RLS here (that could deny-all + break a table).
-- =============================================================================
do $$
declare t text;
declare def constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  foreach t in array array[
    'investigations','hsin_publications','evidence_sources','hsin_signals',
    'user_missions','badges','beta_cohorts','trust_profiles'
  ]
  loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete set null', t);
    execute format('update public.%I set organization_id = %L where organization_id is null', t, def);
    execute format('create index if not exists %I on public.%I(organization_id)', 'idx_' || t || '_org', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all using (organization_id is null or public.is_admin() or public.is_org_member(organization_id)) with check (organization_id is null or public.is_admin() or public.is_org_member(organization_id))',
      t || '_org_isolation', t
    );
  end loop;
end$$;

-- =============================================================================
-- NOTE
-- The org DAL stamps organization_id on org-scoped reads/writes; the worker
-- (service_role) bypasses RLS and recomputes per-org. The trust/authority/impact
-- ENGINES are unchanged — only the data they read is org-scoped. No RBAC, IAM,
-- middleware, auth, or user_roles changes; membership never grants platform access.
-- =============================================================================

-- =============================================================================
-- End of 0039_multi_tenant_organizations.sql
-- =============================================================================
