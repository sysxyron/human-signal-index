-- =============================================================================
-- Human Signal Index — 0033_outcome_attribution_engine.sql
-- WorldForge / HSI (Phase 29) — Outcome Attribution Engine.
--
-- Measures EFFECTIVENESS (activity ≠ impact). Records real outcomes, the
-- attribution chains that produced them, per-entity impact, and impact history:
--
--   * outcome_events     — APPEND-ONLY log of real outcomes (taxonomy + audit).
--   * attribution_ledger — directed origin→destination edges with weights
--                          (signal→investigation→…→publication→outcome). A UNIQUE
--                          idempotency_key prevents duplicate chains / double-count.
--   * entity_impact      — worker-materialized impact score per entity
--                          (signal/investigation/contributor/team/publication).
--   * impact_history     — APPEND-ONLY per-entity score changes (prev/new + reason).
--
-- GOVERNANCE (hard constraints): impact influences TRUST (impact → trust), never
-- the reverse, and NEVER changes auth, middleware, RBAC, user_roles, or IAM. The
-- worker only recomputes; it never writes public.user_roles.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0032. CONVENTIONS match 0001-0032.
-- =============================================================================

-- =============================================================================
-- A. OUTCOME EVENTS — APPEND-ONLY taxonomy log (Deliverables 9, 10).
-- =============================================================================
create table if not exists public.outcome_events (
  id              uuid primary key default gen_random_uuid(),
  outcome_type    text not null check (outcome_type in (
                    'VERIFIED_FINDING','GOVERNANCE_ACTION','POLICY_CHANGE','RISK_REDUCTION',
                    'NARRATIVE_CORRECTION','INVESTIGATION_COMPLETED','PUBLICATION_RELEASED','EXTERNAL_ACTION','OTHER')),
  entity_kind     text not null,
  entity_id       text not null,
  actor_id        uuid references public.users(id) on delete set null,
  team_key        text,
  impact_weight   numeric not null default 0,
  reason          text,
  metadata        jsonb,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
comment on table public.outcome_events is 'HSI Phase 29: APPEND-ONLY outcome log (taxonomy). UNIQUE idempotency_key = no duplicate outcomes.';
create index if not exists idx_outcome_events_actor on public.outcome_events(actor_id, created_at desc);
create index if not exists idx_outcome_events_type on public.outcome_events(outcome_type, created_at desc);
create index if not exists idx_outcome_events_entity on public.outcome_events(entity_kind, entity_id);

-- =============================================================================
-- B. ATTRIBUTION LEDGER — directed weighted edges (Deliverable 11).
-- =============================================================================
create table if not exists public.attribution_ledger (
  id                uuid primary key default gen_random_uuid(),
  origin_kind       text not null,
  origin_id         text not null,
  destination_kind  text not null,
  destination_id    text not null,
  relationship      text not null check (relationship in (
                      'signal_to_investigation','investigation_to_review','review_to_governance',
                      'governance_to_publication','investigation_to_publication','publication_to_outcome',
                      'investigation_to_outcome','contributor_to_outcome','team_to_outcome')),
  weight            numeric not null default 0 check (weight >= 0 and weight <= 1),
  origin_owner      uuid references public.users(id) on delete set null,
  destination_owner uuid references public.users(id) on delete set null,
  idempotency_key   text not null unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz default now()
);
comment on table public.attribution_ledger is 'HSI Phase 29: directed attribution edges (the chain). UNIQUE idempotency_key prevents duplicate/circular double-counting (anti-gaming).';
create index if not exists idx_attribution_origin on public.attribution_ledger(origin_kind, origin_id);
create index if not exists idx_attribution_destination on public.attribution_ledger(destination_kind, destination_id);

-- =============================================================================
-- C. ENTITY IMPACT — worker-materialized per-entity score.
-- =============================================================================
create table if not exists public.entity_impact (
  entity_kind      text not null,
  entity_id        text not null,
  impact_score     integer not null default 0 check (impact_score between 0 and 100),
  outcomes_count   integer not null default 0,
  verified_findings integer not null default 0,
  governance_actions integer not null default 0,
  publications     integer not null default 0,
  team_key         text,
  computed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz default now(),
  primary key (entity_kind, entity_id)
);
comment on table public.entity_impact is 'HSI Phase 29: materialized impact score per entity (signal/investigation/contributor/team/publication). Advisory; never gates access.';
create index if not exists idx_entity_impact_score on public.entity_impact(entity_kind, impact_score desc);

-- =============================================================================
-- D. IMPACT HISTORY — APPEND-ONLY score changes (Deliverable 12).
-- =============================================================================
create table if not exists public.impact_history (
  id             uuid primary key default gen_random_uuid(),
  entity_kind    text not null,
  entity_id      text not null,
  previous_score integer,
  new_score      integer,
  reason         text,
  created_at     timestamptz not null default now()
);
comment on table public.impact_history is 'HSI Phase 29: APPEND-ONLY per-entity impact score change log.';
create index if not exists idx_impact_history_entity on public.impact_history(entity_kind, entity_id, created_at desc);

-- =============================================================================
-- E. updated_at triggers (mutable tables only).
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['attribution_ledger','entity_impact']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- F. RLS — researcher+ READ (advisory analytics); admin all; worker writes via
--    service_role. Owners also read their own outcome rows.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['outcome_events','attribution_ledger','entity_impact','impact_history']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
  end loop;
end$$;

-- =============================================================================
-- NOTE
-- The Phase-29 worker BACKFILLS attribution by scanning existing investigations,
-- governance decisions, and publications, builds the chains (anti-gaming: dedup +
-- no self-loops/cycles/self-attribution), materializes entity_impact, and appends
-- impact_history. Impact feeds the trust graph's impact dimension (impact → trust);
-- it NEVER writes public.user_roles. No autonomous role changes.
-- =============================================================================

-- =============================================================================
-- End of 0033_outcome_attribution_engine.sql
-- =============================================================================
