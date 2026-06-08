-- =============================================================================
-- Human Signal Index — 0011_signal_intelligence_network.sql
-- WorldForge / HSI (Phase 7) — Human Signal Intelligence Network (HSIN).
--
-- Phase 7 layers a live, multi-source signal-intelligence "observatory" on top of
-- the existing platform (Phases 1-6). The network MONITORS sources (websites, RSS,
-- video/podcast feeds, forums, documents, manual submissions), CAPTURES signals,
-- VERSIONS + DIFFS them, raises ALERTS (new signal / source changed / narrative
-- shift / watchlist match / ...), tracks SOURCE HEALTH + CAPTURE JOBS, records
-- NARRATIVE DRIFT, and lets reviewers triage/review captured signals — feeding
-- approved signals into the Phase 3-6 research/review/curation pipeline.
--
-- ---------------------------------------------------------------------------
-- CRITICAL NAMING DECISION — the `hsin_` PREFIX (read this).
-- ---------------------------------------------------------------------------
-- Migration 0001_init.sql ALREADY created plain `sources` and `signals` tables
-- (the original HSI scaffold, with RLS in 0002 and indexes in 0003). To AVOID
-- clobbering those Phase-1 tables / their policies / their FKs (evidence_items,
-- transcripts, classifications, risk_scores, public_reports, source_changes,
-- uploaded_files, ... all reference public.signals / public.sources), EVERY
-- Phase-7 table here uses the `hsin_` PREFIX (hsin_sources, hsin_signals, ...).
-- We deliberately do NOT create plain `sources` / `signals`. The Phase-1 tables
-- and every object that depends on them remain completely untouched.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY w.r.t. existing schema. It:
--   * creates 14 new `hsin_`-prefixed tables (+ indexes, an updated_at trigger,
--     RLS, and policies);
--   * ADDs one additive column (origin_signal_id) to public.research_runs, after
--     hsin_signals exists, linking a research run back to the signal that spawned it.
-- It does NOT edit migrations 0001-0010, drop existing policies/roles/helpers, or
-- touch any existing table/RLS (including the Phase-1 `sources` / `signals`).
--
-- CONVENTIONS (match 0001-0010):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz default now().
--   - `created_by uuid references public.users(id) on delete set null` where
--     applicable (public.users.id == auth.uid(), per 0006_auth_users_trigger).
--   - mutable tables get an updated_at column + the shared public.set_updated_at()
--     BEFORE UPDATE trigger from 0003 (drop-then-create for idempotency).
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_reviewer_or_above(),
--       public.is_researcher_or_above() (from 0002 + 0010).
--
-- ROLE MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   researcher+ (is_researcher_or_above) -> INSERT (create sources/signals/
--                 watchlists/manual submissions) with created_by = auth.uid().
--   owner (created_by = auth.uid())       -> full CRUD on their own rows.
--   reviewer+ (is_reviewer_or_above)      -> READ all + UPDATE (triage/review/ack).
--   admin                                 -> full access to everything.
--   Child tables authorize via their PARENT (EXISTS on the parent's created_by =
--   auth.uid()) for owners, plus reviewer+ read/write and admin all.
--   READS for the shared sources/signals catalog are open to any authenticated
--   user (auth.uid() is not null) — this is a shared team observatory — while all
--   WRITES stay gated by role.
-- =============================================================================

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------- hsin_sources ------------------------------------------------------
-- A monitored signal source (website / rss / video / podcast / forum / document /
-- manual). status + monitoring_enabled drive the capture scheduler; risk_level is
-- a 1-5 baseline; last_checked_at / last_changed_at track monitoring activity.
create table if not exists public.hsin_sources (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  source_type        text not null,
  platform           text,
  homepage_url       text,
  rss_url            text,
  status             text not null default 'active'
                       check (status in ('active','paused','disabled','error')),
  risk_level         int default 1 check (risk_level between 1 and 5),
  monitoring_enabled boolean default true,
  last_checked_at    timestamptz,
  last_changed_at    timestamptz,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.hsin_sources is
  'HSIN Phase 7: a monitored signal source (prefixed hsin_ to preserve Phase-1 public.sources).';

-- ---------- hsin_source_groups ------------------------------------------------
-- A named grouping of sources (e.g. "Forums", "Climate-doom feeds") for the UI.
create table if not exists public.hsin_source_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_source_groups is
  'HSIN Phase 7: a named grouping of monitored sources.';

-- ---------- hsin_source_group_members -----------------------------------------
-- Membership join: a source belongs to a group (unique per group+source).
create table if not exists public.hsin_source_group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.hsin_source_groups(id) on delete cascade,
  source_id uuid not null references public.hsin_sources(id) on delete cascade,
  unique (group_id, source_id)
);
comment on table public.hsin_source_group_members is
  'HSIN Phase 7: source<->group membership (unique per group_id+source_id).';

-- ---------- hsin_watchlists ---------------------------------------------------
-- A watchlist of terms at a severity; matches against captured signals raise
-- watchlist_match alerts. terms is a free-form text[] of phrases/keywords.
create table if not exists public.hsin_watchlists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  severity    text default 'MEDIUM'
                check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  terms       text[] default '{}',
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_watchlists is
  'HSIN Phase 7: a watchlist of terms at a severity (drives watchlist_match alerts).';

-- ---------- hsin_watchlist_sources --------------------------------------------
-- Scopes a watchlist to specific sources (unique per watchlist+source).
create table if not exists public.hsin_watchlist_sources (
  id           uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.hsin_watchlists(id) on delete cascade,
  source_id    uuid not null references public.hsin_sources(id) on delete cascade,
  unique (watchlist_id, source_id)
);
comment on table public.hsin_watchlist_sources is
  'HSIN Phase 7: scopes a watchlist to specific sources (unique per watchlist_id+source_id).';

-- ---------- hsin_signals ------------------------------------------------------
-- A captured signal (article / video / podcast episode / forum post / ... ). The
-- status drives the triage workflow; content_hash de-dupes + detects change;
-- confidence is the engine's 0..1 capture/classification confidence.
create table if not exists public.hsin_signals (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid references public.hsin_sources(id) on delete set null,
  title           text not null,
  summary         text,
  raw_content     text,
  content_hash    text,
  signal_type     text,
  signal_category text,
  confidence      numeric check (confidence >= 0 and confidence <= 1),
  status          text not null default 'new'
                    check (status in ('new','reviewing','approved','rejected','needs_research','published')),
  captured_at     timestamptz,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table public.hsin_signals is
  'HSIN Phase 7: a captured signal (prefixed hsin_ to preserve Phase-1 public.signals).';

-- ---------- hsin_signal_versions ----------------------------------------------
-- Immutable snapshot of a signal at a version number. snapshot_json holds the
-- frozen captured payload. Unique per (signal, version). Append-only by convention.
create table if not exists public.hsin_signal_versions (
  id             uuid primary key default gen_random_uuid(),
  signal_id      uuid not null references public.hsin_signals(id) on delete cascade,
  version_number int not null,
  snapshot_json  jsonb not null,
  created_at     timestamptz not null default now(),
  unique (signal_id, version_number)
);
comment on table public.hsin_signal_versions is
  'HSIN Phase 7: immutable signal snapshots; unique per (signal_id, version_number).';

-- ---------- hsin_signal_events ------------------------------------------------
-- Append-only event log for a signal (captured / classified / status_changed /
-- reviewed / ...). event_payload carries arbitrary structured context.
create table if not exists public.hsin_signal_events (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references public.hsin_signals(id) on delete cascade,
  event_type    text not null,
  event_payload jsonb,
  created_at    timestamptz not null default now()
);
comment on table public.hsin_signal_events is
  'HSIN Phase 7: append-only event log for a signal.';

-- ---------- hsin_signal_tags --------------------------------------------------
-- Free-form tags attached to a signal (unique per signal+tag).
create table if not exists public.hsin_signal_tags (
  id        uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.hsin_signals(id) on delete cascade,
  tag       text not null,
  unique (signal_id, tag)
);
comment on table public.hsin_signal_tags is
  'HSIN Phase 7: free-form tags on a signal (unique per signal_id+tag).';

-- ---------- hsin_signal_reviews -----------------------------------------------
-- A reviewer's verdict on a captured signal during triage. APPROVE/REJECT/
-- NEEDS_RESEARCH/ESCALATE. notes captures rationale.
create table if not exists public.hsin_signal_reviews (
  id          uuid primary key default gen_random_uuid(),
  signal_id   uuid not null references public.hsin_signals(id) on delete cascade,
  reviewer_id uuid references public.users(id) on delete set null,
  decision    text check (decision in ('APPROVE','REJECT','NEEDS_RESEARCH','ESCALATE')),
  notes       text,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_signal_reviews is
  'HSIN Phase 7: reviewer verdicts on a captured signal (APPROVE/REJECT/NEEDS_RESEARCH/ESCALATE).';

-- ---------- hsin_signal_alerts ------------------------------------------------
-- An alert raised by the network, linked to a signal and/or a source. alert_type
-- classifies the trigger; severity orders triage; status drives ack/escalate/resolve.
create table if not exists public.hsin_signal_alerts (
  id          uuid primary key default gen_random_uuid(),
  signal_id   uuid references public.hsin_signals(id) on delete cascade,
  source_id   uuid references public.hsin_sources(id) on delete cascade,
  alert_type  text not null
                check (alert_type in ('new_signal','source_changed','narrative_shift',
                                      'watchlist_match','high_risk_signal','review_escalation',
                                      'research_created','publication_created')),
  severity    text not null
                check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  title       text,
  explanation text,
  status      text not null default 'open'
                check (status in ('open','acknowledged','escalated','resolved')),
  created_at  timestamptz not null default now()
);
comment on table public.hsin_signal_alerts is
  'HSIN Phase 7: alerts raised by the network (linked to a signal and/or source).';

-- ---------- hsin_source_health ------------------------------------------------
-- A point-in-time health observation for a source (status / response time /
-- last success/failure / consecutive failure count). Drives the health dashboard.
create table if not exists public.hsin_source_health (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.hsin_sources(id) on delete cascade,
  status        text,
  response_time numeric,
  last_success  timestamptz,
  last_failure  timestamptz,
  failure_count int default 0,
  created_at    timestamptz not null default now()
);
comment on table public.hsin_source_health is
  'HSIN Phase 7: point-in-time source health observation.';

-- ---------- hsin_capture_jobs -------------------------------------------------
-- A capture run against a source. status tracks the job lifecycle; error_message
-- records the failure reason when status='failed'.
create table if not exists public.hsin_capture_jobs (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.hsin_sources(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','running','success','failed')),
  started_at    timestamptz,
  finished_at   timestamptz,
  error_message text,
  created_at    timestamptz not null default now()
);
comment on table public.hsin_capture_jobs is
  'HSIN Phase 7: a capture run against a source (pending/running/success/failed).';

-- ---------- hsin_narrative_drift ----------------------------------------------
-- A detected narrative-drift event: a source/signal whose framing shifted between
-- two captures. before_text/after_text + explanation describe the shift; confidence
-- and drift_score quantify it; detected_at is when the drift was observed.
create table if not exists public.hsin_narrative_drift (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid references public.hsin_sources(id) on delete cascade,
  signal_id   uuid references public.hsin_signals(id) on delete set null,
  before_text text,
  after_text  text,
  explanation text,
  confidence  numeric,
  drift_score numeric,
  detected_at timestamptz default now(),
  created_at  timestamptz not null default now()
);
comment on table public.hsin_narrative_drift is
  'HSIN Phase 7: a detected narrative-drift event for a source/signal.';

-- ---------- research_runs: origin_signal_id (ADD-ONLY) ------------------------
-- Additive link from a research run back to the HSIN signal that spawned it (a
-- captured signal sent into the Phase 3 research pipeline). Placed AFTER
-- hsin_signals is created. Existing research_runs RLS (0007) is untouched.
alter table public.research_runs
  add column if not exists origin_signal_id uuid references public.hsin_signals(id) on delete set null;
comment on column public.research_runs.origin_signal_id is
  'HSIN Phase 7: the hsin_signals row that spawned this research run, if any.';

-- =============================================================================
-- 2. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_sources_created_by      on public.hsin_sources(created_by);
create index if not exists idx_hsin_sources_status          on public.hsin_sources(status);

create index if not exists idx_hsin_source_groups_created_by on public.hsin_source_groups(created_by);

create index if not exists idx_hsin_sgm_group_id            on public.hsin_source_group_members(group_id);
create index if not exists idx_hsin_sgm_source_id           on public.hsin_source_group_members(source_id);

create index if not exists idx_hsin_watchlists_created_by    on public.hsin_watchlists(created_by);

create index if not exists idx_hsin_ws_watchlist_id         on public.hsin_watchlist_sources(watchlist_id);
create index if not exists idx_hsin_ws_source_id            on public.hsin_watchlist_sources(source_id);

create index if not exists idx_hsin_signals_source_id       on public.hsin_signals(source_id);
create index if not exists idx_hsin_signals_signal_category on public.hsin_signals(signal_category);
create index if not exists idx_hsin_signals_status          on public.hsin_signals(status);
create index if not exists idx_hsin_signals_content_hash    on public.hsin_signals(content_hash);

create index if not exists idx_hsin_signal_versions_signal_id on public.hsin_signal_versions(signal_id);

create index if not exists idx_hsin_signal_events_signal_id   on public.hsin_signal_events(signal_id);

create index if not exists idx_hsin_signal_tags_signal_id     on public.hsin_signal_tags(signal_id);

create index if not exists idx_hsin_signal_reviews_signal_id  on public.hsin_signal_reviews(signal_id);

create index if not exists idx_hsin_signal_alerts_status      on public.hsin_signal_alerts(status);
create index if not exists idx_hsin_signal_alerts_severity    on public.hsin_signal_alerts(severity);
create index if not exists idx_hsin_signal_alerts_signal_id   on public.hsin_signal_alerts(signal_id);
create index if not exists idx_hsin_signal_alerts_source_id   on public.hsin_signal_alerts(source_id);

create index if not exists idx_hsin_source_health_source_id   on public.hsin_source_health(source_id);

create index if not exists idx_hsin_capture_jobs_source_id    on public.hsin_capture_jobs(source_id);
create index if not exists idx_hsin_capture_jobs_status       on public.hsin_capture_jobs(status);

create index if not exists idx_hsin_narrative_drift_source_id on public.hsin_narrative_drift(source_id);

create index if not exists idx_research_runs_origin_signal_id on public.research_runs(origin_signal_id);

-- =============================================================================
-- 3. updated_at TRIGGER (only hsin_sources carries updated_at)
--    Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_sources;
create trigger trg_set_updated_at before update on public.hsin_sources
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. ENABLE RLS on all 14 new tables
-- =============================================================================
alter table public.hsin_sources              enable row level security;
alter table public.hsin_source_groups        enable row level security;
alter table public.hsin_source_group_members enable row level security;
alter table public.hsin_watchlists           enable row level security;
alter table public.hsin_watchlist_sources    enable row level security;
alter table public.hsin_signals              enable row level security;
alter table public.hsin_signal_versions      enable row level security;
alter table public.hsin_signal_events        enable row level security;
alter table public.hsin_signal_tags          enable row level security;
alter table public.hsin_signal_reviews       enable row level security;
alter table public.hsin_signal_alerts        enable row level security;
alter table public.hsin_source_health        enable row level security;
alter table public.hsin_capture_jobs         enable row level security;
alter table public.hsin_narrative_drift      enable row level security;

-- =============================================================================
-- 5. POLICIES
-- Convention (matches 0002/0005/0008/0010): permissive policies are OR-combined —
-- a row is visible/writable if ANY policy allows it. We follow the 5-role ladder:
--   admin       -> is_admin(): full CRUD.
--   reviewer+   -> is_reviewer_or_above(): READ all + UPDATE (triage/review/ack).
--   researcher+ -> is_researcher_or_above(): INSERT (with created_by = auth.uid()).
--   owner       -> created_by = auth.uid(): full CRUD on their own rows.
--   read        -> any authenticated user (auth.uid() is not null) for the shared
--                  sources/signals catalog (shared team observatory).
-- Child tables authorize via their PARENT's created_by = auth.uid() (owner) plus
-- reviewer+ read/write and admin all.
-- =============================================================================

-- ---------- hsin_sources ------------------------------------------------------
-- researcher+ create (own the row); owner full CRUD; reviewer+ read all + update;
-- authenticated read (shared catalog); admin all.
drop policy if exists hsin_sources_admin_all       on public.hsin_sources;
drop policy if exists hsin_sources_owner_all       on public.hsin_sources;
drop policy if exists hsin_sources_researcher_ins  on public.hsin_sources;
drop policy if exists hsin_sources_reviewer_upd    on public.hsin_sources;
drop policy if exists hsin_sources_auth_read       on public.hsin_sources;

create policy hsin_sources_admin_all on public.hsin_sources
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_sources_owner_all on public.hsin_sources
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy hsin_sources_researcher_ins on public.hsin_sources
  for insert with check (public.is_researcher_or_above() and created_by = auth.uid());
create policy hsin_sources_reviewer_upd on public.hsin_sources
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_sources_auth_read on public.hsin_sources
  for select using (auth.uid() is not null);

-- ---------- hsin_source_groups ------------------------------------------------
-- researcher+ create (own); owner full CRUD; reviewer+ read all + update;
-- authenticated read; admin all.
drop policy if exists hsin_source_groups_admin_all      on public.hsin_source_groups;
drop policy if exists hsin_source_groups_owner_all      on public.hsin_source_groups;
drop policy if exists hsin_source_groups_researcher_ins on public.hsin_source_groups;
drop policy if exists hsin_source_groups_reviewer_upd   on public.hsin_source_groups;
drop policy if exists hsin_source_groups_auth_read      on public.hsin_source_groups;

create policy hsin_source_groups_admin_all on public.hsin_source_groups
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_source_groups_owner_all on public.hsin_source_groups
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy hsin_source_groups_researcher_ins on public.hsin_source_groups
  for insert with check (public.is_researcher_or_above() and created_by = auth.uid());
create policy hsin_source_groups_reviewer_upd on public.hsin_source_groups
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_source_groups_auth_read on public.hsin_source_groups
  for select using (auth.uid() is not null);

-- ---------- hsin_source_group_members -----------------------------------------
-- Authorize via the parent group: the group owner has full CRUD over its members;
-- reviewer+ read all + write; authenticated read; admin all.
drop policy if exists hsin_sgm_admin_all     on public.hsin_source_group_members;
drop policy if exists hsin_sgm_owner_all     on public.hsin_source_group_members;
drop policy if exists hsin_sgm_reviewer_write on public.hsin_source_group_members;
drop policy if exists hsin_sgm_auth_read     on public.hsin_source_group_members;

create policy hsin_sgm_admin_all on public.hsin_source_group_members
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_sgm_owner_all on public.hsin_source_group_members
  for all using (
    exists (
      select 1 from public.hsin_source_groups g
      where g.id = hsin_source_group_members.group_id
        and g.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_source_groups g
      where g.id = hsin_source_group_members.group_id
        and g.created_by = auth.uid()
    )
  );
create policy hsin_sgm_reviewer_write on public.hsin_source_group_members
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_sgm_auth_read on public.hsin_source_group_members
  for select using (auth.uid() is not null);

-- ---------- hsin_watchlists ---------------------------------------------------
-- researcher+ create (own); owner full CRUD; reviewer+ read all + update;
-- authenticated read; admin all.
drop policy if exists hsin_watchlists_admin_all      on public.hsin_watchlists;
drop policy if exists hsin_watchlists_owner_all      on public.hsin_watchlists;
drop policy if exists hsin_watchlists_researcher_ins on public.hsin_watchlists;
drop policy if exists hsin_watchlists_reviewer_upd   on public.hsin_watchlists;
drop policy if exists hsin_watchlists_auth_read      on public.hsin_watchlists;

create policy hsin_watchlists_admin_all on public.hsin_watchlists
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_watchlists_owner_all on public.hsin_watchlists
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy hsin_watchlists_researcher_ins on public.hsin_watchlists
  for insert with check (public.is_researcher_or_above() and created_by = auth.uid());
create policy hsin_watchlists_reviewer_upd on public.hsin_watchlists
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_watchlists_auth_read on public.hsin_watchlists
  for select using (auth.uid() is not null);

-- ---------- hsin_watchlist_sources --------------------------------------------
-- Authorize via the parent watchlist: the watchlist owner has full CRUD over its
-- scoped sources; reviewer+ read all + write; authenticated read; admin all.
drop policy if exists hsin_ws_admin_all      on public.hsin_watchlist_sources;
drop policy if exists hsin_ws_owner_all      on public.hsin_watchlist_sources;
drop policy if exists hsin_ws_reviewer_write on public.hsin_watchlist_sources;
drop policy if exists hsin_ws_auth_read      on public.hsin_watchlist_sources;

create policy hsin_ws_admin_all on public.hsin_watchlist_sources
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_ws_owner_all on public.hsin_watchlist_sources
  for all using (
    exists (
      select 1 from public.hsin_watchlists w
      where w.id = hsin_watchlist_sources.watchlist_id
        and w.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_watchlists w
      where w.id = hsin_watchlist_sources.watchlist_id
        and w.created_by = auth.uid()
    )
  );
create policy hsin_ws_reviewer_write on public.hsin_watchlist_sources
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_ws_auth_read on public.hsin_watchlist_sources
  for select using (auth.uid() is not null);

-- ---------- hsin_signals ------------------------------------------------------
-- researcher+ create (own, e.g. manual submissions); owner full CRUD; reviewer+
-- read all + update (triage/status); authenticated read (shared catalog); admin all.
drop policy if exists hsin_signals_admin_all       on public.hsin_signals;
drop policy if exists hsin_signals_owner_all       on public.hsin_signals;
drop policy if exists hsin_signals_researcher_ins  on public.hsin_signals;
drop policy if exists hsin_signals_reviewer_upd    on public.hsin_signals;
drop policy if exists hsin_signals_auth_read       on public.hsin_signals;

create policy hsin_signals_admin_all on public.hsin_signals
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_signals_owner_all on public.hsin_signals
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy hsin_signals_researcher_ins on public.hsin_signals
  for insert with check (public.is_researcher_or_above() and created_by = auth.uid());
create policy hsin_signals_reviewer_upd on public.hsin_signals
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_signals_auth_read on public.hsin_signals
  for select using (auth.uid() is not null);

-- ---------- hsin_signal_versions ----------------------------------------------
-- Authorize via the parent signal: the signal owner has full CRUD; reviewer+ read
-- all + write; authenticated read; admin all. Snapshots are append-only by convention.
drop policy if exists hsin_signal_versions_admin_all      on public.hsin_signal_versions;
drop policy if exists hsin_signal_versions_owner_all      on public.hsin_signal_versions;
drop policy if exists hsin_signal_versions_reviewer_write on public.hsin_signal_versions;
drop policy if exists hsin_signal_versions_auth_read      on public.hsin_signal_versions;

create policy hsin_signal_versions_admin_all on public.hsin_signal_versions
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_signal_versions_owner_all on public.hsin_signal_versions
  for all using (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_versions.signal_id
        and s.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_versions.signal_id
        and s.created_by = auth.uid()
    )
  );
create policy hsin_signal_versions_reviewer_write on public.hsin_signal_versions
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_signal_versions_auth_read on public.hsin_signal_versions
  for select using (auth.uid() is not null);

-- ---------- hsin_signal_events ------------------------------------------------
-- Authorize via the parent signal (owner full CRUD); reviewer+ read all + write;
-- authenticated read; admin all.
drop policy if exists hsin_signal_events_admin_all      on public.hsin_signal_events;
drop policy if exists hsin_signal_events_owner_all      on public.hsin_signal_events;
drop policy if exists hsin_signal_events_reviewer_write on public.hsin_signal_events;
drop policy if exists hsin_signal_events_auth_read      on public.hsin_signal_events;

create policy hsin_signal_events_admin_all on public.hsin_signal_events
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_signal_events_owner_all on public.hsin_signal_events
  for all using (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_events.signal_id
        and s.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_events.signal_id
        and s.created_by = auth.uid()
    )
  );
create policy hsin_signal_events_reviewer_write on public.hsin_signal_events
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_signal_events_auth_read on public.hsin_signal_events
  for select using (auth.uid() is not null);

-- ---------- hsin_signal_tags --------------------------------------------------
-- Authorize via the parent signal (owner full CRUD); reviewer+ read all + write;
-- authenticated read; admin all.
drop policy if exists hsin_signal_tags_admin_all      on public.hsin_signal_tags;
drop policy if exists hsin_signal_tags_owner_all      on public.hsin_signal_tags;
drop policy if exists hsin_signal_tags_reviewer_write on public.hsin_signal_tags;
drop policy if exists hsin_signal_tags_auth_read      on public.hsin_signal_tags;

create policy hsin_signal_tags_admin_all on public.hsin_signal_tags
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_signal_tags_owner_all on public.hsin_signal_tags
  for all using (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_tags.signal_id
        and s.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_tags.signal_id
        and s.created_by = auth.uid()
    )
  );
create policy hsin_signal_tags_reviewer_write on public.hsin_signal_tags
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_signal_tags_auth_read on public.hsin_signal_tags
  for select using (auth.uid() is not null);

-- ---------- hsin_signal_reviews -----------------------------------------------
-- reviewer+ insert their own verdicts (reviewer_id = auth.uid()) + read all.
-- The signal owner may read reviews of their own signals. admin: full. Reviews
-- are immutable by convention (no update/delete policy beyond admin).
drop policy if exists hsin_signal_reviews_admin_all     on public.hsin_signal_reviews;
drop policy if exists hsin_signal_reviews_reviewer_read on public.hsin_signal_reviews;
drop policy if exists hsin_signal_reviews_reviewer_ins  on public.hsin_signal_reviews;
drop policy if exists hsin_signal_reviews_owner_read    on public.hsin_signal_reviews;

create policy hsin_signal_reviews_admin_all on public.hsin_signal_reviews
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_signal_reviews_reviewer_read on public.hsin_signal_reviews
  for select using (public.is_reviewer_or_above());
create policy hsin_signal_reviews_reviewer_ins on public.hsin_signal_reviews
  for insert with check (public.is_reviewer_or_above() and reviewer_id = auth.uid());
create policy hsin_signal_reviews_owner_read on public.hsin_signal_reviews
  for select using (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_reviews.signal_id
        and s.created_by = auth.uid()
    )
  );

-- ---------- hsin_signal_alerts ------------------------------------------------
-- Authorize via the parent signal/source owner (full CRUD); reviewer+ read all +
-- write (ack/escalate/resolve); authenticated read; admin all.
drop policy if exists hsin_signal_alerts_admin_all      on public.hsin_signal_alerts;
drop policy if exists hsin_signal_alerts_owner_all      on public.hsin_signal_alerts;
drop policy if exists hsin_signal_alerts_reviewer_write on public.hsin_signal_alerts;
drop policy if exists hsin_signal_alerts_auth_read      on public.hsin_signal_alerts;

create policy hsin_signal_alerts_admin_all on public.hsin_signal_alerts
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_signal_alerts_owner_all on public.hsin_signal_alerts
  for all using (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_alerts.signal_id
        and s.created_by = auth.uid()
    )
    or exists (
      select 1 from public.hsin_sources src
      where src.id = hsin_signal_alerts.source_id
        and src.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_signal_alerts.signal_id
        and s.created_by = auth.uid()
    )
    or exists (
      select 1 from public.hsin_sources src
      where src.id = hsin_signal_alerts.source_id
        and src.created_by = auth.uid()
    )
  );
create policy hsin_signal_alerts_reviewer_write on public.hsin_signal_alerts
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_signal_alerts_auth_read on public.hsin_signal_alerts
  for select using (auth.uid() is not null);

-- ---------- hsin_source_health ------------------------------------------------
-- Authorize via the parent source owner (full CRUD); reviewer+ read all + write;
-- authenticated read; admin all.
drop policy if exists hsin_source_health_admin_all      on public.hsin_source_health;
drop policy if exists hsin_source_health_owner_all      on public.hsin_source_health;
drop policy if exists hsin_source_health_reviewer_write on public.hsin_source_health;
drop policy if exists hsin_source_health_auth_read      on public.hsin_source_health;

create policy hsin_source_health_admin_all on public.hsin_source_health
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_source_health_owner_all on public.hsin_source_health
  for all using (
    exists (
      select 1 from public.hsin_sources src
      where src.id = hsin_source_health.source_id
        and src.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_sources src
      where src.id = hsin_source_health.source_id
        and src.created_by = auth.uid()
    )
  );
create policy hsin_source_health_reviewer_write on public.hsin_source_health
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_source_health_auth_read on public.hsin_source_health
  for select using (auth.uid() is not null);

-- ---------- hsin_capture_jobs -------------------------------------------------
-- Authorize via the parent source owner (full CRUD); reviewer+ read all + write;
-- authenticated read; admin all.
drop policy if exists hsin_capture_jobs_admin_all      on public.hsin_capture_jobs;
drop policy if exists hsin_capture_jobs_owner_all      on public.hsin_capture_jobs;
drop policy if exists hsin_capture_jobs_reviewer_write on public.hsin_capture_jobs;
drop policy if exists hsin_capture_jobs_auth_read      on public.hsin_capture_jobs;

create policy hsin_capture_jobs_admin_all on public.hsin_capture_jobs
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_capture_jobs_owner_all on public.hsin_capture_jobs
  for all using (
    exists (
      select 1 from public.hsin_sources src
      where src.id = hsin_capture_jobs.source_id
        and src.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_sources src
      where src.id = hsin_capture_jobs.source_id
        and src.created_by = auth.uid()
    )
  );
create policy hsin_capture_jobs_reviewer_write on public.hsin_capture_jobs
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_capture_jobs_auth_read on public.hsin_capture_jobs
  for select using (auth.uid() is not null);

-- ---------- hsin_narrative_drift ----------------------------------------------
-- Authorize via the parent source/signal owner (full CRUD); reviewer+ read all +
-- write; authenticated read; admin all.
drop policy if exists hsin_narrative_drift_admin_all      on public.hsin_narrative_drift;
drop policy if exists hsin_narrative_drift_owner_all      on public.hsin_narrative_drift;
drop policy if exists hsin_narrative_drift_reviewer_write on public.hsin_narrative_drift;
drop policy if exists hsin_narrative_drift_auth_read      on public.hsin_narrative_drift;

create policy hsin_narrative_drift_admin_all on public.hsin_narrative_drift
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_drift_owner_all on public.hsin_narrative_drift
  for all using (
    exists (
      select 1 from public.hsin_sources src
      where src.id = hsin_narrative_drift.source_id
        and src.created_by = auth.uid()
    )
    or exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_narrative_drift.signal_id
        and s.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.hsin_sources src
      where src.id = hsin_narrative_drift.source_id
        and src.created_by = auth.uid()
    )
    or exists (
      select 1 from public.hsin_signals s
      where s.id = hsin_narrative_drift.signal_id
        and s.created_by = auth.uid()
    )
  );
create policy hsin_narrative_drift_reviewer_write on public.hsin_narrative_drift
  for all using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());
create policy hsin_narrative_drift_auth_read on public.hsin_narrative_drift
  for select using (auth.uid() is not null);

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. Server-side monitoring jobs
-- (source polling, signal capture, versioning/diffing, alert fan-out, health probes,
-- narrative-drift detection) use it. User-facing writes go through the per-request,
-- cookie-backed client and are authorized by the policies above (created_by /
-- reviewer_id = auth.uid() + the role predicates). NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0011_signal_intelligence_network.sql
-- =============================================================================
