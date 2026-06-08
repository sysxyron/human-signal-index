-- =============================================================================
-- Human Signal Index — 0015_causal_intelligence.sql
-- WorldForge / HSI (Phase 11) — Causal Intelligence & Narrative Replay.
--
-- Phase 11 adds a CAUSAL + REPLAY layer over the narrative-intelligence graph
-- (Phases 8-10). It captures discrete causal EVENTS in a narrative's life
-- (surges, expansions, spikes, shifts, transfers), groups them into ordered
-- causal CHAINS that explain *why* a narrative moved, records point-in-time
-- REPLAY FRAMES for scrubbing a narrative's history, and stamps lifecycle
-- MILESTONES (birth -> ... -> death / resurgence). Together these power the
-- WorldForge "why did this happen / replay the story" bridge.
--   * hsin_causal_events        — a discrete, typed causal event in a narrative;
--   * hsin_causal_chains        — a named, confidence-scored chain of events;
--   * hsin_causal_chain_events  — ordered membership of an event in a chain;
--   * hsin_replay_frames        — a point-in-time frame for narrative replay;
--   * hsin_narrative_milestones — a typed lifecycle milestone for a narrative.
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7-10 / migrations 0011-0014).
-- ---------------------------------------------------------------------------
-- Every Phase-11 table uses the `hsin_` prefix and references the Phase-8 narrative
-- table public.hsin_narratives(id) (created in 0012), plus, for chain membership,
-- the Phase-11 chain/event tables themselves.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY. It creates 5 new `hsin_`-prefixed tables (+ indexes,
-- RLS, policies, one updated_at trigger). It does NOT edit migrations 0001-0014,
-- drop existing policies/roles/helpers, or touch any existing table/RLS.
--
-- CONVENTIONS (match 0001-0014):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz not null default now().
--   - FKs to public.hsin_narratives(id) on delete cascade.
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - mutable tables (hsin_causal_chains) get an updated_at column + the shared
--     public.set_updated_at() trigger (from 0003).
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_reviewer_or_above(),
--       public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- ROLE / ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   All 5 tables are part of the SHARED narrative-intelligence graph (like the
--   Phase-10 temporal tables in 0014):
--     authenticated READ (auth.uid() is not null);
--     researcher+ INSERT/UPDATE/DELETE (public.is_researcher_or_above());
--     admin all (public.is_admin()).
--   The background CAUSAL WORKER uses the Supabase service_role key, which
--   BYPASSES RLS entirely — it detects events, assembles chains, captures replay
--   frames, and stamps milestones without needing these policies. The policies
--   below govern only user-facing (per-request, cookie-backed) access.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

-- ---------- hsin_causal_events ------------------------------------------------
-- A discrete, typed causal event in a narrative's life (e.g. a signal surge, a
-- source/community expansion, an amplification spike, a contradiction shift, a
-- forecast shift, or an influence transfer), with an event_strength (0..100),
-- confidence (0..1), a human-readable explanation, the underlying metrics, and
-- the time the event occurred.
create table if not exists public.hsin_causal_events (
  id             uuid primary key default gen_random_uuid(),
  narrative_id   uuid not null references public.hsin_narratives(id) on delete cascade,
  event_type     text not null check (event_type in (
                   'signal_surge','source_expansion','community_growth','amplification_spike',
                   'contradiction_drop','contradiction_rise','forecast_shift','influence_transfer')),
  event_strength numeric check (event_strength >= 0 and event_strength <= 100),
  confidence     numeric check (confidence >= 0 and confidence <= 1),
  explanation    text,
  metrics_json   jsonb,
  occurred_at    timestamptz,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_causal_events is
  'HSIN Phase 11: a discrete, typed causal event in a narrative''s life (strength/confidence/metrics).';

-- ---------- hsin_causal_chains ------------------------------------------------
-- A named, confidence-scored chain of causal events that together explain why a
-- narrative moved. Members and their order live in hsin_causal_chain_events.
-- This is the one mutable Phase-11 table (chains are re-summarised/rescored in
-- place), so it carries an updated_at column + set_updated_at trigger.
create table if not exists public.hsin_causal_chains (
  id           uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.hsin_narratives(id) on delete cascade,
  chain_name   text,
  confidence   numeric check (confidence >= 0 and confidence <= 1),
  summary      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.hsin_causal_chains is
  'HSIN Phase 11: a named, confidence-scored chain of causal events explaining a narrative''s movement.';

-- ---------- hsin_causal_chain_events ------------------------------------------
-- Ordered membership of a causal event within a chain. sequence_order positions
-- the event in the chain; unique (chain_id, sequence_order) keeps one event per
-- position. event_id is nullable (set null on delete) so a chain slot survives
-- pruning of the underlying event.
create table if not exists public.hsin_causal_chain_events (
  id             uuid primary key default gen_random_uuid(),
  chain_id       uuid not null references public.hsin_causal_chains(id) on delete cascade,
  event_id       uuid references public.hsin_causal_events(id) on delete cascade,
  sequence_order int not null,
  created_at     timestamptz not null default now(),
  unique (chain_id, sequence_order)
);
comment on table public.hsin_causal_chain_events is
  'HSIN Phase 11: ordered membership of a causal event in a chain; unique per (chain, sequence_order).';

-- ---------- hsin_replay_frames ------------------------------------------------
-- A point-in-time frame for replaying a narrative's history: frame_data captures
-- the full narrative shape at frame_timestamp. unique (narrative_id,
-- frame_timestamp) keeps one frame per narrative per instant (idempotent replay
-- capture).
create table if not exists public.hsin_replay_frames (
  id              uuid primary key default gen_random_uuid(),
  narrative_id    uuid not null references public.hsin_narratives(id) on delete cascade,
  frame_timestamp timestamptz not null,
  frame_data      jsonb not null,
  created_at      timestamptz not null default now(),
  unique (narrative_id, frame_timestamp)
);
comment on table public.hsin_replay_frames is
  'HSIN Phase 11: a point-in-time frame for narrative replay; unique per (narrative, frame_timestamp).';

-- ---------- hsin_narrative_milestones -----------------------------------------
-- A typed lifecycle milestone for a narrative (birth/growth/viral/peak/decline/
-- death/resurgence), with confidence (0..1), a description, the underlying
-- metrics, and the time it occurred.
create table if not exists public.hsin_narrative_milestones (
  id             uuid primary key default gen_random_uuid(),
  narrative_id   uuid not null references public.hsin_narratives(id) on delete cascade,
  milestone_type text not null check (milestone_type in (
                   'birth','growth','viral','peak','decline','death','resurgence')),
  confidence     numeric check (confidence >= 0 and confidence <= 1),
  description    text,
  metrics_json   jsonb,
  occurred_at    timestamptz,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_narrative_milestones is
  'HSIN Phase 11: a typed lifecycle milestone (birth/growth/viral/peak/decline/death/resurgence) for a narrative.';

-- =============================================================================
-- B. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_causal_events_narrative_id on public.hsin_causal_events(narrative_id);
create index if not exists idx_hsin_causal_events_event_type   on public.hsin_causal_events(event_type);
create index if not exists idx_hsin_causal_events_occurred_at  on public.hsin_causal_events(occurred_at);
create index if not exists idx_hsin_causal_events_created_at   on public.hsin_causal_events(created_at);

create index if not exists idx_hsin_causal_chains_narrative_id on public.hsin_causal_chains(narrative_id);

create index if not exists idx_hsin_causal_chain_events_chain_id on public.hsin_causal_chain_events(chain_id);
create index if not exists idx_hsin_causal_chain_events_event_id on public.hsin_causal_chain_events(event_id);

create index if not exists idx_hsin_replay_frames_narrative_ts
  on public.hsin_replay_frames(narrative_id, frame_timestamp);

create index if not exists idx_hsin_narrative_milestones_narrative_id   on public.hsin_narrative_milestones(narrative_id);
create index if not exists idx_hsin_narrative_milestones_milestone_type on public.hsin_narrative_milestones(milestone_type);
create index if not exists idx_hsin_narrative_milestones_occurred_at    on public.hsin_narrative_milestones(occurred_at);

-- =============================================================================
-- C. UPDATED_AT TRIGGER (mutable table only)
-- Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_causal_chains;
create trigger trg_set_updated_at before update on public.hsin_causal_chains
  for each row execute function public.set_updated_at();

-- =============================================================================
-- D. ENABLE RLS on all 5 new tables
-- =============================================================================
alter table public.hsin_causal_events       enable row level security;
alter table public.hsin_causal_chains        enable row level security;
alter table public.hsin_causal_chain_events  enable row level security;
alter table public.hsin_replay_frames        enable row level security;
alter table public.hsin_narrative_milestones enable row level security;

-- =============================================================================
-- E. POLICIES
-- Convention (matches 0002/0010/0011/0012/0013/0014): permissive policies are
-- OR-combined — a row is visible/writable if ANY policy allows it. All 5 Phase-11
-- tables share the SHARED-INTELLIGENCE shape (like the 0014 temporal tables):
--   authenticated READ; researcher+ INSERT/UPDATE/DELETE; admin all.
-- The background causal worker uses the service_role key and bypasses ALL of these.
-- =============================================================================

-- ---------- hsin_causal_events ------------------------------------------------
drop policy if exists hsin_causal_events_admin_all      on public.hsin_causal_events;
drop policy if exists hsin_causal_events_auth_read      on public.hsin_causal_events;
drop policy if exists hsin_causal_events_researcher_ins on public.hsin_causal_events;
drop policy if exists hsin_causal_events_researcher_upd on public.hsin_causal_events;
drop policy if exists hsin_causal_events_researcher_del on public.hsin_causal_events;

create policy hsin_causal_events_admin_all on public.hsin_causal_events
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_causal_events_auth_read on public.hsin_causal_events
  for select using (auth.uid() is not null);
create policy hsin_causal_events_researcher_ins on public.hsin_causal_events
  for insert with check (public.is_researcher_or_above());
create policy hsin_causal_events_researcher_upd on public.hsin_causal_events
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_causal_events_researcher_del on public.hsin_causal_events
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_causal_chains ------------------------------------------------
drop policy if exists hsin_causal_chains_admin_all      on public.hsin_causal_chains;
drop policy if exists hsin_causal_chains_auth_read      on public.hsin_causal_chains;
drop policy if exists hsin_causal_chains_researcher_ins on public.hsin_causal_chains;
drop policy if exists hsin_causal_chains_researcher_upd on public.hsin_causal_chains;
drop policy if exists hsin_causal_chains_researcher_del on public.hsin_causal_chains;

create policy hsin_causal_chains_admin_all on public.hsin_causal_chains
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_causal_chains_auth_read on public.hsin_causal_chains
  for select using (auth.uid() is not null);
create policy hsin_causal_chains_researcher_ins on public.hsin_causal_chains
  for insert with check (public.is_researcher_or_above());
create policy hsin_causal_chains_researcher_upd on public.hsin_causal_chains
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_causal_chains_researcher_del on public.hsin_causal_chains
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_causal_chain_events ------------------------------------------
drop policy if exists hsin_causal_chain_events_admin_all      on public.hsin_causal_chain_events;
drop policy if exists hsin_causal_chain_events_auth_read      on public.hsin_causal_chain_events;
drop policy if exists hsin_causal_chain_events_researcher_ins on public.hsin_causal_chain_events;
drop policy if exists hsin_causal_chain_events_researcher_upd on public.hsin_causal_chain_events;
drop policy if exists hsin_causal_chain_events_researcher_del on public.hsin_causal_chain_events;

create policy hsin_causal_chain_events_admin_all on public.hsin_causal_chain_events
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_causal_chain_events_auth_read on public.hsin_causal_chain_events
  for select using (auth.uid() is not null);
create policy hsin_causal_chain_events_researcher_ins on public.hsin_causal_chain_events
  for insert with check (public.is_researcher_or_above());
create policy hsin_causal_chain_events_researcher_upd on public.hsin_causal_chain_events
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_causal_chain_events_researcher_del on public.hsin_causal_chain_events
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_replay_frames ------------------------------------------------
drop policy if exists hsin_replay_frames_admin_all      on public.hsin_replay_frames;
drop policy if exists hsin_replay_frames_auth_read      on public.hsin_replay_frames;
drop policy if exists hsin_replay_frames_researcher_ins on public.hsin_replay_frames;
drop policy if exists hsin_replay_frames_researcher_upd on public.hsin_replay_frames;
drop policy if exists hsin_replay_frames_researcher_del on public.hsin_replay_frames;

create policy hsin_replay_frames_admin_all on public.hsin_replay_frames
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_replay_frames_auth_read on public.hsin_replay_frames
  for select using (auth.uid() is not null);
create policy hsin_replay_frames_researcher_ins on public.hsin_replay_frames
  for insert with check (public.is_researcher_or_above());
create policy hsin_replay_frames_researcher_upd on public.hsin_replay_frames
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_replay_frames_researcher_del on public.hsin_replay_frames
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_narrative_milestones -----------------------------------------
drop policy if exists hsin_narrative_milestones_admin_all      on public.hsin_narrative_milestones;
drop policy if exists hsin_narrative_milestones_auth_read      on public.hsin_narrative_milestones;
drop policy if exists hsin_narrative_milestones_researcher_ins on public.hsin_narrative_milestones;
drop policy if exists hsin_narrative_milestones_researcher_upd on public.hsin_narrative_milestones;
drop policy if exists hsin_narrative_milestones_researcher_del on public.hsin_narrative_milestones;

create policy hsin_narrative_milestones_admin_all on public.hsin_narrative_milestones
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_milestones_auth_read on public.hsin_narrative_milestones
  for select using (auth.uid() is not null);
create policy hsin_narrative_milestones_researcher_ins on public.hsin_narrative_milestones
  for insert with check (public.is_researcher_or_above());
create policy hsin_narrative_milestones_researcher_upd on public.hsin_narrative_milestones
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_narrative_milestones_researcher_del on public.hsin_narrative_milestones
  for delete using (public.is_researcher_or_above());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background causal
-- worker (detecting events, assembling chains, capturing replay frames, and
-- stamping milestones) uses it. User-facing reads/writes go through the
-- per-request, cookie-backed client and are authorized by the policies above.
-- NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0015_causal_intelligence.sql
-- =============================================================================
