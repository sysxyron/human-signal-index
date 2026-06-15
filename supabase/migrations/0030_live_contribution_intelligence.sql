-- =============================================================================
-- Human Signal Index — 0030_live_contribution_intelligence.sql
-- WorldForge / HSI (Phase 26) — Live Contribution Intelligence.
--
-- Connects REAL platform activity (signals, evidence, reviews, investigations,
-- publications) into the Phase-25 contributor systems. This migration is purely
-- ADDITIVE infrastructure for AUDITED, IDEMPOTENT award processing:
--
--   * contribution_events     — the canonical, append-only audit of every
--                               contribution-affecting action. A UNIQUE
--                               idempotency_key makes award processing idempotent
--                               (anti-gaming: no duplicate / double-counted
--                               awards). Every reward is traceable to a row here.
--   * user_contribution_stats — a worker-refreshed materialization of each user's
--                               live stats (XP, credits, counts, xp-rank,
--                               reputation) for the profile + admin oversight.
--   * leaderboard_snapshots.period — daily / weekly / monthly / all_time.
--   * user_xp_ledger.event_id / intel_credit_ledger.event_id — link each ledger
--                               row back to its contribution_event (traceability).
--
-- GOVERNANCE (hard constraints): NOTHING here changes auth, middleware, RBAC,
-- publication-approval, or governance logic. The contribution worker recomputes
-- recognition (reputation/ranks/badges/leaderboards) from these append-only
-- sources and NEVER writes public.user_roles.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0029. CONVENTIONS match 0001-0029:
-- snake_case; gen_random_uuid() PKs; created_at default now(); CHECK enums;
-- set_updated_at() on mutable tables; append-only tables carry no trigger.
-- =============================================================================

-- =============================================================================
-- A. CONTRIBUTION EVENTS — audit + idempotency gate (APPEND-ONLY).
-- =============================================================================
create table if not exists public.contribution_events (
  id               uuid primary key default gen_random_uuid(),
  actor_id         uuid references public.users(id) on delete set null,
  subject_id       uuid references public.users(id) on delete set null,
  event_type       text not null,
  ref_kind         text,
  ref_id           text,
  reason           text,
  metadata         jsonb,
  xp_awarded       integer not null default 0,
  credits_awarded  integer not null default 0,
  reputation_delta integer not null default 0,
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now()
);
comment on table public.contribution_events is
  'HSI Phase 26: APPEND-ONLY audit of every contribution-affecting action. UNIQUE idempotency_key makes award processing idempotent (no duplicate/double awards). Every reward is traceable here.';
create index if not exists idx_contribution_events_actor on public.contribution_events(actor_id, created_at desc);
create index if not exists idx_contribution_events_subject on public.contribution_events(subject_id);
create index if not exists idx_contribution_events_type on public.contribution_events(event_type, created_at desc);

-- =============================================================================
-- B. USER CONTRIBUTION STATS — worker-materialized live profile/admin stats.
-- =============================================================================
create table if not exists public.user_contribution_stats (
  user_id                  uuid primary key references public.users(id) on delete cascade,
  xp                       integer not null default 0,
  credits                  integer not null default 0,
  signals_submitted        integer not null default 0,
  evidence_submitted       integer not null default 0,
  reviews_completed        integer not null default 0,
  signals_accepted         integer not null default 0,
  signals_rejected         integer not null default 0,
  publications_contributed integer not null default 0,
  investigations_owned     integer not null default 0,
  missions_completed       integer not null default 0,
  badges_earned            integer not null default 0,
  xp_rank                  text not null default 'Observer',
  reputation_overall       integer not null default 0,
  computed_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz default now()
);
comment on table public.user_contribution_stats is
  'HSI Phase 26: worker-materialized live contribution stats (XP/credits/counts/xp-rank/reputation) for the profile + admin oversight. Derived from append-only ledgers; never hand-edited.';

-- =============================================================================
-- C. EXTEND leaderboard_snapshots (period) + ledgers (event_id traceability).
-- =============================================================================
alter table public.leaderboard_snapshots
  add column if not exists period text not null default 'all_time'
    check (period in ('daily','weekly','monthly','all_time'));
comment on column public.leaderboard_snapshots.period is 'HSI Phase 26: leaderboard window (daily/weekly/monthly/all_time).';
create index if not exists idx_leaderboard_snapshots_view_period on public.leaderboard_snapshots(view, period, computed_at desc);

alter table public.user_xp_ledger
  add column if not exists event_id uuid references public.contribution_events(id) on delete set null;
alter table public.intel_credit_ledger
  add column if not exists event_id uuid references public.contribution_events(id) on delete set null;

-- =============================================================================
-- D. updated_at trigger (user_contribution_stats only; events are append-only).
-- =============================================================================
drop trigger if exists set_updated_at on public.user_contribution_stats;
create trigger set_updated_at before update on public.user_contribution_stats
  for each row execute function public.set_updated_at();

-- =============================================================================
-- E. RLS — owner reads own rows; admin all; the worker writes via service_role.
-- =============================================================================
alter table public.contribution_events enable row level security;
drop policy if exists contribution_events_admin_all on public.contribution_events;
drop policy if exists contribution_events_self_read on public.contribution_events;
create policy contribution_events_admin_all on public.contribution_events
  for all using (public.is_admin()) with check (public.is_admin());
create policy contribution_events_self_read on public.contribution_events
  for select using (actor_id = auth.uid() or subject_id = auth.uid());

alter table public.user_contribution_stats enable row level security;
drop policy if exists user_contribution_stats_admin_all on public.user_contribution_stats;
drop policy if exists user_contribution_stats_self_read on public.user_contribution_stats;
create policy user_contribution_stats_admin_all on public.user_contribution_stats
  for all using (public.is_admin()) with check (public.is_admin());
create policy user_contribution_stats_self_read on public.user_contribution_stats
  for select using (user_id = auth.uid());

-- =============================================================================
-- NOTE
-- The recorder (server-only) writes contribution_events + ledgers via the
-- service_role key (bypasses RLS) AFTER a genuine platform action succeeds; users
-- cannot self-issue awards. Idempotency is enforced by contribution_events'
-- UNIQUE idempotency_key. The Phase-26 worker recomputes user_contribution_stats,
-- reputation, ranks, badges, missions, team metrics, and leaderboard snapshots
-- from these append-only rows — deterministically, and WITHOUT ever writing
-- public.user_roles. No autonomous role promotion; no silent rewards.
-- =============================================================================

-- =============================================================================
-- End of 0030_live_contribution_intelligence.sql
-- =============================================================================
