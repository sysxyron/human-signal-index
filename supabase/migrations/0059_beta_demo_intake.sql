-- =============================================================================
-- HSI Milestone 86 — Beta application & demo request intake (public funnel sink).
--
-- Backs the public /api/beta/apply and /api/demo/request forms, which previously
-- validated and returned success WITHOUT persisting (placeholder). These two
-- tables are the durable sink. They are ADDITIVE — no existing table/column/policy
-- is modified, and they do NOT duplicate the Phase 60 beta_invites/beta_cohorts
-- system (that is the post-acceptance invite lifecycle; this is the inbound queue).
--
-- SECURITY MODEL (least privilege):
--   • NO public/anon SELECT, UPDATE, or DELETE — these rows hold PII (name/email).
--   • NO public INSERT policy either: the API route inserts with the SERVICE-ROLE
--     client (which bypasses RLS), so the anon/browser key can never write here.
--   • Admins (public.is_admin()) may read + manage (triage, accept/reject).
--   RLS is enabled with admin-only policies; absent a service-role key or admin
--   session, the tables are inert (the route degrades to validate-only — the form
--   still succeeds for the user; see app/api/beta/apply + app/api/demo/request).
--
-- IDEMPOTENT: create-if-not-exists + add-column-if-not-exists + drop-policy-if-
-- exists, mirroring 0048. Safe to re-run against empty / partial / applied schema.
-- =============================================================================

-- ---- beta applications ------------------------------------------------------
create table if not exists public.beta_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  organization text,
  role text not null,
  area_of_interest text,
  reason text not null,
  experience text,
  preferred_role text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'duplicate')),
  source text not null default 'web',
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.beta_applications add column if not exists name text;
alter table public.beta_applications add column if not exists email text;
alter table public.beta_applications add column if not exists organization text;
alter table public.beta_applications add column if not exists role text;
alter table public.beta_applications add column if not exists area_of_interest text;
alter table public.beta_applications add column if not exists reason text;
alter table public.beta_applications add column if not exists experience text;
alter table public.beta_applications add column if not exists preferred_role text;
alter table public.beta_applications add column if not exists status text not null default 'pending';
alter table public.beta_applications add column if not exists source text not null default 'web';
alter table public.beta_applications add column if not exists reviewed_by uuid references public.users (id) on delete set null;
alter table public.beta_applications add column if not exists reviewed_at timestamptz;
alter table public.beta_applications add column if not exists created_at timestamptz not null default now();
alter table public.beta_applications add column if not exists updated_at timestamptz;
create index if not exists idx_beta_applications_email on public.beta_applications (email);
create index if not exists idx_beta_applications_status on public.beta_applications (status);
create index if not exists idx_beta_applications_created on public.beta_applications (created_at desc);

-- ---- demo requests ----------------------------------------------------------
create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  organization text not null,
  use_case text not null,
  role text,
  team_size text,
  timeline text,
  notes text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'scheduled', 'closed', 'duplicate')),
  source text not null default 'web',
  handled_by uuid references public.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.demo_requests add column if not exists name text;
alter table public.demo_requests add column if not exists email text;
alter table public.demo_requests add column if not exists organization text;
alter table public.demo_requests add column if not exists use_case text;
alter table public.demo_requests add column if not exists role text;
alter table public.demo_requests add column if not exists team_size text;
alter table public.demo_requests add column if not exists timeline text;
alter table public.demo_requests add column if not exists notes text;
alter table public.demo_requests add column if not exists status text not null default 'new';
alter table public.demo_requests add column if not exists source text not null default 'web';
alter table public.demo_requests add column if not exists handled_by uuid references public.users (id) on delete set null;
alter table public.demo_requests add column if not exists handled_at timestamptz;
alter table public.demo_requests add column if not exists created_at timestamptz not null default now();
alter table public.demo_requests add column if not exists updated_at timestamptz;
create index if not exists idx_demo_requests_email on public.demo_requests (email);
create index if not exists idx_demo_requests_status on public.demo_requests (status);
create index if not exists idx_demo_requests_created on public.demo_requests (created_at desc);

-- ---- RLS (admin-only; inserts are service-role, which bypasses RLS) ----------
alter table public.beta_applications enable row level security;
alter table public.demo_requests enable row level security;

drop policy if exists beta_applications_admin_all on public.beta_applications;
create policy beta_applications_admin_all on public.beta_applications
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists demo_requests_admin_all on public.demo_requests;
create policy demo_requests_admin_all on public.demo_requests
  for all using (public.is_admin()) with check (public.is_admin());
