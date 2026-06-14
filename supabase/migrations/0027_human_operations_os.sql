-- =============================================================================
-- Human Signal Index — 0027_human_operations_os.sql
-- WorldForge / HSI (Phase 24) — Human Operations & Case Management OS.
--
-- The OPERATIONAL layer for teams of researchers, reviewers, analysts,
-- investigators, curators, and admins: assignment, ownership, escalation, the
-- investigation lifecycle, workload, operational alerts, an operations audit
-- trail, and beta-tester issue tracking.
--
--   * teams                    — operational teams (research/review/curation/…).
--   * team_members             — team membership (role within the team).
--   * assignments              — current case assignments (owner/reviewer/…).
--   * assignment_history       — APPEND-ONLY assignment audit (who/what/when/why).
--   * workloads                — periodically-refreshed per-assignee rollups.
--   * escalations              — advisory escalation flags (notify/prioritize only).
--   * operations_alerts        — advisory operational alerts (never act).
--   * operations_audit_events  — APPEND-ONLY operational audit (who/what/when/why).
--   * tester_issues            — beta-tester issue tracking.
--   * tester_issue_history     — APPEND-ONLY tester-issue audit.
--
-- ACCESS MODEL (re-uses the 5-role ladder + helpers from 0002/0010): researcher+
-- READ; reviewer+ WRITE; admin all. The OPERATIONS WORKER uses the service_role
-- key (bypasses RLS). GOVERNANCE: escalations/alerts/workloads are ADVISORY — no
-- autonomous publication, approval, or governance action. Every state change is a
-- human action and is audit-logged.
--
-- This migration is ADD-ONLY. It does NOT edit migrations 0001-0026.
-- CONVENTIONS (match 0001-0026): snake_case; gen_random_uuid() PKs; created_at
-- default now(); CHECK-guarded enums; the shared set_updated_at() trigger on
-- mutable tables; APPEND-ONLY tables carry no trigger.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key in ('research','review','curation','governance','executive','security','publishing','simulation')),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.teams is 'HSIN Phase 24: operational teams.';

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references public.teams(id) on delete cascade,
  user_id    uuid references public.users(id) on delete cascade,
  team_role  text check (team_role in ('member','lead')) default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (team_id, user_id)
);
comment on table public.team_members is 'HSIN Phase 24: team membership.';

create table if not exists public.assignments (
  id           uuid primary key default gen_random_uuid(),
  case_id      text not null,
  case_kind    text default 'investigation',
  role         text check (role in ('owner','reviewer','approver','escalation_contact')) not null,
  assignee     uuid references public.users(id) on delete set null,
  assigner     uuid references public.users(id) on delete set null,
  reason       text,
  notes        text,
  assigned_at  timestamptz not null default now(),
  reassigned_at timestamptz,
  active       boolean default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.assignments is 'HSIN Phase 24: current case assignments (ownership chain). No hidden ownership changes.';

create table if not exists public.assignment_history (
  id         uuid primary key default gen_random_uuid(),
  case_id    text not null,
  role       text,
  action     text check (action in ('assigned','reassigned','unassigned')),
  from_user  uuid references public.users(id) on delete set null,
  to_user    uuid references public.users(id) on delete set null,
  actor      uuid references public.users(id) on delete set null,
  reason     text,
  at         timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.assignment_history is 'HSIN Phase 24: APPEND-ONLY assignment audit.';

create table if not exists public.workloads (
  id          uuid primary key default gen_random_uuid(),
  scope       text check (scope in ('assignee','team')) not null,
  scope_id    text not null,
  assigned    int default 0,
  open_count  int default 0,
  overdue     int default 0,
  escalated   int default 0,
  details     jsonb,
  computed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.workloads is 'HSIN Phase 24: periodically-refreshed workload rollups (advisory).';

create table if not exists public.escalations (
  id         uuid primary key default gen_random_uuid(),
  case_id    text not null,
  level      text check (level in ('LOW','MEDIUM','HIGH','CRITICAL')) not null,
  raised_by  uuid references public.users(id) on delete set null,
  reason     text,
  active     boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);
comment on table public.escalations is 'HSIN Phase 24: advisory escalation flags. Never publish/approve/reject — notify/prioritize only.';

create table if not exists public.operations_alerts (
  id         uuid primary key default gen_random_uuid(),
  kind       text check (kind in ('investigation_overdue','review_overdue','publication_stalled','escalation_pending','workload_imbalance','human_review_required')),
  severity   text check (severity in ('info','warning','critical')) default 'warning',
  title      text,
  detail     text,
  case_id    text,
  team       text,
  status     text check (status in ('open','acknowledged','resolved')) default 'open',
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);
comment on table public.operations_alerts is 'HSIN Phase 24: advisory operational alerts (never auto-act).';

create table if not exists public.operations_audit_events (
  id          uuid primary key default gen_random_uuid(),
  event_type  text check (event_type in ('assignment','reassignment','ownership_change','status_transition','escalation','approval_request','completion')),
  case_id     text,
  actor       uuid references public.users(id) on delete set null,
  summary     text,
  reason      text,
  metadata    jsonb,
  at          timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.operations_audit_events is 'HSIN Phase 24: APPEND-ONLY operational audit (who/what/when/why).';

create table if not exists public.tester_issues (
  id          uuid primary key default gen_random_uuid(),
  reference   text unique,
  tester      text,
  title       text,
  route       text,
  severity    text check (severity in ('critical','high','medium','low')) default 'medium',
  state       text check (state in ('SUBMITTED','TRIAGED','ASSIGNED','RESOLVED','VERIFIED','CLOSED')) default 'SUBMITTED',
  assignee    uuid references public.users(id) on delete set null,
  resolution  text,
  verified_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.tester_issues is 'HSIN Phase 24: beta-tester issue tracking. No automatic closure.';

create table if not exists public.tester_issue_history (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid references public.tester_issues(id) on delete cascade,
  from_state text,
  to_state   text,
  actor      uuid references public.users(id) on delete set null,
  reason     text,
  at         timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.tester_issue_history is 'HSIN Phase 24: APPEND-ONLY tester-issue audit.';

-- =============================================================================
-- B. INDEXES
-- =============================================================================
create index if not exists idx_team_members_team        on public.team_members(team_id);
create index if not exists idx_team_members_user        on public.team_members(user_id);
create index if not exists idx_assignments_case         on public.assignments(case_id);
create index if not exists idx_assignments_assignee     on public.assignments(assignee);
create index if not exists idx_assignments_active       on public.assignments(active);
create index if not exists idx_assignment_history_case  on public.assignment_history(case_id);
create index if not exists idx_workloads_scope          on public.workloads(scope, scope_id);
create index if not exists idx_escalations_case         on public.escalations(case_id);
create index if not exists idx_escalations_active       on public.escalations(active);
create index if not exists idx_ops_alerts_status        on public.operations_alerts(status);
create index if not exists idx_ops_alerts_severity      on public.operations_alerts(severity);
create index if not exists idx_ops_audit_case           on public.operations_audit_events(case_id);
create index if not exists idx_ops_audit_type           on public.operations_audit_events(event_type);
create index if not exists idx_tester_issues_state      on public.tester_issues(state);
create index if not exists idx_tester_issues_severity   on public.tester_issues(severity);
create index if not exists idx_tester_issue_history_iss on public.tester_issue_history(issue_id);

-- =============================================================================
-- C. UPDATED_AT TRIGGERS — on mutable tables. APPEND-ONLY tables
-- (assignment_history, operations_audit_events, tester_issue_history) carry none.
-- =============================================================================
do $$
declare
  t text;
  mutable text[] := array[
    'teams','team_members','assignments','workloads','escalations',
    'operations_alerts','tester_issues'];
begin
  foreach t in array mutable loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format('create trigger trg_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =============================================================================
-- D. ENABLE RLS + E. POLICIES (researcher+ READ; reviewer+ WRITE; admin all)
-- =============================================================================
do $$
declare
  t text;
  all_tables text[] := array[
    'teams','team_members','assignments','assignment_history','workloads',
    'escalations','operations_alerts','operations_audit_events',
    'tester_issues','tester_issue_history'];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_rev_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_rev_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_rev_del', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.is_reviewer_or_above())', t || '_rev_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above())', t || '_rev_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_reviewer_or_above())', t || '_rev_del', t);
  end loop;
end $$;

-- =============================================================================
-- F. SEED — the eight canonical teams (idempotent).
-- =============================================================================
insert into public.teams (key, name, description) values
  ('research',   'Research',   'Investigations, evidence collection, and research runs.'),
  ('review',     'Review',     'Human review of signals, evidence, and findings.'),
  ('curation',   'Curation',   'Curation and publication preparation.'),
  ('governance', 'Governance', 'Governance review and decision oversight.'),
  ('executive',  'Executive',  'Executive command and strategic oversight.'),
  ('security',   'Security',   'Security monitoring and incident response.'),
  ('publishing', 'Publishing', 'Publication lifecycle and distribution.'),
  ('simulation', 'Simulation', 'Simulation, counterfactual, and scenario work.')
on conflict (key) do nothing;

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS. The Phase-24 OPERATIONS WORKER uses
-- it to refresh workloads, recompute capacity forecasts, detect overdue work, and
-- generate operational alerts. It NEVER auto-assigns, auto-escalates, auto-approves,
-- or auto-publishes — every workflow action is a human action and is audit-logged.
-- =============================================================================

-- =============================================================================
-- End of 0027_human_operations_os.sql
-- =============================================================================
