-- =============================================================================
-- Human Signal Index — 0036_operational_beta_workflows.sql
-- WorldForge / HSI (Phase 32) — Operational Beta & Tester Workflows.
--
-- A complete tester onboarding / tasking / feedback / issue-reporting / beta-ops
-- system that runs WITHOUT admin intervention for the tester's own journey:
--   * beta_cohorts        — the 5 cohorts (seeded).
--   * beta_testers        — a user's tester record (status lifecycle).
--   * tester_activity     — APPEND-ONLY activity log.
--   * beta_issues         — tester-reported issues (category + severity).
--   * tester_feedback     — feedback + NPS (APPEND-ONLY).
--   * tester_certificates — completion certificates.
--   * tester_badges       — beta recognition badges.
--
-- GOVERNANCE (hard constraints): testers self-serve (join cohort, onboard,
-- receive missions, report issues, give feedback, earn recognition) via SELF RLS
-- policies — NO admin intervention. But privileged ROLE advancement still goes
-- through admin-approved role_applications (Phase 25): nothing here grants a role
-- or edits user_roles, auth, middleware, or RBAC. All additive.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0035. (Complements the Phase-23
-- tester_issues launch board; this is the tester PROGRAM.) CONVENTIONS match
-- 0001-0035.
-- =============================================================================

-- =============================================================================
-- A. COHORTS (Deliverable 2) — seeded.
-- =============================================================================
create table if not exists public.beta_cohorts (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key in ('internal','research','reviewer','governance','enterprise_pilot')),
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.beta_cohorts is 'HSI Phase 32: beta tester cohorts.';

insert into public.beta_cohorts (key, name, description) values
  ('internal','Internal','HSI team + trusted insiders.'),
  ('research','Research','Signal + investigation contributors.'),
  ('reviewer','Reviewer','Evidence + investigation reviewers.'),
  ('governance','Governance','Governance + publication oversight.'),
  ('enterprise_pilot','Enterprise Pilot','Partner organisations evaluating HSI.')
on conflict (key) do nothing;

-- =============================================================================
-- B. TESTERS (Deliverables 1, 3) — one record per user.
-- =============================================================================
create table if not exists public.beta_testers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade unique,
  cohort_id    uuid references public.beta_cohorts(id) on delete set null,
  status       text not null default 'pending' check (status in ('pending','invited','active','suspended','completed')),
  invited_by   uuid references public.users(id) on delete set null,
  joined_at    timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.beta_testers is 'HSI Phase 32: tester program records (status lifecycle). Self-service join/accept; admin oversight.';
create index if not exists idx_beta_testers_cohort on public.beta_testers(cohort_id);
create index if not exists idx_beta_testers_status on public.beta_testers(status);

-- =============================================================================
-- C. ACTIVITY (Deliverable 1) — APPEND-ONLY.
-- =============================================================================
create table if not exists public.tester_activity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  action     text not null,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
comment on table public.tester_activity is 'HSI Phase 32: APPEND-ONLY tester activity log (onboarding/mission/issue/feedback events).';
create index if not exists idx_tester_activity_user on public.tester_activity(user_id, created_at desc);

-- =============================================================================
-- D. ISSUES (Deliverables 11–14).
-- =============================================================================
create table if not exists public.beta_issues (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.users(id) on delete set null,
  category    text not null check (category in ('ui','workflow','performance','permissions','data','security')),
  severity    text not null default 'medium' check (severity in ('low','medium','high','critical')),
  title       text not null,
  description text,
  route       text,
  status      text not null default 'open' check (status in ('open','triaged','in_progress','resolved','closed')),
  resolved_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.beta_issues is 'HSI Phase 32: tester-reported issues (category + severity). Self-report; admin review queue.';
create index if not exists idx_beta_issues_status on public.beta_issues(status, severity);
create index if not exists idx_beta_issues_reporter on public.beta_issues(reporter_id);

-- =============================================================================
-- E. FEEDBACK + NPS (Deliverables 15, 16) — APPEND-ONLY.
-- =============================================================================
create table if not exists public.tester_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete set null,
  category   text,
  message    text,
  nps_score  integer check (nps_score is null or (nps_score between 0 and 10)),
  created_at timestamptz not null default now()
);
comment on table public.tester_feedback is 'HSI Phase 32: APPEND-ONLY tester feedback + NPS (0-10).';

-- =============================================================================
-- F. CERTIFICATES + RECOGNITION BADGES (Deliverables 18, 19).
-- =============================================================================
create table if not exists public.tester_certificates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  cohort_id  uuid references public.beta_cohorts(id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (user_id)
);
comment on table public.tester_certificates is 'HSI Phase 32: beta completion certificates.';

create table if not exists public.tester_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  badge_key  text not null check (badge_key in ('found_bug','power_tester','elite_researcher','review_specialist','governance_advisor')),
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_key)
);
comment on table public.tester_badges is 'HSI Phase 32: beta recognition badges (cosmetic; never access).';

-- =============================================================================
-- G. updated_at triggers (mutable tables only).
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['beta_cohorts','beta_testers','beta_issues']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- H. RLS — SELF-SERVICE (owner read/insert/update own) + admin all. Cohorts are
--    world-readable. No admin intervention is needed for the tester's own journey.
-- =============================================================================
alter table public.beta_cohorts enable row level security;
drop policy if exists beta_cohorts_admin_all on public.beta_cohorts;
drop policy if exists beta_cohorts_read on public.beta_cohorts;
create policy beta_cohorts_admin_all on public.beta_cohorts for all using (public.is_admin()) with check (public.is_admin());
create policy beta_cohorts_read on public.beta_cohorts for select using (true);

-- beta_testers: self read/insert/update own row; admin all.
alter table public.beta_testers enable row level security;
drop policy if exists beta_testers_admin_all on public.beta_testers;
drop policy if exists beta_testers_self_read on public.beta_testers;
drop policy if exists beta_testers_self_insert on public.beta_testers;
drop policy if exists beta_testers_self_update on public.beta_testers;
create policy beta_testers_admin_all on public.beta_testers for all using (public.is_admin()) with check (public.is_admin());
create policy beta_testers_self_read on public.beta_testers for select using (user_id = auth.uid());
create policy beta_testers_self_insert on public.beta_testers for insert with check (user_id = auth.uid());
create policy beta_testers_self_update on public.beta_testers for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Self read + insert tables (activity / issues / feedback / certificates / badges).
do $$
declare t text;
begin
  foreach t in array array['tester_activity','tester_feedback','tester_certificates','tester_badges']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_self_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_self_insert', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_self_read', t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', t || '_self_insert', t);
  end loop;
end$$;

-- beta_issues: reporter self read/insert; admin all (review queue + status updates).
alter table public.beta_issues enable row level security;
drop policy if exists beta_issues_admin_all on public.beta_issues;
drop policy if exists beta_issues_self_read on public.beta_issues;
drop policy if exists beta_issues_self_insert on public.beta_issues;
create policy beta_issues_admin_all on public.beta_issues for all using (public.is_admin()) with check (public.is_admin());
create policy beta_issues_self_read on public.beta_issues for select using (reporter_id = auth.uid());
create policy beta_issues_self_insert on public.beta_issues for insert with check (reporter_id = auth.uid());

-- =============================================================================
-- NOTE
-- Testers self-serve their entire journey via the SELF policies above; the DAL
-- enforces status transitions + badge/certificate eligibility (engine-validated)
-- before any self-insert. Issue REVIEW + cohort analytics are admin-only. Role
-- advancement remains admin-approved (role_applications). No user_roles / auth /
-- middleware / RBAC changes.
-- =============================================================================

-- =============================================================================
-- End of 0036_operational_beta_workflows.sql
-- =============================================================================
