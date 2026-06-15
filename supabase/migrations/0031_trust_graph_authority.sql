-- =============================================================================
-- Human Signal Index — 0031_trust_graph_authority.sql
-- WorldForge / HSI (Phase 27) — Trust Graph & Contributor Authority.
--
-- Measures contributor QUALITY (not activity): trust / accuracy / reliability /
-- publication-quality / AUTHORITY scores, derived deterministically by the worker
-- from the Phase-26 append-only contribution_events using the pure @hsi/trust-graph
-- engine. Adds three tables:
--
--   * trust_profiles — one row per user: the current component + headline scores
--                      and the recognition LEVEL (Observer..Legend).
--   * trust_history  — APPEND-ONLY record of score changes (prev/new + reason).
--   * trust_events   — APPEND-ONLY trust-affecting events (audit; self-validation
--                      is excluded by the engine before it ever reaches a score).
--
-- GOVERNANCE (hard constraints): the recognition LEVEL is NOT an RBAC role; the
-- worker NEVER writes public.user_roles. Nothing here changes auth, middleware,
-- RBAC, publication-approval, or governance workflows.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0030. CONVENTIONS match 0001-0030:
-- snake_case; gen_random_uuid() PKs; created_at default now(); CHECK enums;
-- set_updated_at() on mutable tables; append-only tables carry no trigger.
-- =============================================================================

-- =============================================================================
-- A. TRUST PROFILES — current quality scores per user.
-- =============================================================================
create table if not exists public.trust_profiles (
  user_id             uuid primary key references public.users(id) on delete cascade,
  signal_accuracy     integer not null default 50 check (signal_accuracy between 0 and 100),
  review_accuracy     integer not null default 50 check (review_accuracy between 0 and 100),
  publication_quality integer not null default 50 check (publication_quality between 0 and 100),
  reliability         integer not null default 50 check (reliability between 0 and 100),
  accuracy            integer not null default 50 check (accuracy between 0 and 100),
  trust_score         integer not null default 50 check (trust_score between 0 and 100),
  authority_score     integer not null default 50 check (authority_score between 0 and 100),
  trust_level         text not null default 'Observer',
  agreement_pct       integer not null default 0 check (agreement_pct between 0 and 100),
  disagreement_pct    integer not null default 0 check (disagreement_pct between 0 and 100),
  computed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz default now()
);
comment on table public.trust_profiles is
  'HSI Phase 27: per-user quality scores (trust/accuracy/reliability/publication/authority) + recognition level. Recognition only — never an RBAC role.';
create index if not exists idx_trust_profiles_authority on public.trust_profiles(authority_score desc);

-- =============================================================================
-- B. TRUST HISTORY — APPEND-ONLY score changes (Deliverable 8).
-- =============================================================================
create table if not exists public.trust_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  previous_trust     integer,
  new_trust          integer,
  previous_authority integer,
  new_authority      integer,
  reason             text,
  created_at         timestamptz not null default now()
);
comment on table public.trust_history is 'HSI Phase 27: APPEND-ONLY trust/authority score change log (prev/new + reason).';
create index if not exists idx_trust_history_user on public.trust_history(user_id, created_at desc);

-- =============================================================================
-- C. TRUST EVENTS — APPEND-ONLY trust-affecting events (Deliverable 9).
-- =============================================================================
create table if not exists public.trust_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users(id) on delete set null,
  subject_id  uuid references public.users(id) on delete set null,
  event_type  text not null check (event_type in
                ('SIGNAL_ACCEPTED','SIGNAL_REJECTED','REVIEW_AGREEMENT','REVIEW_DISAGREEMENT',
                 'PUBLICATION_APPROVED','PUBLICATION_REJECTED','INVESTIGATION_COMPLETED','INVESTIGATION_ABANDONED')),
  weight      integer not null default 0,
  self_excluded boolean not null default false,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.trust_events is 'HSI Phase 27: APPEND-ONLY trust events. self_excluded=true marks self-validation ignored by scoring (anti-gaming).';
create index if not exists idx_trust_events_subject on public.trust_events(subject_id, created_at desc);

-- =============================================================================
-- D. updated_at trigger (trust_profiles only; history/events are append-only).
-- =============================================================================
drop trigger if exists set_updated_at on public.trust_profiles;
create trigger set_updated_at before update on public.trust_profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- E. RLS — owner reads own; researcher+ read profiles (team/authority views);
--    admin all; the worker writes via service_role.
-- =============================================================================
alter table public.trust_profiles enable row level security;
drop policy if exists trust_profiles_admin_all on public.trust_profiles;
drop policy if exists trust_profiles_read on public.trust_profiles;
create policy trust_profiles_admin_all on public.trust_profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy trust_profiles_read on public.trust_profiles
  for select using (user_id = auth.uid() or public.is_researcher_or_above());

alter table public.trust_history enable row level security;
drop policy if exists trust_history_admin_all on public.trust_history;
drop policy if exists trust_history_self_read on public.trust_history;
create policy trust_history_admin_all on public.trust_history
  for all using (public.is_admin()) with check (public.is_admin());
create policy trust_history_self_read on public.trust_history
  for select using (user_id = auth.uid());

alter table public.trust_events enable row level security;
drop policy if exists trust_events_admin_all on public.trust_events;
drop policy if exists trust_events_self_read on public.trust_events;
create policy trust_events_admin_all on public.trust_events
  for all using (public.is_admin()) with check (public.is_admin());
create policy trust_events_self_read on public.trust_events
  for select using (actor_id = auth.uid() or subject_id = auth.uid());

-- =============================================================================
-- NOTE
-- The Phase-27 TRUST WORKER (service_role) recomputes trust_profiles from the
-- append-only contribution_events, appends trust_history when authority changes,
-- and excludes self-generated validation before scoring (anti-gaming). It NEVER
-- writes public.user_roles. Authority is recognition, never access.
-- =============================================================================

-- =============================================================================
-- End of 0031_trust_graph_authority.sql
-- =============================================================================
