-- =============================================================================
-- Human Signal Index — 0029_contributor_intelligence_network.sql
-- WorldForge / HSI (Phase 25) — Contributor Intelligence Network.
--
-- Turns HSI into a governed contributor network: purpose onboarding, role
-- APPLICATIONS (admin-approved; never self-granted), XP (activity), reputation
-- (quality), ranks (progression), badges (achievement), intel credits
-- (recognition), missions (purpose), the investigation WORKFLOW lifecycle, team
-- metrics, and quality-weighted leaderboards.
--
-- GOVERNANCE (hard constraints): this migration does NOT add a privileged role,
-- does NOT alter the role ladder (viewer<researcher<reviewer<curator<admin from
-- 0010), and does NOT grant access. role_applications.requested_role is CHECK-
-- constrained to exclude 'admin'. Approving an application assigns a role only via
-- the existing admin IAM path (public.user_roles); writing a row here grants
-- nothing. XP / credit / investigation_event tables are APPEND-ONLY.
--
-- ACCESS MODEL (re-uses helpers from 0002/0010):
--   * Personal ledgers/scores (xp, credits, reputation, ranks, badges, missions,
--     applications): owner reads own rows (auth.uid()); admin all; the
--     CONTRIBUTOR-NETWORK WORKER writes via service_role (bypasses RLS).
--   * Catalog (badges, mission_templates): any authenticated reads; admin writes.
--   * Investigations + workflow: researcher+ READ; reviewer+ WRITE; admin all
--     (matches 0027 operations tables).
--   * Leaderboards / team metrics: researcher+ READ; admin/service writes.
--
-- This migration is ADD-ONLY. It does NOT edit migrations 0001-0028. CONVENTIONS
-- (match 0001-0028): snake_case; gen_random_uuid() PKs; created_at default now();
-- CHECK-guarded enums; the shared set_updated_at() trigger on mutable tables;
-- APPEND-ONLY tables carry no updated_at + no trigger.
-- =============================================================================

-- =============================================================================
-- A. PERSONAL PROGRESSION TABLES
-- =============================================================================

-- A1. Role applications — the governed path from viewer to a trusted role.
create table if not exists public.role_applications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  requested_path     text not null check (requested_path in
                       ('observer','contributor','researcher_applicant','reviewer_applicant','organization_applicant')),
  requested_role     text check (requested_role in ('contributor','researcher','reviewer','curator')),
  experience_summary text,
  reason             text,
  organization       text,
  status             text not null default 'pending'
                       check (status in ('pending','approved','rejected','needs_more_info','withdrawn')),
  reviewed_by        uuid references public.users(id) on delete set null,
  reviewed_at        timestamptz,
  review_notes       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz default now()
);
comment on table public.role_applications is
  'HSI Phase 25: governed role-advancement requests. requested_role EXCLUDES admin. Approval assigns a role only via admin IAM (user_roles); a row here grants nothing.';
create index if not exists idx_role_applications_user on public.role_applications(user_id);
create index if not exists idx_role_applications_status on public.role_applications(status);

-- A2. XP ledger — APPEND-ONLY activity record (corrections append an adjustment).
create table if not exists public.user_xp_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  event      text not null check (event in
               ('signal_submitted','signal_accepted','source_submitted','source_verified',
                'evidence_package_created','investigation_created','investigation_completed',
                'review_completed','publication_prepared','governance_action_completed','adjustment')),
  amount     integer not null,
  note       text,
  ref_kind   text,
  ref_id     text,
  created_at timestamptz not null default now()
);
comment on table public.user_xp_ledger is 'HSI Phase 25: APPEND-ONLY XP ledger (activity). Never edit; corrections append event=adjustment.';
create index if not exists idx_user_xp_ledger_user on public.user_xp_ledger(user_id);

-- A3. Reputation scores — quality snapshot per user (refreshed by the worker).
create table if not exists public.user_reputation_scores (
  user_id                uuid primary key references public.users(id) on delete cascade,
  research_reputation    integer not null default 0 check (research_reputation between 0 and 100),
  review_reputation      integer not null default 0 check (review_reputation between 0 and 100),
  publication_reputation integer not null default 0 check (publication_reputation between 0 and 100),
  governance_reputation  integer not null default 0 check (governance_reputation between 0 and 100),
  trust_reputation       integer not null default 0 check (trust_reputation between 0 and 100),
  explanation            jsonb,
  computed_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz default now()
);
comment on table public.user_reputation_scores is 'HSI Phase 25: per-user quality reputation (0..100 per category). Separate from XP.';

-- A4. Ranks — current progression rank per user per track.
create table if not exists public.user_ranks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  track         text not null check (track in ('viewer','research','review','curation','governance')),
  rank_name     text not null,
  rank_level    integer not null default 1,
  granted_level integer not null default 1,
  approved_by   uuid references public.users(id) on delete set null,
  computed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz default now(),
  unique (user_id, track)
);
comment on table public.user_ranks is 'HSI Phase 25: current rank per track. granted_level gates admin-approval ranks; a rank is recognition, never a permission.';
create index if not exists idx_user_ranks_user on public.user_ranks(user_id);

-- A5. Badge catalog.
create table if not exists public.badges (
  id          text primary key,
  name        text not null,
  description text not null,
  metric      text not null,
  threshold   integer not null check (threshold > 0),
  created_at  timestamptz not null default now()
);
comment on table public.badges is 'HSI Phase 25: badge catalog (measurable thresholds).';

-- A6. Badge awards.
create table if not exists public.user_badges (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  badge_id        text not null references public.badges(id) on delete cascade,
  awarded_at      timestamptz not null default now(),
  earned_by_metric text,
  evidence        jsonb,
  created_at      timestamptz not null default now(),
  unique (user_id, badge_id)
);
comment on table public.user_badges is 'HSI Phase 25: awarded badges. Worker awards only what evaluateBadges() reports; awards are audited.';
create index if not exists idx_user_badges_user on public.user_badges(user_id);

-- A7. Intel credit ledger — APPEND-ONLY recognition (NOT money this phase).
create table if not exists public.intel_credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  event      text not null check (event in
               ('quality_submission','mission_completed','badge_earned','investigation_approved','special_operation','adjustment')),
  amount     integer not null,
  note       text,
  created_at timestamptz not null default now()
);
comment on table public.intel_credit_ledger is 'HSI Phase 25: APPEND-ONLY intel-credit ledger (internal recognition; not money).';
create index if not exists idx_intel_credit_ledger_user on public.intel_credit_ledger(user_id);

-- =============================================================================
-- B. MISSIONS
-- =============================================================================

-- B1. Mission templates (catalog; steps live in the engine, summarised here).
create table if not exists public.mission_templates (
  id            text primary key,
  role          text not null check (role in ('viewer','researcher','reviewer','curator','admin')),
  title         text not null,
  steps         jsonb,
  xp_reward     integer not null default 0,
  credit_reward integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz default now()
);
comment on table public.mission_templates is 'HSI Phase 25: weekly mission templates by role.';

-- B2. User mission instances.
create table if not exists public.user_missions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  template_id text not null references public.mission_templates(id) on delete cascade,
  progress    jsonb not null default '{}'::jsonb,
  status      text not null default 'not_started'
                check (status in ('not_started','in_progress','completed','expired','claimed')),
  period_start timestamptz,
  deadline    timestamptz,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.user_missions is 'HSI Phase 25: per-user mission progress. Reward granted only when completed AND claimed.';
create index if not exists idx_user_missions_user on public.user_missions(user_id);

-- =============================================================================
-- C. INVESTIGATION WORKFLOW
-- =============================================================================

-- C1. Investigations.
create table if not exists public.investigations (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  summary    text,
  status     text not null default 'intake'
               check (status in ('intake','research','evidence_collection','review','escalated','governance','publication_ready','published','archived')),
  priority   text not null default 'medium' check (priority in ('low','medium','high','critical')),
  owner_id   uuid references public.users(id) on delete set null,
  team_id    uuid references public.teams(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);
comment on table public.investigations is 'HSI Phase 25: investigation workflow entity (workflow state only; never publishes content or governance outcomes).';
create index if not exists idx_investigations_status on public.investigations(status);
create index if not exists idx_investigations_owner on public.investigations(owner_id);
create index if not exists idx_investigations_team on public.investigations(team_id);

-- C2. Investigation events — APPEND-ONLY timeline. Every state change records one.
create table if not exists public.investigation_events (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  actor_id         uuid references public.users(id) on delete set null,
  action           text not null,
  reason           text,
  metadata         jsonb,
  created_at       timestamptz not null default now()
);
comment on table public.investigation_events is 'HSI Phase 25: APPEND-ONLY investigation timeline. No silent state changes.';
create index if not exists idx_investigation_events_inv on public.investigation_events(investigation_id);

-- C3. Assignments (claim / release / assign / reassign / escalate).
create table if not exists public.investigation_assignments (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  assignee_id      uuid references public.users(id) on delete set null,
  assigner_id      uuid references public.users(id) on delete set null,
  action           text not null check (action in ('claimed','released','assigned','reassigned','escalated','submitted_for_review')),
  reason           text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz default now()
);
comment on table public.investigation_assignments is 'HSI Phase 25: investigation assignment actions (audited).';
create index if not exists idx_investigation_assignments_inv on public.investigation_assignments(investigation_id);

-- C4. Reviews (reviewer decisions; comment required at the app layer).
create table if not exists public.investigation_reviews (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  reviewer_id      uuid references public.users(id) on delete set null,
  decision         text not null check (decision in ('approve','return_for_research','escalate','request_more_evidence')),
  comment          text not null,
  created_at       timestamptz not null default now()
);
comment on table public.investigation_reviews is 'HSI Phase 25: reviewer decisions. comment is NOT NULL — no silent approval.';
create index if not exists idx_investigation_reviews_inv on public.investigation_reviews(investigation_id);

-- C5. Governance decisions.
create table if not exists public.investigation_governance_decisions (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  decided_by       uuid references public.users(id) on delete set null,
  decision         text not null check (decision in ('cleared','hold','block','return_for_review')),
  rationale        text not null,
  created_at       timestamptz not null default now()
);
comment on table public.investigation_governance_decisions is 'HSI Phase 25: governance decisions on escalated/sensitive investigations (recorded with rationale).';
create index if not exists idx_inv_gov_decisions_inv on public.investigation_governance_decisions(investigation_id);

-- C6. Publication readiness checklist (read-only in Phase 25).
create table if not exists public.investigation_publication_readiness (
  investigation_id        uuid primary key references public.investigations(id) on delete cascade,
  evidence_complete       boolean not null default false,
  reviewer_complete       boolean not null default false,
  governance_complete     boolean not null default false,
  risk_assessed           boolean not null default false,
  traceability_sufficient boolean not null default false,
  source_quality_sufficient boolean not null default false,
  computed_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz default now()
);
comment on table public.investigation_publication_readiness is 'HSI Phase 25: read-only publication-readiness checklist. Publishing stays governed by existing publication workflows.';

-- =============================================================================
-- D. TEAMS & LEADERBOARDS
-- =============================================================================

-- D1. Team contribution metrics (refreshed by the worker).
create table if not exists public.team_contribution_metrics (
  id                       uuid primary key default gen_random_uuid(),
  team_id                  uuid not null references public.teams(id) on delete cascade,
  team_xp                  integer not null default 0,
  accepted_signals         integer not null default 0,
  evidence_packages        integer not null default 0,
  reviews_completed        integer not null default 0,
  investigations_completed integer not null default 0,
  reports_prepared         integer not null default 0,
  escalations_resolved     integer not null default 0,
  computed_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz default now(),
  unique (team_id)
);
comment on table public.team_contribution_metrics is 'HSI Phase 25: per-team contribution rollups (advisory).';

-- D2. Leaderboard snapshots (quality-weighted; computed by the worker).
create table if not exists public.leaderboard_snapshots (
  id          uuid primary key default gen_random_uuid(),
  view        text not null check (view in ('top_contributors','top_researchers','top_reviewers','top_curators','top_teams')),
  rows        jsonb not null default '[]'::jsonb,
  computed_at timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.leaderboard_snapshots is 'HSI Phase 25: APPEND-ONLY quality-weighted leaderboard snapshots (accepted contributions, never raw submissions).';
create index if not exists idx_leaderboard_snapshots_view on public.leaderboard_snapshots(view, computed_at desc);

-- =============================================================================
-- E. updated_at TRIGGERS (mutable tables only; append-only tables excluded).
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'role_applications','user_reputation_scores','user_ranks','mission_templates',
    'user_missions','investigations','investigation_assignments',
    'investigation_publication_readiness','team_contribution_metrics'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- F. ENABLE RLS + POLICIES
-- =============================================================================

-- F1. Personal tables: owner reads own rows; admin all. Writes are admin/service
--     (the worker uses service_role, which bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array[
    'user_xp_ledger','user_reputation_scores','user_ranks','user_badges',
    'intel_credit_ledger','user_missions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_self_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_self_read', t);
  end loop;
end$$;

-- F2. role_applications: owner reads own + inserts own + withdraws own (pending →
--     withdrawn only); admin all (approve/reject/needs_more_info). A user can
--     NEVER set their own status to approved/rejected.
alter table public.role_applications enable row level security;
drop policy if exists role_applications_admin_all on public.role_applications;
drop policy if exists role_applications_self_read on public.role_applications;
drop policy if exists role_applications_self_insert on public.role_applications;
drop policy if exists role_applications_self_withdraw on public.role_applications;
create policy role_applications_admin_all on public.role_applications
  for all using (public.is_admin()) with check (public.is_admin());
create policy role_applications_self_read on public.role_applications
  for select using (user_id = auth.uid());
create policy role_applications_self_insert on public.role_applications
  for insert with check (user_id = auth.uid() and status = 'pending');
create policy role_applications_self_withdraw on public.role_applications
  for update using (user_id = auth.uid() and status in ('pending','needs_more_info'))
  with check (user_id = auth.uid() and status in ('pending','needs_more_info','withdrawn'));

-- F3. Catalog tables: any authenticated reads; admin writes.
do $$
declare t text;
begin
  foreach t in array array['badges','mission_templates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (auth.uid() is not null)', t || '_read', t);
  end loop;
end$$;

-- F4a. Investigation WORK tables: researcher+ READ + WRITE; admin all. These are
--      the surfaces researchers act on (claim/release/submit + timeline). This
--      ADDS a new capability for researchers; it does not change any existing
--      table's access.
do $$
declare t text;
begin
  foreach t in array array['investigations','investigation_events','investigation_assignments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_res_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_res_upd', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.is_researcher_or_above())', t || '_res_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above())', t || '_res_upd', t);
  end loop;
end$$;

-- F4b. Investigation DECISION tables: researcher+ READ; reviewer+ WRITE; admin all.
--      Reviews + governance decisions are reviewer/curator authority; readiness is
--      worker-computed (service role) and read by researcher+.
do $$
declare t text;
begin
  foreach t in array array['investigation_reviews','investigation_governance_decisions','investigation_publication_readiness']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_rev_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_rev_upd', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.is_reviewer_or_above())', t || '_rev_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above())', t || '_rev_upd', t);
  end loop;
end$$;

-- F5. Leaderboards / team metrics: researcher+ READ; admin/service writes.
do $$
declare t text;
begin
  foreach t in array array['team_contribution_metrics','leaderboard_snapshots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
  end loop;
end$$;

-- =============================================================================
-- G. SEED — badge catalog + mission templates (idempotent; matches the engine).
-- =============================================================================
insert into public.badges (id, name, description, metric, threshold) values
  ('signal_hunter','Signal Hunter','25 accepted signals','accepted_signals',25),
  ('signal_veteran','Signal Veteran','100 accepted signals','accepted_signals',100),
  ('source_scout','Source Scout','50 approved sources','approved_sources',50),
  ('evidence_builder','Evidence Builder','25 evidence packages','evidence_packages',25),
  ('pattern_detector','Pattern Detector','100 linked signals','linked_signals',100),
  ('fact_checker','Fact Checker','250 completed reviews','completed_reviews',250),
  ('traceability_master','Traceability Master','95% traceability for 90 days','traceability_days',90),
  ('early_warning_operator','Early Warning Operator','5 confirmed early detections','confirmed_early_detections',5),
  ('publication_builder','Publication Builder','10 approved reports prepared','approved_reports',10),
  ('governance_steward','Governance Steward','50 governance actions completed','governance_actions',50)
on conflict (id) do nothing;

insert into public.mission_templates (id, role, title, xp_reward, credit_reward) values
  ('viewer_explore','viewer','Get oriented',30,5),
  ('contributor_build','viewer','Build your credibility',60,10),
  ('researcher_verify','researcher','Verify and investigate',120,20),
  ('reviewer_validate','reviewer','Validate the queue',140,24),
  ('curator_publish','curator','Prepare publications',160,28),
  ('admin_govern','admin','Steward the network',100,0)
on conflict (id) do nothing;

-- =============================================================================
-- NOTE
-- The service_role key bypasses RLS; the Phase-25 CONTRIBUTOR-NETWORK WORKER uses
-- it to recompute XP/reputation/ranks/badges/leaderboards/team metrics. NO
-- autonomous role promotion: the worker never writes public.user_roles. Role
-- advancement remains an admin action via the existing IAM path; this schema only
-- records the REQUEST (role_applications) and recognition (xp/ranks/badges).
-- =============================================================================

-- =============================================================================
-- End of 0029_contributor_intelligence_network.sql
-- =============================================================================
