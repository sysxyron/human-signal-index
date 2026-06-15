-- =============================================================================
-- Human Signal Index — 0040_tenant_operations_provisioning.sql
-- WorldForge / HSI (Phase 36) — Tenant-Aware Operations & Org Provisioning.
--
-- Completes the Phase-35 org architecture: organization INVITATIONS, and
-- organization_id on the operational/recognition tables so writes, workers, and
-- leaderboards are fully tenant-scoped:
--   * organization_invitations — token invite workflow (reuses IAM patterns).
--   * organization_id added to: contribution_events, trust_events,
--     attribution_ledger, outcome_events, user_contribution_stats,
--     leaderboard_snapshots — backfilled to the default org, RESTRICTIVE RLS.
--
-- SAFETY: same additive model as 0039 — backfill default org, RESTRICTIVE
-- isolation policies (AND with existing permissive policies), NULL org = global.
-- GOVERNANCE: membership_role is org-scoped (never global RBAC); no auth /
-- middleware / user_roles changes. Acceptance writes membership via a server-only
-- service-role action (token-gated) — never client-side. ADD-ONLY (0001-0039).
-- =============================================================================

-- =============================================================================
-- A. ORGANIZATION INVITATIONS (F).
-- =============================================================================
create table if not exists public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null,
  membership_role text not null default 'contributor'
                    check (membership_role in ('owner','administrator','reviewer','researcher','contributor','tester')),
  token           text not null unique,
  invited_by      uuid references public.users(id) on delete set null,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  accepted_by     uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table public.organization_invitations is 'HSI Phase 36: org invitations (token + role + expiry). Acceptance assigns ORG membership only — never global RBAC.';
create index if not exists idx_org_invites_org on public.organization_invitations(organization_id);
create index if not exists idx_org_invites_email on public.organization_invitations(email);

-- RLS: org-admins + platform admins manage; the invitee may read THEIR invite
-- (email matches the JWT email). Acceptance + membership creation is performed by
-- a server-only service-role action (token-gated), so no broad write policy here.
alter table public.organization_invitations enable row level security;
drop policy if exists org_invites_admin_all on public.organization_invitations;
drop policy if exists org_invites_org_admin on public.organization_invitations;
drop policy if exists org_invites_invitee_read on public.organization_invitations;
create policy org_invites_admin_all on public.organization_invitations for all using (public.is_admin()) with check (public.is_admin());
create policy org_invites_org_admin on public.organization_invitations for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy org_invites_invitee_read on public.organization_invitations for select
  using (email = (auth.jwt() ->> 'email'));

-- =============================================================================
-- B. TENANT ISOLATION on operational / recognition tables (A, C, D).
--    Same pattern as 0039: add column, backfill default, index, RESTRICTIVE policy.
-- =============================================================================
do $$
declare t text;
declare def constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  foreach t in array array[
    'contribution_events','trust_events','attribution_ledger','outcome_events',
    'user_contribution_stats','leaderboard_snapshots'
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
-- Write paths now stamp organization_id from the caller's current organization
-- (getCurrentOrganizationId). The contributor worker recomputes per organization
-- and writes org-scoped leaderboard_snapshots. Invitation acceptance uses a
-- server-only service-role action gated by token + email + expiry, then writes
-- organization_members + organization_audit_log. No RBAC/auth/middleware/user_roles
-- changes; membership never grants platform access.
-- =============================================================================

-- =============================================================================
-- End of 0040_tenant_operations_provisioning.sql
-- =============================================================================
