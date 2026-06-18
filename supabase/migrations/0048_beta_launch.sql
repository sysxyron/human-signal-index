-- =============================================================================
-- HSI Phase 60 — Expanded Beta Launch Operations.
--
-- New operational tables for the admin Beta Launch console: cohorts, cohort
-- membership, invite tracking + audit, and a structured feedback system. These
-- are ADDITIVE — no existing table/column/policy is modified. User, contributor,
-- reviewer, publication, and source records are NOT duplicated (the console reads
-- those via the existing intelligence layer).
--
-- RLS reuses the existing helpers public.is_admin() (admin-manage) and auth.uid()
-- (a beta user may submit + read their OWN feedback). All admin writes go through
-- the RLS admin client (requireAdmin gate in the DAL).
--
-- IDEMPOTENT (Phase 61.1): a partial earlier run could leave a table present but
-- missing a column (e.g. beta_cohorts without `status`) or leave policies behind.
-- Every column is (re)asserted with `add column if not exists` BEFORE any index
-- that references it, and every policy is `drop policy if exists` before create.
-- Safe to re-run against a fully-applied, partially-applied, or empty schema.
-- =============================================================================

-- ---- cohorts ----------------------------------------------------------------
create table if not exists public.beta_cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  status text not null default 'active' check (status in ('active', 'archived')),
  description text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
-- Backfill columns a partial prior run may have skipped (table-exists-no-column).
alter table public.beta_cohorts add column if not exists name text;
alter table public.beta_cohorts add column if not exists code text;
alter table public.beta_cohorts add column if not exists status text not null default 'active';
alter table public.beta_cohorts add column if not exists description text;
alter table public.beta_cohorts add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.beta_cohorts add column if not exists created_at timestamptz not null default now();
alter table public.beta_cohorts add column if not exists updated_at timestamptz;
create index if not exists idx_beta_cohorts_status on public.beta_cohorts (status);

create table if not exists public.beta_cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.beta_cohorts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  added_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cohort_id, user_id)
);
alter table public.beta_cohort_members add column if not exists cohort_id uuid;
alter table public.beta_cohort_members add column if not exists user_id uuid;
alter table public.beta_cohort_members add column if not exists status text not null default 'active';
alter table public.beta_cohort_members add column if not exists added_by uuid references public.users (id) on delete set null;
alter table public.beta_cohort_members add column if not exists created_at timestamptz not null default now();
create index if not exists idx_beta_cohort_members_cohort on public.beta_cohort_members (cohort_id);
create index if not exists idx_beta_cohort_members_user on public.beta_cohort_members (user_id);

-- ---- invites ----------------------------------------------------------------
create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'viewer',
  cohort_id uuid references public.beta_cohorts (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid references public.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.beta_invites add column if not exists email text;
alter table public.beta_invites add column if not exists role text not null default 'viewer';
alter table public.beta_invites add column if not exists cohort_id uuid references public.beta_cohorts (id) on delete set null;
alter table public.beta_invites add column if not exists status text not null default 'pending';
alter table public.beta_invites add column if not exists invited_by uuid references public.users (id) on delete set null;
alter table public.beta_invites add column if not exists sent_at timestamptz not null default now();
alter table public.beta_invites add column if not exists accepted_at timestamptz;
alter table public.beta_invites add column if not exists expires_at timestamptz;
alter table public.beta_invites add column if not exists created_at timestamptz not null default now();
create index if not exists idx_beta_invites_status on public.beta_invites (status);
create index if not exists idx_beta_invites_cohort on public.beta_invites (cohort_id);

create table if not exists public.beta_invite_events (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.beta_invites (id) on delete cascade,
  event text not null check (event in ('sent', 'resent', 'revoked', 'accepted', 'expired')),
  actor_id uuid references public.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.beta_invite_events add column if not exists invite_id uuid;
alter table public.beta_invite_events add column if not exists event text;
alter table public.beta_invite_events add column if not exists actor_id uuid references public.users (id) on delete set null;
alter table public.beta_invite_events add column if not exists note text;
alter table public.beta_invite_events add column if not exists created_at timestamptz not null default now();
create index if not exists idx_beta_invite_events_invite on public.beta_invite_events (invite_id);

-- ---- feedback ---------------------------------------------------------------
create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  category text not null default 'other'
    check (category in ('bug', 'ux', 'workflow', 'trust', 'forecasting', 'source_quality', 'feature_request', 'other')),
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'planned', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.beta_feedback add column if not exists user_id uuid references public.users (id) on delete set null;
alter table public.beta_feedback add column if not exists category text not null default 'other';
alter table public.beta_feedback add column if not exists title text;
alter table public.beta_feedback add column if not exists body text;
alter table public.beta_feedback add column if not exists status text not null default 'open';
alter table public.beta_feedback add column if not exists created_at timestamptz not null default now();
alter table public.beta_feedback add column if not exists updated_at timestamptz;
create index if not exists idx_beta_feedback_status on public.beta_feedback (status);
create index if not exists idx_beta_feedback_category on public.beta_feedback (category);

-- ---- RLS --------------------------------------------------------------------
alter table public.beta_cohorts enable row level security;
alter table public.beta_cohort_members enable row level security;
alter table public.beta_invites enable row level security;
alter table public.beta_invite_events enable row level security;
alter table public.beta_feedback enable row level security;

-- Cohorts / membership / invites / invite events: admin manage only.
drop policy if exists beta_cohorts_admin_all on public.beta_cohorts;
create policy beta_cohorts_admin_all on public.beta_cohorts
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists beta_cohort_members_admin_all on public.beta_cohort_members;
create policy beta_cohort_members_admin_all on public.beta_cohort_members
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists beta_invites_admin_all on public.beta_invites;
create policy beta_invites_admin_all on public.beta_invites
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists beta_invite_events_admin_all on public.beta_invite_events;
create policy beta_invite_events_admin_all on public.beta_invite_events
  for all using (public.is_admin()) with check (public.is_admin());

-- Feedback: admins manage all; a signed-in user may submit + read their OWN.
drop policy if exists beta_feedback_admin_all on public.beta_feedback;
create policy beta_feedback_admin_all on public.beta_feedback
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists beta_feedback_owner_insert on public.beta_feedback;
create policy beta_feedback_owner_insert on public.beta_feedback
  for insert with check (auth.uid() = user_id);
drop policy if exists beta_feedback_owner_read on public.beta_feedback;
create policy beta_feedback_owner_read on public.beta_feedback
  for select using (auth.uid() = user_id);
