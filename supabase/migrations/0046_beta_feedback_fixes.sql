-- =============================================================================
-- Human Signal Index — 0046_beta_feedback_fixes.sql
-- Phase 41B — Beta tester feedback bugfix sprint.
--
--   1. Allow 'archived' as an hsin_sources.status (soft-delete / archive). Keeps
--      existing signals/snapshots/events intact; archived sources hide from the
--      active list.
--   2. Add public.signal_submissions — viewer/public signal submissions that land
--      in an admin/reviewer review queue (separate from the researcher+ manual
--      signal path so a signed-in VIEWER can submit without an RBAC change).
--
-- HARD SCOPE: NO changes to RBAC / IAM / middleware / billing / Stripe / source
-- ingestion cron / user_roles. Reuses existing role helpers is_admin() /
-- is_reviewer_or_above() (from 0002/0010/0011). ADD-ONLY (0001-0045).
-- =============================================================================

-- =============================================================================
-- A. hsin_sources: allow 'archived' status (soft delete / archive).
-- =============================================================================
alter table public.hsin_sources drop constraint if exists hsin_sources_status_check;
alter table public.hsin_sources
  add constraint hsin_sources_status_check
  check (status in ('active','paused','disabled','error','archived'));

-- =============================================================================
-- B. signal_submissions — public/viewer submission intake → review queue.
-- =============================================================================
create table if not exists public.signal_submissions (
  id              uuid primary key default gen_random_uuid(),
  source_url      text,
  observation     text not null,
  platform        text,
  category        text,
  notes           text,
  evidence_url    text,
  evidence_path   text,                                    -- storage path if uploaded
  status          text not null default 'pending'
                    check (status in ('pending','reviewing','accepted','rejected')),
  submitter_id    uuid references public.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  reviewed_by     uuid references public.users(id) on delete set null,
  reviewed_at     timestamptz,
  signal_id       uuid references public.hsin_signals(id) on delete set null,  -- if promoted
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.signal_submissions is
  'HSI Phase 41B: public/viewer signal submissions; reviewed by reviewer+/admin. Submitter identity optional/protected.';
create index if not exists idx_signal_submissions_status on public.signal_submissions(status, created_at desc);
create index if not exists idx_signal_submissions_submitter on public.signal_submissions(submitter_id);
create index if not exists idx_signal_submissions_org on public.signal_submissions(organization_id);

-- RLS: any signed-in user may submit their OWN; reviewer+/admin read + triage;
-- submitters may read their own. No anonymous insert (avoids unauthenticated spam).
alter table public.signal_submissions enable row level security;

drop policy if exists signal_submissions_insert_own on public.signal_submissions;
create policy signal_submissions_insert_own on public.signal_submissions
  for insert with check (auth.uid() is not null and submitter_id = auth.uid());

drop policy if exists signal_submissions_read on public.signal_submissions;
create policy signal_submissions_read on public.signal_submissions
  for select using (public.is_admin() or public.is_reviewer_or_above() or submitter_id = auth.uid());

drop policy if exists signal_submissions_review on public.signal_submissions;
create policy signal_submissions_review on public.signal_submissions
  for update using (public.is_admin() or public.is_reviewer_or_above())
  with check (public.is_admin() or public.is_reviewer_or_above());

-- =============================================================================
-- End of 0046_beta_feedback_fixes.sql
-- =============================================================================
