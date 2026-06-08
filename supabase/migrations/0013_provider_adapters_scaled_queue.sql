-- =============================================================================
-- Human Signal Index — 0013_provider_adapters_scaled_queue.sql
-- WorldForge / HSI (Phase 9) — Real Provider Adapters & Scaled Queue.
--
-- Phase 9 hardens the Phase-8 job queue for MULTI-WORKER, at-scale operation and
-- wires in REAL outbound provider adapters with observability + reliability
-- intelligence. It introduces:
--   * a VISIBILITY-TIMEOUT lease on hsin_job_queue (locked_until) + a dead-letter
--     marker (dead_lettered_at), plus a DEAD-LETTER table for exhausted jobs;
--   * a multi-worker-safe atomic claim RPC (claim_hsin_jobs) using
--     FOR UPDATE SKIP LOCKED so N workers can drain the queue without double-claiming;
--   * PROVIDER RUN observability (per-fetch outcome, item/byte counts, http status);
--   * SOURCE RELIABILITY scoring + tiering and narrative AMPLIFICATION scoring
--     (shared intelligence derived from captured signals);
--   * GRAPH COMMUNITY detection over the narrative graph;
--   * WORLDFORGE LINKS that fuse a captured signal/narrative into a WorldForge
--     research run / world (the cross-subsystem bridge).
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7 & 8 / migrations 0011-0012).
-- ---------------------------------------------------------------------------
-- Every Phase-9 table uses the `hsin_` prefix. Phase-9 tables reference the Phase-7
-- hsin_ tables (hsin_sources, hsin_signals, hsin_narratives) and, for the WorldForge
-- bridge, the Phase-2/3 plain tables (worlds, research_runs) — NOT the Phase-1 plain
-- sources/signals tables.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY w.r.t. existing schema. It ALTERs hsin_job_queue
-- (add-column-if-not-exists, non-destructive) and creates 6 new `hsin_`-prefixed
-- tables (+ indexes, updated_at triggers, RLS, policies) and 1 RPC. It does NOT edit
-- migrations 0001-0012, drop existing policies/roles/helpers, or touch any existing
-- table/RLS (including the Phase-1 sources/signals and the Phase-7/8 hsin_ tables).
--
-- CONVENTIONS (match 0001-0012):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz default now().
--   - `created_by uuid references public.users(id) on delete set null` where
--     applicable (public.users.id == auth.uid(), per 0006_auth_users_trigger).
--   - mutable tables get an updated_at column + the shared public.set_updated_at()
--     BEFORE UPDATE trigger from 0003 (drop-then-create for idempotency).
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_reviewer_or_above(),
--       public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- ROLE MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   Access shapes used below:
--   (A) OPERATIONAL tables (dead-letter jobs, provider runs): reviewer+ READ;
--       curator/admin WRITE.
--   (B) SHARED-INTELLIGENCE tables (source reliability, amplification scores, graph
--       communities): any authenticated user READS; researcher+ INSERT/UPDATE; admin all.
--   (D) WORKSPACE table (worldforge links): owner (created_by = auth.uid()) full CRUD,
--       researcher+ READ, reviewer+ READ/UPDATE, admin all.
--
--   The background WORKER uses the Supabase service_role key, which BYPASSES RLS
--   entirely — it claims jobs (via claim_hsin_jobs / direct updates), dead-letters
--   exhausted jobs, records provider runs, and recomputes reliability/amplification/
--   communities without needing these policies. The policies below govern only
--   user-facing (per-request, cookie-backed) access.
-- =============================================================================

-- =============================================================================
-- A. ALTER hsin_job_queue — visibility timeout + dead-letter marker
--    Non-destructive: add-column-if-not-exists only. The visibility timeout
--    (locked_until) lets the claim RPC RECLAIM jobs whose worker crashed/stalled
--    after the lease expired; dead_lettered_at marks a job moved to the DLQ.
-- =============================================================================
alter table public.hsin_job_queue
  add column if not exists locked_until     timestamptz;
alter table public.hsin_job_queue
  add column if not exists dead_lettered_at timestamptz;

comment on column public.hsin_job_queue.locked_until is
  'HSIN Phase 9: visibility-timeout lease; a running job is reclaimable once locked_until < now().';
comment on column public.hsin_job_queue.dead_lettered_at is
  'HSIN Phase 9: set when a job exhausted its attempts and was moved to hsin_dead_letter_jobs.';

create index if not exists idx_hsin_job_queue_status_locked
  on public.hsin_job_queue(status, locked_until);

-- =============================================================================
-- B. TABLES
-- =============================================================================

-- ---------- hsin_dead_letter_jobs ---------------------------------------------
-- A job that exhausted its retry budget (or was poison) and was moved off the live
-- queue for human inspection / manual requeue. Captures a snapshot of the payload,
-- the attempt counters, and the terminal reason/error. requeued_at records a manual
-- re-drive back onto the queue.
create table if not exists public.hsin_dead_letter_jobs (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid references public.hsin_job_queue(id) on delete set null,
  job_type         text,
  source_id        uuid references public.hsin_sources(id) on delete set null,
  payload_json     jsonb,
  attempt_count    int,
  max_attempts     int,
  reason           text,
  last_error       text,
  dead_lettered_at timestamptz default now(),
  requeued_at      timestamptz,
  created_at       timestamptz not null default now()
);
comment on table public.hsin_dead_letter_jobs is
  'HSIN Phase 9: dead-letter queue for jobs that exhausted retries; snapshot + requeue marker.';

-- ---------- hsin_provider_runs ------------------------------------------------
-- One outbound provider invocation (a real adapter fetch): which provider, against
-- which source, when it ran, whether it succeeded, why it failed (reason), and the
-- observability counters (items parsed, bytes read, http status).
create table if not exists public.hsin_provider_runs (
  id            uuid primary key default gen_random_uuid(),
  provider_name text not null,
  source_id     uuid references public.hsin_sources(id) on delete set null,
  started_at    timestamptz,
  finished_at   timestamptz,
  ok            boolean,
  reason        text,
  item_count    int,
  bytes         int,
  http_status   int,
  note          text,
  created_at    timestamptz not null default now()
);
comment on table public.hsin_provider_runs is
  'HSIN Phase 9: per-invocation log for a real provider adapter (ok/reason + item/byte/http counters).';

-- ---------- hsin_source_reliability -------------------------------------------
-- A derived reliability profile for a source (one row per source). Blends capture
-- success, block rate, downstream approval/contradiction rates, and signal volume
-- into a 0..100 reliability_score + a coarse tier. Recomputed periodically by the
-- worker. unique(source_id) keeps it as a single live profile per source.
create table if not exists public.hsin_source_reliability (
  id                    uuid primary key default gen_random_uuid(),
  source_id             uuid not null references public.hsin_sources(id) on delete cascade,
  reliability_score     numeric check (reliability_score >= 0 and reliability_score <= 100),
  tier                  text check (tier in ('high','medium','low','unproven')),
  capture_success_rate  numeric,
  blocked_rate          numeric,
  approved_rate         numeric,
  contradiction_rate    numeric,
  signal_count          int,
  rationale             text,
  computed_at           timestamptz default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source_id)
);
comment on table public.hsin_source_reliability is
  'HSIN Phase 9: derived per-source reliability profile (0..100 score + tier); unique per source_id.';

-- ---------- hsin_amplification_scores -----------------------------------------
-- A derived amplification profile for a narrative (one row per narrative): how
-- broadly/rapidly the narrative is being amplified across sources/signals, as a
-- 0..100 score with supporting counters + velocity. unique(narrative_id).
create table if not exists public.hsin_amplification_scores (
  id            uuid primary key default gen_random_uuid(),
  narrative_id  uuid not null references public.hsin_narratives(id) on delete cascade,
  amplification numeric check (amplification >= 0 and amplification <= 100),
  source_count  int,
  signal_count  int,
  velocity      numeric,
  rationale     text,
  computed_at   timestamptz default now(),
  created_at    timestamptz not null default now(),
  unique (narrative_id)
);
comment on table public.hsin_amplification_scores is
  'HSIN Phase 9: derived per-narrative amplification profile (0..100 score + velocity); unique per narrative_id.';

-- ---------- hsin_graph_communities --------------------------------------------
-- A detected community (cluster) over the narrative graph: the algorithm used, the
-- member narrative ids, the cluster size, and arbitrary computed metrics. Recomputed
-- by the worker; rows are replaced on each run.
create table if not exists public.hsin_graph_communities (
  id                   uuid primary key default gen_random_uuid(),
  label                text,
  algorithm            text default 'label-propagation',
  member_narrative_ids uuid[] default '{}',
  size                 int,
  metrics_json         jsonb,
  computed_at          timestamptz default now(),
  created_at           timestamptz not null default now()
);
comment on table public.hsin_graph_communities is
  'HSIN Phase 9: a detected community (cluster) over the narrative graph + its members/metrics.';

-- ---------- hsin_worldforge_links ---------------------------------------------
-- The cross-subsystem bridge: fuses a captured signal/narrative into a WorldForge
-- research run / world. prompt_draft is the proposed concept prompt; status walks
-- draft -> approved/rejected -> created (a world/run was generated). created_by owns
-- the draft.
create table if not exists public.hsin_worldforge_links (
  id              uuid primary key default gen_random_uuid(),
  signal_id       uuid references public.hsin_signals(id) on delete set null,
  narrative_id    uuid references public.hsin_narratives(id) on delete set null,
  research_run_id uuid references public.research_runs(id) on delete set null,
  world_id        uuid references public.worlds(id) on delete set null,
  prompt_draft    text,
  status          text not null default 'draft'
                    check (status in ('draft','approved','rejected','created')),
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.hsin_worldforge_links is
  'HSIN Phase 9: bridge fusing a captured signal/narrative into a WorldForge research run/world.';

-- =============================================================================
-- C. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_dead_letter_jobs_job_type      on public.hsin_dead_letter_jobs(job_type);
create index if not exists idx_hsin_dead_letter_jobs_source_id     on public.hsin_dead_letter_jobs(source_id);
create index if not exists idx_hsin_dead_letter_jobs_dead_lettered on public.hsin_dead_letter_jobs(dead_lettered_at);

create index if not exists idx_hsin_provider_runs_provider_name on public.hsin_provider_runs(provider_name);
create index if not exists idx_hsin_provider_runs_source_id     on public.hsin_provider_runs(source_id);
create index if not exists idx_hsin_provider_runs_created_at    on public.hsin_provider_runs(created_at);

create index if not exists idx_hsin_source_reliability_tier on public.hsin_source_reliability(tier);

create index if not exists idx_hsin_amplification_scores_amplification on public.hsin_amplification_scores(amplification);

create index if not exists idx_hsin_graph_communities_size on public.hsin_graph_communities(size);

create index if not exists idx_hsin_worldforge_links_signal_id       on public.hsin_worldforge_links(signal_id);
create index if not exists idx_hsin_worldforge_links_research_run_id on public.hsin_worldforge_links(research_run_id);
create index if not exists idx_hsin_worldforge_links_status          on public.hsin_worldforge_links(status);

-- =============================================================================
-- D. updated_at TRIGGERS
--    Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
--    Applied to every Phase-9 table carrying an updated_at column.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_source_reliability;
create trigger trg_set_updated_at before update on public.hsin_source_reliability
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_worldforge_links;
create trigger trg_set_updated_at before update on public.hsin_worldforge_links
  for each row execute function public.set_updated_at();

-- =============================================================================
-- E. RPC — claim_hsin_jobs (multi-worker-safe atomic claim)
--    The background worker calls this via RPC to atomically lease a batch of due /
--    reclaimable jobs. FOR UPDATE SKIP LOCKED lets N concurrent workers each grab a
--    disjoint batch without blocking or double-claiming. A job is eligible when it is
--    queued/retrying and due (scheduled_for <= now()), OR it is running but its
--    visibility lease has expired (locked_until < now()) — i.e. the previous worker
--    crashed/stalled. Claiming sets status='running', stamps started_at, extends the
--    lease by p_visibility_seconds, and bumps attempt_count.
--
--    SECURITY DEFINER + fixed search_path=public so the function runs with the
--    owner's rights against the public schema regardless of caller search_path.
-- =============================================================================
create or replace function public.claim_hsin_jobs(
  p_limit int,
  p_visibility_seconds int default 300
)
returns setof public.hsin_job_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.hsin_job_queue q
  set status = 'running',
      started_at = now(),
      locked_until = now() + make_interval(secs => p_visibility_seconds),
      attempt_count = q.attempt_count + 1,
      updated_at = now()
  where q.id in (
    select id from public.hsin_job_queue
    where (status in ('queued','retrying') and scheduled_for <= now())
       or (status = 'running' and locked_until is not null and locked_until < now())
    order by priority desc, scheduled_for asc, created_at asc
    limit p_limit
    for update skip locked
  )
  returning q.*;
end;
$$;

comment on function public.claim_hsin_jobs(int, int) is
  'HSIN Phase 9: the worker calls this via RPC to atomically claim a batch of due/reclaimable jobs (FOR UPDATE SKIP LOCKED) for multi-worker-safe draining; leases each for p_visibility_seconds.';

grant execute on function public.claim_hsin_jobs(int, int) to authenticated, service_role;

-- =============================================================================
-- F. ENABLE RLS on all 6 new tables
-- =============================================================================
alter table public.hsin_dead_letter_jobs    enable row level security;
alter table public.hsin_provider_runs        enable row level security;
alter table public.hsin_source_reliability   enable row level security;
alter table public.hsin_amplification_scores enable row level security;
alter table public.hsin_graph_communities    enable row level security;
alter table public.hsin_worldforge_links     enable row level security;

-- =============================================================================
-- G. POLICIES
-- Convention (matches 0002/0010/0011/0012): permissive policies are OR-combined — a
-- row is visible/writable if ANY policy allows it. Access shapes (see header):
--   (A) OPERATIONAL          : reviewer+ READ; curator/admin WRITE.
--   (B) SHARED-INTELLIGENCE   : authenticated READ; researcher+ INSERT/UPDATE; admin all.
--   (D) WORKSPACE (links)     : owner full CRUD; researcher+ READ; reviewer+ READ/UPDATE; admin all.
-- The background worker uses the service_role key and bypasses ALL of these.
-- =============================================================================

-- ---------- (A) hsin_dead_letter_jobs -----------------------------------------
-- Operational: reviewer+ inspect the DLQ; curator/admin manage (requeue/clear).
drop policy if exists hsin_dead_letter_jobs_admin_all     on public.hsin_dead_letter_jobs;
drop policy if exists hsin_dead_letter_jobs_reviewer_read on public.hsin_dead_letter_jobs;
drop policy if exists hsin_dead_letter_jobs_curator_ins   on public.hsin_dead_letter_jobs;
drop policy if exists hsin_dead_letter_jobs_curator_upd   on public.hsin_dead_letter_jobs;
drop policy if exists hsin_dead_letter_jobs_curator_del   on public.hsin_dead_letter_jobs;

create policy hsin_dead_letter_jobs_admin_all on public.hsin_dead_letter_jobs
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_dead_letter_jobs_reviewer_read on public.hsin_dead_letter_jobs
  for select using (public.is_reviewer_or_above());
create policy hsin_dead_letter_jobs_curator_ins on public.hsin_dead_letter_jobs
  for insert with check (public.is_curator_or_admin());
create policy hsin_dead_letter_jobs_curator_upd on public.hsin_dead_letter_jobs
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_dead_letter_jobs_curator_del on public.hsin_dead_letter_jobs
  for delete using (public.is_curator_or_admin());

-- ---------- (A) hsin_provider_runs --------------------------------------------
-- Operational: reviewer+ read provider-run observability; curator/admin manage.
drop policy if exists hsin_provider_runs_admin_all     on public.hsin_provider_runs;
drop policy if exists hsin_provider_runs_reviewer_read on public.hsin_provider_runs;
drop policy if exists hsin_provider_runs_curator_ins   on public.hsin_provider_runs;
drop policy if exists hsin_provider_runs_curator_upd   on public.hsin_provider_runs;
drop policy if exists hsin_provider_runs_curator_del   on public.hsin_provider_runs;

create policy hsin_provider_runs_admin_all on public.hsin_provider_runs
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_provider_runs_reviewer_read on public.hsin_provider_runs
  for select using (public.is_reviewer_or_above());
create policy hsin_provider_runs_curator_ins on public.hsin_provider_runs
  for insert with check (public.is_curator_or_admin());
create policy hsin_provider_runs_curator_upd on public.hsin_provider_runs
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_provider_runs_curator_del on public.hsin_provider_runs
  for delete using (public.is_curator_or_admin());

-- ---------- (B) hsin_source_reliability ---------------------------------------
-- Shared intelligence: any authenticated user reads; researcher+ insert/update; admin all.
drop policy if exists hsin_source_reliability_admin_all      on public.hsin_source_reliability;
drop policy if exists hsin_source_reliability_auth_read      on public.hsin_source_reliability;
drop policy if exists hsin_source_reliability_researcher_ins on public.hsin_source_reliability;
drop policy if exists hsin_source_reliability_researcher_upd on public.hsin_source_reliability;

create policy hsin_source_reliability_admin_all on public.hsin_source_reliability
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_source_reliability_auth_read on public.hsin_source_reliability
  for select using (auth.uid() is not null);
create policy hsin_source_reliability_researcher_ins on public.hsin_source_reliability
  for insert with check (public.is_researcher_or_above());
create policy hsin_source_reliability_researcher_upd on public.hsin_source_reliability
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());

-- ---------- (B) hsin_amplification_scores -------------------------------------
-- Shared intelligence: authenticated read; researcher+ insert/update; admin all.
drop policy if exists hsin_amplification_scores_admin_all      on public.hsin_amplification_scores;
drop policy if exists hsin_amplification_scores_auth_read      on public.hsin_amplification_scores;
drop policy if exists hsin_amplification_scores_researcher_ins on public.hsin_amplification_scores;
drop policy if exists hsin_amplification_scores_researcher_upd on public.hsin_amplification_scores;

create policy hsin_amplification_scores_admin_all on public.hsin_amplification_scores
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_amplification_scores_auth_read on public.hsin_amplification_scores
  for select using (auth.uid() is not null);
create policy hsin_amplification_scores_researcher_ins on public.hsin_amplification_scores
  for insert with check (public.is_researcher_or_above());
create policy hsin_amplification_scores_researcher_upd on public.hsin_amplification_scores
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());

-- ---------- (B) hsin_graph_communities ----------------------------------------
-- Shared intelligence: authenticated read; researcher+ insert/update; admin all.
drop policy if exists hsin_graph_communities_admin_all      on public.hsin_graph_communities;
drop policy if exists hsin_graph_communities_auth_read      on public.hsin_graph_communities;
drop policy if exists hsin_graph_communities_researcher_ins on public.hsin_graph_communities;
drop policy if exists hsin_graph_communities_researcher_upd on public.hsin_graph_communities;

create policy hsin_graph_communities_admin_all on public.hsin_graph_communities
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_graph_communities_auth_read on public.hsin_graph_communities
  for select using (auth.uid() is not null);
create policy hsin_graph_communities_researcher_ins on public.hsin_graph_communities
  for insert with check (public.is_researcher_or_above());
create policy hsin_graph_communities_researcher_upd on public.hsin_graph_communities
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());

-- ---------- (D) hsin_worldforge_links -----------------------------------------
-- Workspace: the owner (created_by = auth.uid()) has full CRUD over their drafts;
-- researcher+ may READ all links; reviewer+ may READ + UPDATE (advance status, e.g.
-- approve/reject); admin all. Owner write is gated to rows the user actually owns.
drop policy if exists hsin_worldforge_links_admin_all       on public.hsin_worldforge_links;
drop policy if exists hsin_worldforge_links_owner_all        on public.hsin_worldforge_links;
drop policy if exists hsin_worldforge_links_researcher_read  on public.hsin_worldforge_links;
drop policy if exists hsin_worldforge_links_reviewer_read    on public.hsin_worldforge_links;
drop policy if exists hsin_worldforge_links_reviewer_upd     on public.hsin_worldforge_links;

create policy hsin_worldforge_links_admin_all on public.hsin_worldforge_links
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_worldforge_links_owner_all on public.hsin_worldforge_links
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy hsin_worldforge_links_researcher_read on public.hsin_worldforge_links
  for select using (public.is_researcher_or_above());
create policy hsin_worldforge_links_reviewer_read on public.hsin_worldforge_links
  for select using (public.is_reviewer_or_above());
create policy hsin_worldforge_links_reviewer_upd on public.hsin_worldforge_links
  for update using (public.is_reviewer_or_above()) with check (public.is_reviewer_or_above());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background worker
-- (queue claim via claim_hsin_jobs, dead-lettering exhausted jobs, recording
-- provider runs, recomputing source-reliability / narrative-amplification /
-- graph-communities, and drafting worldforge links) uses it. User-facing
-- reads/writes go through the per-request, cookie-backed client and are authorized
-- by the policies above. NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0013_provider_adapters_scaled_queue.sql
-- =============================================================================
