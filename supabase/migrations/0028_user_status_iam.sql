-- =============================================================================
-- Human Signal Index — 0028_user_status_iam.sql
-- WorldForge / HSI (Phase 24B) — Identity & Access Management.
--
-- Adds an account lifecycle status to public.users so admins can run an
-- invitation + approval workflow from the UI (pending → active → suspended →
-- disabled) without touching Supabase manually.
--
-- ACCESS MODEL: unchanged. The existing users_admin_all policy (migration 0002)
-- already grants admins full read/write on public.users, and users_self_read lets
-- a user read their own row (so they can see their own status). The IAM server
-- actions use the service-role client (server-only) for auth.admin invitations.
--
-- AUDIT: status/role/team changes are logged to the existing
-- public.security_audit_events table (migration 0018). No new audit table.
--
-- This migration is ADD-ONLY. It does NOT edit migrations 0001-0027. It does NOT
-- change RLS, RBAC, or any existing table's columns beyond adding users.status.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Account lifecycle status on public.users.
--    Existing rows take the default 'active' (no disruption to current users).
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists status text
    check (status in ('pending', 'active', 'suspended', 'disabled'))
    default 'active';

comment on column public.users.status is
  'HSI Phase 24B: account lifecycle — pending (invited, awaiting approval) / active / suspended / disabled. Managed by admins via the IAM console; changes are audited to security_audit_events.';

-- Keep any pre-existing rows explicitly active (idempotent).
update public.users set status = 'active' where status is null;

create index if not exists idx_users_status on public.users(status);

-- =============================================================================
-- NOTE
-- Role assignment continues to write public.user_roles (never JWT/metadata).
-- Team membership continues to use public.team_members (migration 0027). Invited
-- users are created in auth.users via auth.admin.inviteUserByEmail() (service role,
-- server-only); the 0006 trigger mirrors them into public.users + grants the
-- default 'viewer' role; the IAM action then sets status='pending' and assigns the
-- chosen role/team. No autonomous actions; every change is admin-initiated + audited.
-- =============================================================================

-- =============================================================================
-- End of 0028_user_status_iam.sql
-- =============================================================================
