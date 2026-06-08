-- =============================================================================
-- Human Signal Index — 0010_review_and_curation.sql
-- WorldForge (Phase 6) — Human Review & Curation persistence schema.
--
-- Phase 6 layers a human-in-the-loop review + curation workflow on top of the
-- WorldForge research/evidence pipeline (Phases 1-5). Researchers submit entities
-- (research runs, consensus/evidence summaries, reports, evidence sources) into a
-- review QUEUE; reviewers triage/assign and record DECISIONS; curators PUBLISH
-- approved entities with versioned snapshots and a visibility tier; everyone can
-- COMMENT (threaded, with @mentions) and receive NOTIFICATIONS; reviewer TRUST is
-- tracked so the system can weight verdicts over time.
--
-- This migration is ADD-ONLY w.r.t. existing schema. It:
--   * inserts the two NEW roles (researcher, curator) idempotently — admin/
--     reviewer/viewer were already seeded by 0001/seed;
--   * REPLACES public.has_role(text) with a 5-level hierarchy that is fully
--     backwards-compatible with the existing 3-level semantics (admin/reviewer/
--     viewer keep their old behaviour; the new researcher tier sits between
--     reviewer and viewer in the ladder);
--   * ADDs new role-predicate helpers (is_curator_or_admin, is_reviewer_or_above,
--     is_researcher_or_above) — it does NOT drop is_admin / is_reviewer_or_admin,
--     which 0005/0007/0008/0009 still depend on;
--   * creates 8 new tables (+ their indexes, updated_at triggers, RLS, policies);
--   * ADDs two additive columns to research_runs.
-- It does NOT edit migrations 0001-0009, drop existing policies/roles/helpers, or
-- touch existing RLS.
--
-- CONVENTIONS (match 0001-0009):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz default now().
--   - created_by / owner: `uuid references public.users(id) on delete set null`
--     (public.users.id == auth.uid(), per 0006_auth_users_trigger).
--   - mutable tables get an updated_at column + the shared public.set_updated_at()
--     BEFORE UPDATE trigger from 0003 (drop-then-create for idempotency).
--   - enum-style text columns guarded by CHECK constraints (cheaper to evolve than
--     Postgres enums); numeric ranges guarded by CHECK.
--   - RLS via SECURITY DEFINER role helpers (existing + new, defined below).
--
-- AUDIT TRAIL
--   Governance actions (submit/assign/decide/publish/escalate) are logged into the
--   EXISTING public.audit_logs table from 0001 — this migration deliberately does
--   NOT create a new audit table. The DAL writes an audit_logs row per action.
--
-- ROLE MODEL (5 roles; ascending privilege):
--   viewer < researcher < reviewer < curator < admin
--   viewer     -> read-only published/public content.
--   researcher -> can create research runs + submit items for review.
--   reviewer   -> can triage/read the full queue, assign, and record decisions.
--   curator    -> can publish + manage curation (publication records/versions).
--   admin      -> full access to everything.
-- =============================================================================

-- =============================================================================
-- 0. ROLES — insert the two NEW roles idempotently.
--    admin / reviewer / viewer are already seeded by 0001/seed; do not re-insert.
-- =============================================================================
insert into public.roles (name, description) values
  ('researcher', 'Can create research runs and submit items for review'),
  ('curator',    'Can publish and manage curation')
on conflict (name) do nothing;

-- =============================================================================
-- 1. ROLE HELPERS
--    REPLACE has_role with a 5-level hierarchy and ADD curator-aware predicates.
--    is_admin() / is_reviewer_or_admin() are intentionally NOT touched (0005/
--    0007/0008/0009 depend on them).
-- =============================================================================

-- public.has_role(target) — 5-level hierarchy, backwards-compatible.
--   Ladder (ascending): viewer < researcher < reviewer < curator < admin.
--   A caller satisfies `target` when their resolved role is >= target in the ladder:
--     admin      satisfies admin/curator/reviewer/researcher/viewer
--     curator    satisfies        curator/reviewer/researcher/viewer
--     reviewer   satisfies                reviewer/researcher/viewer
--     researcher satisfies                         researcher/viewer
--     viewer     satisfies                                    viewer
--   This preserves the original 3-level semantics exactly: admin still satisfies
--   reviewer+viewer; reviewer still satisfies viewer; viewer still satisfies viewer.
--   Same signature (text -> boolean) so existing policies using has_role keep working.
create or replace function public.has_role(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with rank(name, lvl) as (
    values
      ('viewer',     1),
      ('researcher', 2),
      ('reviewer',   3),
      ('curator',    4),
      ('admin',      5)
  )
  select coalesce(
    (select cur.lvl from rank cur where cur.name = public.current_app_role())
      >=
    (select tgt.lvl from rank tgt where tgt.name = target),
    false
  );
$$;

comment on function public.has_role(text) is
  'True if the caller holds the given HSI role or a higher-privilege one (5-level ladder: viewer<researcher<reviewer<curator<admin). Backwards-compatible with the original 3-level semantics.';

-- Convenience predicates (mirror the existing is_admin / is_reviewer_or_admin
-- style: SECURITY DEFINER, stable, search_path pinned).

-- True when the caller is a curator or admin (curation/publish authority).
create or replace function public.is_curator_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('admin', 'curator');
$$;
comment on function public.is_curator_or_admin() is
  'True when the caller is a curator or admin (publish/curation authority).';

-- True when the caller is a reviewer or above (reviewer/curator/admin).
create or replace function public.is_reviewer_or_above()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('admin', 'curator', 'reviewer');
$$;
comment on function public.is_reviewer_or_above() is
  'True when the caller is a reviewer or above (reviewer/curator/admin).';

-- True when the caller is a researcher or above (researcher/reviewer/curator/admin).
create or replace function public.is_researcher_or_above()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('admin', 'curator', 'reviewer', 'researcher');
$$;
comment on function public.is_researcher_or_above() is
  'True when the caller is a researcher or above (researcher/reviewer/curator/admin).';

-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- ---------- review_queues -----------------------------------------------------
-- One queue entry per entity submitted for human review. entity_type/entity_id is
-- a soft reference into the platform (research_run, consensus_report, evidence
-- summary, worldforge report, evidence source, publication). status drives the
-- workflow; priority orders the reviewer worklist; assigned_to is the reviewer.
create table if not exists public.review_queues (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid not null,
  status      text not null default 'draft'
                check (status in ('draft','under_review','approved','published','rejected','needs_evidence','escalated')),
  priority    text not null default 'medium'
                check (priority in ('low','medium','high','urgent')),
  assigned_to uuid references public.users(id) on delete set null,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.review_queues is
  'WorldForge Phase 6: review queue entries (entity submitted for human review) with status/priority/assignment.';

-- ---------- review_assignments ------------------------------------------------
-- Assignment history for a queue entry: which reviewer was assigned and when, and
-- when they completed it. Multiple rows allow re-assignment over time.
create table if not exists public.review_assignments (
  id              uuid primary key default gen_random_uuid(),
  review_queue_id uuid not null references public.review_queues(id) on delete cascade,
  reviewer_id     uuid references public.users(id) on delete set null,
  assigned_at     timestamptz not null default now(),
  completed_at    timestamptz
);
comment on table public.review_assignments is
  'WorldForge Phase 6: assignment history for a review queue entry (reviewer + assigned/completed timestamps).';

-- ---------- review_decisions --------------------------------------------------
-- An immutable verdict a reviewer records against a queue entry. APPROVE/REJECT/
-- NEEDS_EVIDENCE/ESCALATE. notes captures the rationale.
create table if not exists public.review_decisions (
  id              uuid primary key default gen_random_uuid(),
  review_queue_id uuid not null references public.review_queues(id) on delete cascade,
  reviewer_id     uuid references public.users(id) on delete set null,
  decision        text not null
                    check (decision in ('APPROVE','REJECT','NEEDS_EVIDENCE','ESCALATE')),
  notes           text,
  created_at      timestamptz not null default now()
);
comment on table public.review_decisions is
  'WorldForge Phase 6: immutable reviewer verdicts (APPROVE/REJECT/NEEDS_EVIDENCE/ESCALATE) on a queue entry.';

-- ---------- publication_records -----------------------------------------------
-- A published entity. visibility gates who can read it (PRIVATE/TEAM/PUBLIC).
-- latest_version tracks the highest snapshot number in publication_versions.
create table if not exists public.publication_records (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null,
  entity_id      uuid not null,
  published_by   uuid references public.users(id) on delete set null,
  published_at   timestamptz not null default now(),
  visibility     text not null default 'PRIVATE'
                   check (visibility in ('PRIVATE','TEAM','PUBLIC')),
  status         text default 'published',
  latest_version int default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.publication_records is
  'WorldForge Phase 6: published entities with a visibility tier (PRIVATE/TEAM/PUBLIC) + latest version pointer.';

-- ---------- publication_versions ----------------------------------------------
-- Immutable snapshot of a publication at a given version number. snapshot_json
-- holds the frozen public-facing payload. Unique per (record, version).
create table if not exists public.publication_versions (
  id                    uuid primary key default gen_random_uuid(),
  publication_record_id uuid not null references public.publication_records(id) on delete cascade,
  version_number        int not null,
  snapshot_json         jsonb not null,
  created_by            uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (publication_record_id, version_number)
);
comment on table public.publication_versions is
  'WorldForge Phase 6: immutable publication snapshots; unique per (publication_record_id, version_number).';

-- ---------- review_comments ---------------------------------------------------
-- Threaded collaboration comments on any entity. parent_id threads replies;
-- mentions is an array of mentioned user ids (drives comment_mention notifications).
create table if not exists public.review_comments (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid not null,
  user_id     uuid references public.users(id) on delete set null,
  comment     text not null,
  parent_id   uuid references public.review_comments(id) on delete cascade,
  mentions    uuid[] default '{}',
  created_at  timestamptz not null default now()
);
comment on table public.review_comments is
  'WorldForge Phase 6: threaded review comments (parent_id) with @mentions on any entity.';

-- ---------- reviewer_trust ----------------------------------------------------
-- Per-reviewer trust aggregate. trust_score in [0,1] (default 0.5). Maintained by
-- a curator/admin (or a SECURITY DEFINER / service path); approved/reversed/review
-- counts feed the score.
create table if not exists public.reviewer_trust (
  id             uuid primary key default gen_random_uuid(),
  reviewer_id    uuid not null unique references public.users(id) on delete cascade,
  approved_count int default 0,
  reversed_count int default 0,
  review_count   int default 0,
  trust_score    numeric default 0.5 check (trust_score >= 0 and trust_score <= 1),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
comment on table public.reviewer_trust is
  'WorldForge Phase 6: per-reviewer trust aggregate (counts + trust_score in [0,1]).';

-- ---------- notifications -----------------------------------------------------
-- Per-user notifications. Owned by user_id; entity_type/entity_id soft-links the
-- subject. read flips when the user reads it. Server creates them.
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  read        boolean default false,
  created_at  timestamptz not null default now()
);
comment on table public.notifications is
  'WorldForge Phase 6: per-user notifications (owned by user_id; server-created).';

-- ---------- research_runs: governance columns (ADD-ONLY) ----------------------
-- Surface the governed confidence + review status on the run so the curation
-- dashboard can render without a join. Additive; existing research_runs RLS
-- (from 0007) is untouched.
alter table public.research_runs
  add column if not exists governed_confidence numeric;
alter table public.research_runs
  add column if not exists review_status text;
comment on column public.research_runs.governed_confidence is
  'WorldForge Phase 6: confidence after human review/governance (0..100).';
comment on column public.research_runs.review_status is
  'WorldForge Phase 6: latest review queue status for the run (mirrors review_queues.status).';

-- =============================================================================
-- 3. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_review_queues_entity      on public.review_queues(entity_type, entity_id);
create index if not exists idx_review_queues_status       on public.review_queues(status);
create index if not exists idx_review_queues_priority     on public.review_queues(priority);
create index if not exists idx_review_queues_assigned_to  on public.review_queues(assigned_to);

create index if not exists idx_review_assignments_queue   on public.review_assignments(review_queue_id);
create index if not exists idx_review_assignments_reviewer on public.review_assignments(reviewer_id);

create index if not exists idx_review_decisions_queue     on public.review_decisions(review_queue_id);
create index if not exists idx_review_decisions_reviewer  on public.review_decisions(reviewer_id);

create index if not exists idx_publication_records_entity     on public.publication_records(entity_type, entity_id);
create index if not exists idx_publication_records_visibility on public.publication_records(visibility);

create index if not exists idx_publication_versions_record on public.publication_versions(publication_record_id);

create index if not exists idx_review_comments_entity on public.review_comments(entity_type, entity_id);
create index if not exists idx_review_comments_parent on public.review_comments(parent_id);

create index if not exists idx_notifications_user_read on public.notifications(user_id, read);
create index if not exists idx_notifications_created   on public.notifications(created_at);

-- =============================================================================
-- 4. updated_at TRIGGERS (only tables that carry updated_at)
--    Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
do $$
declare
  t text;
  p6_mutable_tables text[] := array['review_queues','publication_records','reviewer_trust'];
begin
  foreach t in array p6_mutable_tables loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;

-- =============================================================================
-- 5. ENABLE RLS on all 8 new tables
-- =============================================================================
alter table public.review_queues        enable row level security;
alter table public.review_assignments   enable row level security;
alter table public.review_decisions     enable row level security;
alter table public.publication_records  enable row level security;
alter table public.publication_versions enable row level security;
alter table public.review_comments      enable row level security;
alter table public.reviewer_trust        enable row level security;
alter table public.notifications         enable row level security;

-- =============================================================================
-- 6. POLICIES
-- Convention (matches 0002/0005/0007/0008/0009): permissive policies are
-- OR-combined — a row is visible/writable if ANY policy allows it. We follow the
-- 5-role ladder via is_researcher_or_above / is_reviewer_or_above /
-- is_curator_or_admin / is_admin, plus created_by/assigned_to/user_id = auth.uid().
-- =============================================================================

-- ---------- review_queues -----------------------------------------------------
-- researcher+ may submit (INSERT) entries they create (created_by = auth.uid()).
-- reviewer+ may READ all + UPDATE (status/assignment). admin: full. The creator
-- may READ their own; the assigned reviewer may READ/UPDATE their assigned rows.
drop policy if exists review_queues_admin_all       on public.review_queues;
drop policy if exists review_queues_researcher_ins  on public.review_queues;
drop policy if exists review_queues_reviewer_read   on public.review_queues;
drop policy if exists review_queues_reviewer_upd    on public.review_queues;
drop policy if exists review_queues_creator_read    on public.review_queues;
drop policy if exists review_queues_assignee_read   on public.review_queues;
drop policy if exists review_queues_assignee_upd    on public.review_queues;

create policy review_queues_admin_all on public.review_queues
  for all using (public.is_admin()) with check (public.is_admin());
-- researcher+ submit for review (must own the row they create).
create policy review_queues_researcher_ins on public.review_queues
  for insert with check (public.is_researcher_or_above() and created_by = auth.uid());
-- reviewer+ read the whole queue and update status/assignment.
create policy review_queues_reviewer_read on public.review_queues
  for select using (public.is_reviewer_or_above());
create policy review_queues_reviewer_upd on public.review_queues
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
-- the creator may read their own submission.
create policy review_queues_creator_read on public.review_queues
  for select using (created_by = auth.uid());
-- the assigned reviewer may read + update their assigned rows.
create policy review_queues_assignee_read on public.review_queues
  for select using (assigned_to = auth.uid());
create policy review_queues_assignee_upd on public.review_queues
  for update using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

-- ---------- review_assignments ------------------------------------------------
-- reviewer+ read. curator/admin assign (insert/update). The assigned reviewer may
-- update their own row (e.g. set completed_at). admin: full.
drop policy if exists review_assignments_admin_all      on public.review_assignments;
drop policy if exists review_assignments_reviewer_read  on public.review_assignments;
drop policy if exists review_assignments_curator_ins    on public.review_assignments;
drop policy if exists review_assignments_curator_upd    on public.review_assignments;
drop policy if exists review_assignments_self_upd       on public.review_assignments;

create policy review_assignments_admin_all on public.review_assignments
  for all using (public.is_admin()) with check (public.is_admin());
create policy review_assignments_reviewer_read on public.review_assignments
  for select using (public.is_reviewer_or_above());
create policy review_assignments_curator_ins on public.review_assignments
  for insert with check (public.is_curator_or_admin());
create policy review_assignments_curator_upd on public.review_assignments
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
-- the assigned reviewer may update their own assignment (mark completed).
create policy review_assignments_self_upd on public.review_assignments
  for update using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

-- ---------- review_decisions --------------------------------------------------
-- reviewer+ insert their own verdicts (reviewer_id = auth.uid()) + read all.
-- admin: full. Decisions are immutable by convention (no update/delete policy).
drop policy if exists review_decisions_admin_all     on public.review_decisions;
drop policy if exists review_decisions_reviewer_read on public.review_decisions;
drop policy if exists review_decisions_reviewer_ins  on public.review_decisions;

create policy review_decisions_admin_all on public.review_decisions
  for all using (public.is_admin()) with check (public.is_admin());
create policy review_decisions_reviewer_read on public.review_decisions
  for select using (public.is_reviewer_or_above());
create policy review_decisions_reviewer_ins on public.review_decisions
  for insert with check (public.is_reviewer_or_above() and reviewer_id = auth.uid());

-- ---------- publication_records -----------------------------------------------
-- READ:  PUBLIC rows -> anyone (incl anon); TEAM rows -> any authenticated user;
--        PRIVATE rows -> publisher (published_by = auth.uid()) / curator / admin.
-- WRITE: only curator+ (is_curator_or_admin) may insert/update. admin: full.
drop policy if exists publication_records_admin_all     on public.publication_records;
drop policy if exists publication_records_public_read   on public.publication_records;
drop policy if exists publication_records_team_read     on public.publication_records;
drop policy if exists publication_records_private_read  on public.publication_records;
drop policy if exists publication_records_curator_ins   on public.publication_records;
drop policy if exists publication_records_curator_upd   on public.publication_records;

create policy publication_records_admin_all on public.publication_records
  for all using (public.is_admin()) with check (public.is_admin());
-- PUBLIC: world-readable (anon included).
create policy publication_records_public_read on public.publication_records
  for select using (visibility = 'PUBLIC');
-- TEAM: any authenticated user.
create policy publication_records_team_read on public.publication_records
  for select using (visibility = 'TEAM' and auth.uid() is not null);
-- PRIVATE: publisher or curator/admin.
create policy publication_records_private_read on public.publication_records
  for select using (
    visibility = 'PRIVATE'
    and (published_by = auth.uid() or public.is_curator_or_admin())
  );
-- only curator+ may publish / edit.
create policy publication_records_curator_ins on public.publication_records
  for insert with check (public.is_curator_or_admin());
create policy publication_records_curator_upd on public.publication_records
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());

-- ---------- publication_versions ----------------------------------------------
-- READ: a version is readable iff its parent publication_record is readable. We
--       reproduce the parent visibility rule via EXISTS (PUBLIC -> anyone; TEAM ->
--       authenticated; PRIVATE -> publisher/curator/admin).
-- WRITE: curator+ insert. admin: full. Snapshots are immutable (no update policy).
drop policy if exists publication_versions_admin_all   on public.publication_versions;
drop policy if exists publication_versions_read        on public.publication_versions;
drop policy if exists publication_versions_curator_ins on public.publication_versions;

create policy publication_versions_admin_all on public.publication_versions
  for all using (public.is_admin()) with check (public.is_admin());
create policy publication_versions_read on public.publication_versions
  for select using (
    exists (
      select 1 from public.publication_records pr
      where pr.id = publication_versions.publication_record_id
        and (
          pr.visibility = 'PUBLIC'
          or (pr.visibility = 'TEAM' and auth.uid() is not null)
          or (pr.visibility = 'PRIVATE'
              and (pr.published_by = auth.uid() or public.is_curator_or_admin()))
        )
    )
  );
create policy publication_versions_curator_ins on public.publication_versions
  for insert with check (public.is_curator_or_admin());

-- ---------- review_comments ---------------------------------------------------
-- Any authenticated user may read + insert (must own the comment they create:
-- user_id = auth.uid()). The author may update/delete their own; admin: full.
drop policy if exists review_comments_admin_all   on public.review_comments;
drop policy if exists review_comments_auth_read   on public.review_comments;
drop policy if exists review_comments_auth_ins    on public.review_comments;
drop policy if exists review_comments_author_upd  on public.review_comments;
drop policy if exists review_comments_author_del  on public.review_comments;

create policy review_comments_admin_all on public.review_comments
  for all using (public.is_admin()) with check (public.is_admin());
create policy review_comments_auth_read on public.review_comments
  for select using (auth.uid() is not null);
create policy review_comments_auth_ins on public.review_comments
  for insert with check (auth.uid() is not null and user_id = auth.uid());
create policy review_comments_author_upd on public.review_comments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy review_comments_author_del on public.review_comments
  for delete using (user_id = auth.uid());

-- ---------- reviewer_trust ----------------------------------------------------
-- READ:  the owning reviewer (reviewer_id = auth.uid()) + any reviewer+ (so the
--        trust board is visible to the review team). admin: full.
-- WRITE: only curator/admin (is_curator_or_admin) — or the service role / a
--        SECURITY DEFINER path, which bypass RLS. Reviewers never self-edit trust.
drop policy if exists reviewer_trust_admin_all     on public.reviewer_trust;
drop policy if exists reviewer_trust_owner_read    on public.reviewer_trust;
drop policy if exists reviewer_trust_reviewer_read on public.reviewer_trust;
drop policy if exists reviewer_trust_curator_ins   on public.reviewer_trust;
drop policy if exists reviewer_trust_curator_upd   on public.reviewer_trust;

create policy reviewer_trust_admin_all on public.reviewer_trust
  for all using (public.is_admin()) with check (public.is_admin());
create policy reviewer_trust_owner_read on public.reviewer_trust
  for select using (reviewer_id = auth.uid());
create policy reviewer_trust_reviewer_read on public.reviewer_trust
  for select using (public.is_reviewer_or_above());
create policy reviewer_trust_curator_ins on public.reviewer_trust
  for insert with check (public.is_curator_or_admin());
create policy reviewer_trust_curator_upd on public.reviewer_trust
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());

-- ---------- notifications -----------------------------------------------------
-- The owner (user_id = auth.uid()) may read + update (e.g. mark read) their own.
-- Any authenticated actor may INSERT (the server creates notifications for users).
-- admin: full.
drop policy if exists notifications_admin_all  on public.notifications;
drop policy if exists notifications_owner_read on public.notifications;
drop policy if exists notifications_owner_upd  on public.notifications;
drop policy if exists notifications_auth_ins   on public.notifications;

create policy notifications_admin_all on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());
create policy notifications_owner_read on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_owner_upd on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_auth_ins on public.notifications
  for insert with check (auth.uid() is not null);

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. Server-side governance jobs
-- (notification fan-out, reviewer-trust recompute, publication snapshotting) use
-- it. User-facing writes go through the per-request, cookie-backed client and are
-- authorized by the policies above (created_by / reviewer_id / user_id = auth.uid()
-- + the role predicates). NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0010_review_and_curation.sql
-- =============================================================================
