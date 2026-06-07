-- =============================================================================
-- Human Signal Index — 0005_worldforge.sql
-- WorldForge (Phase 2) — causal world-simulation persistence schema.
--
-- WorldForge is a causal world-simulation subsystem layered on top of the
-- existing HSI platform. It stores canonical world states, immutable version
-- snapshots, scenarios, counterfactuals, timelines, and the per-node provenance
-- that ties every computed output back into HSI's provenance/traceability
-- principle (see 0002_rls_and_policies.sql + docs/methodology).
--
-- CONVENTIONS (match 0001-0004):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz default now().
--   - mutable tables get an updated_at column + the shared public.set_updated_at()
--     BEFORE UPDATE trigger from 0003.
--   - RLS via the helper functions from 0002:
--       public.is_admin(), public.is_reviewer_or_admin().
--   - jsonb columns hold the canonical engine payloads (WorldState, diffs, etc.).
--     The application writes the FULL canonical objects; SQL only constrains shape
--     lightly (CHECK on numeric ranges + enum-style text guards).
--
-- ROLE MODEL (re-uses HSI roles):
--   owner            -> the creating user (created_by = auth.uid()): full CRUD on
--                       their own worlds/simulations and all child rows.
--   admin / reviewer -> is_reviewer_or_admin(): read all + write all (curation).
--   viewer / anon    -> read ONLY rows belonging to a PUBLIC world. A world is
--                       public when worlds.is_public = true; child tables inherit
--                       publicity from their parent simulation's world via the
--                       SECURITY DEFINER helper public.simulation_is_public().
-- =============================================================================

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------- worlds ------------------------------------------------------------
-- A reusable, named world definition. base_state holds the canonical WorldState
-- JSON ({id,name,universeType,star,planets[],chemistry,biology,intelligence,
-- civilization,risks,meta}). A world can seed many simulations.
create table if not exists public.worlds (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  universe_type text not null default 'standard-physics',
  base_state    jsonb not null default '{}'::jsonb,   -- canonical WorldState
  created_by    uuid references public.users(id) on delete set null,
  is_public     boolean not null default false,
  tags          text[] not null default array[]::text[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.worlds is
  'WorldForge: reusable world definitions; base_state is the canonical WorldState JSON.';

-- ---------- simulations -------------------------------------------------------
-- A live simulation instance derived from a world. current_state is the latest
-- recomputed WorldState; latest_version tracks the highest snapshot number.
create table if not exists public.simulations (
  id             uuid primary key default gen_random_uuid(),
  world_id       uuid not null references public.worlds(id) on delete cascade,
  name           text not null,
  universe_type  text not null default 'standard-physics',
  current_state  jsonb not null default '{}'::jsonb,   -- latest WorldState
  latest_version int not null default 1,
  status         text not null default 'active',
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.simulations is
  'WorldForge: live simulation instances; current_state is the latest recomputed WorldState.';

-- ---------- simulation_versions ----------------------------------------------
-- Immutable snapshot of a simulation at a given version number (WorldVersion).
-- Append-only by convention; no updated_at (snapshots never change).
create table if not exists public.simulation_versions (
  id             uuid primary key default gen_random_uuid(),
  simulation_id  uuid not null references public.simulations(id) on delete cascade,
  version        int not null,
  label          text,
  world_state    jsonb not null,        -- frozen WorldState snapshot
  evaluation     jsonb,                 -- WorldEvaluation at this version
  parent_version int,                   -- prior version this was derived from
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (simulation_id, version)
);
comment on table public.simulation_versions is
  'WorldForge: immutable WorldVersion snapshots; unique per (simulation_id, version).';

-- ---------- scenarios ---------------------------------------------------------
-- A named set of tunable parameter changes applied to a simulation, plus a
-- summary of the recomputed result.
create table if not exists public.scenarios (
  id             uuid primary key default gen_random_uuid(),
  simulation_id  uuid not null references public.simulations(id) on delete cascade,
  name           text not null,
  description    text,
  parameters     jsonb not null default '{}'::jsonb,   -- tunable param changes
  result_summary jsonb,                                -- recomputed result summary
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.scenarios is
  'WorldForge: named parameter-change scenarios + their recomputed result summary.';

-- ---------- counterfactuals ---------------------------------------------------
-- A "what if X were different" experiment: a modification, the resulting impact
-- chain across the dependency graph, a natural-language explanation, confidence,
-- and how many graph nodes were affected (Counterfactual + CounterfactualResult).
create table if not exists public.counterfactuals (
  id             uuid primary key default gen_random_uuid(),
  simulation_id  uuid not null references public.simulations(id) on delete cascade,
  name           text not null,
  modification   jsonb not null default '{}'::jsonb,   -- the counterfactual change
  impact_chain   jsonb,                                -- propagated WorldDiff chain
  explanation    text,
  confidence     numeric check (confidence >= 0 and confidence <= 1),
  affected_nodes int,
  base_version   int,                                  -- version the CF branched from
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.counterfactuals is
  'WorldForge: counterfactual experiments with propagated impact chains + provenance.';

-- ---------- world_timelines ---------------------------------------------------
-- A generated timeline (TimelineEvent[]) spanning a number of years, of a given
-- kind (evolution / civilization / planetary / stellar).
create table if not exists public.world_timelines (
  id             uuid primary key default gen_random_uuid(),
  simulation_id  uuid not null references public.simulations(id) on delete cascade,
  kind           text not null check (kind in ('evolution','civilization','planetary','stellar')),
  span_years     numeric,
  events         jsonb not null default '[]'::jsonb,   -- TimelineEvent[]
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.world_timelines is
  'WorldForge: generated TimelineEvent sequences (evolution/civilization/planetary/stellar).';

-- ---------- simulation_provenance --------------------------------------------
-- Per-node provenance/traceability for computed outputs. Mirrors the engine's
-- Provenance {source, reason, dependsOn[], confidence, scientificConfidence}.
-- This ties WorldForge into the platform's provenance/traceability principle:
-- every computed node resolves back to its source, reasoning, dependencies, and
-- a Scientific Confidence tier.
create table if not exists public.simulation_provenance (
  id              uuid primary key default gen_random_uuid(),
  simulation_id   uuid not null references public.simulations(id) on delete cascade,
  node_id         text,
  source          text,
  reason          text,
  depends_on      text[] not null default array[]::text[],
  confidence      numeric check (confidence >= 0 and confidence <= 1),
  scientific_tier text check (scientific_tier in (
                    'known-science','plausible-science','speculative',
                    'fictional','violates-known-physics')),
  created_at      timestamptz not null default now()
);
comment on table public.simulation_provenance is
  'WorldForge: per-node Provenance (source/reason/dependsOn/confidence/scientific tier).';

-- =============================================================================
-- 2. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_worlds_universe_type        on public.worlds(universe_type);
create index if not exists idx_worlds_created_by            on public.worlds(created_by);
create index if not exists idx_worlds_tags_gin             on public.worlds using gin (tags);

create index if not exists idx_simulations_world_id         on public.simulations(world_id);
create index if not exists idx_simulations_created_by       on public.simulations(created_by);

create index if not exists idx_sim_versions_simulation_id   on public.simulation_versions(simulation_id);
create index if not exists idx_sim_versions_created_by      on public.simulation_versions(created_by);

create index if not exists idx_scenarios_simulation_id      on public.scenarios(simulation_id);
create index if not exists idx_scenarios_created_by         on public.scenarios(created_by);

create index if not exists idx_counterfactuals_simulation_id on public.counterfactuals(simulation_id);
create index if not exists idx_counterfactuals_created_by    on public.counterfactuals(created_by);

create index if not exists idx_world_timelines_simulation_id on public.world_timelines(simulation_id);
create index if not exists idx_world_timelines_created_by     on public.world_timelines(created_by);

create index if not exists idx_sim_provenance_simulation_id  on public.simulation_provenance(simulation_id);
create index if not exists idx_sim_provenance_scientific_tier on public.simulation_provenance(scientific_tier);

-- =============================================================================
-- 3. updated_at TRIGGERS (only tables that carry updated_at)
--    Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
do $$
declare
  t text;
  wf_mutable_tables text[] := array['worlds','simulations','scenarios'];
begin
  foreach t in array wf_mutable_tables loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;

-- =============================================================================
-- 4. PUBLICITY HELPER (SECURITY DEFINER)
--    Returns true when a simulation's parent world is public. Used by child
--    tables to grant viewer/anon read access without exposing private worlds.
--    SECURITY DEFINER so the EXISTS check can read worlds/simulations regardless
--    of the caller's own RLS, while remaining strictly read-only.
-- =============================================================================
create or replace function public.simulation_is_public(sim uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.simulations s
    join public.worlds w on w.id = s.world_id
    where s.id = sim
      and w.is_public = true
  );
$$;

comment on function public.simulation_is_public(uuid) is
  'WorldForge: true when the simulation''s parent world is public (is_public).';

-- =============================================================================
-- 5. ENABLE RLS on every new table
-- =============================================================================
alter table public.worlds                enable row level security;
alter table public.simulations           enable row level security;
alter table public.simulation_versions   enable row level security;
alter table public.scenarios             enable row level security;
alter table public.counterfactuals       enable row level security;
alter table public.world_timelines       enable row level security;
alter table public.simulation_provenance enable row level security;

-- =============================================================================
-- 6. POLICIES
-- Convention (matches 0002): permissive policies are OR-combined. A row is
-- visible/writable if ANY policy allows it. Layers:
--   *_owner_all   -> created_by = auth.uid(): full CRUD on own rows.
--   *_curator_*   -> is_reviewer_or_admin(): read all + write.
--   *_public_read -> viewer/anon read of public rows only.
-- =============================================================================

-- ---------- worlds ------------------------------------------------------------
drop policy if exists worlds_owner_all   on public.worlds;
drop policy if exists worlds_curator_read on public.worlds;
drop policy if exists worlds_curator_ins  on public.worlds;
drop policy if exists worlds_curator_upd  on public.worlds;
drop policy if exists worlds_public_read  on public.worlds;

create policy worlds_owner_all on public.worlds
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy worlds_curator_read on public.worlds
  for select using (public.is_reviewer_or_admin());
create policy worlds_curator_ins on public.worlds
  for insert with check (public.is_reviewer_or_admin());
create policy worlds_curator_upd on public.worlds
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy worlds_public_read on public.worlds
  for select using (is_public = true);

-- ---------- simulations -------------------------------------------------------
drop policy if exists simulations_owner_all    on public.simulations;
drop policy if exists simulations_curator_read on public.simulations;
drop policy if exists simulations_curator_ins  on public.simulations;
drop policy if exists simulations_curator_upd  on public.simulations;
drop policy if exists simulations_public_read  on public.simulations;

create policy simulations_owner_all on public.simulations
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy simulations_curator_read on public.simulations
  for select using (public.is_reviewer_or_admin());
create policy simulations_curator_ins on public.simulations
  for insert with check (public.is_reviewer_or_admin());
create policy simulations_curator_upd on public.simulations
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
-- Viewer/anon: readable only when the parent world is public.
create policy simulations_public_read on public.simulations
  for select using (
    exists (
      select 1 from public.worlds w
      where w.id = simulations.world_id
        and w.is_public = true
    )
  );

-- ---------- simulation_versions ----------------------------------------------
drop policy if exists sim_versions_owner_all    on public.simulation_versions;
drop policy if exists sim_versions_curator_read on public.simulation_versions;
drop policy if exists sim_versions_curator_ins  on public.simulation_versions;
drop policy if exists sim_versions_public_read  on public.simulation_versions;

create policy sim_versions_owner_all on public.simulation_versions
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy sim_versions_curator_read on public.simulation_versions
  for select using (public.is_reviewer_or_admin());
create policy sim_versions_curator_ins on public.simulation_versions
  for insert with check (public.is_reviewer_or_admin());
create policy sim_versions_public_read on public.simulation_versions
  for select using (public.simulation_is_public(simulation_versions.simulation_id));

-- ---------- scenarios ---------------------------------------------------------
drop policy if exists scenarios_owner_all    on public.scenarios;
drop policy if exists scenarios_curator_read on public.scenarios;
drop policy if exists scenarios_curator_ins  on public.scenarios;
drop policy if exists scenarios_curator_upd  on public.scenarios;
drop policy if exists scenarios_public_read  on public.scenarios;

create policy scenarios_owner_all on public.scenarios
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy scenarios_curator_read on public.scenarios
  for select using (public.is_reviewer_or_admin());
create policy scenarios_curator_ins on public.scenarios
  for insert with check (public.is_reviewer_or_admin());
create policy scenarios_curator_upd on public.scenarios
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy scenarios_public_read on public.scenarios
  for select using (public.simulation_is_public(scenarios.simulation_id));

-- ---------- counterfactuals ---------------------------------------------------
drop policy if exists counterfactuals_owner_all    on public.counterfactuals;
drop policy if exists counterfactuals_curator_read on public.counterfactuals;
drop policy if exists counterfactuals_curator_ins  on public.counterfactuals;
drop policy if exists counterfactuals_public_read  on public.counterfactuals;

create policy counterfactuals_owner_all on public.counterfactuals
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy counterfactuals_curator_read on public.counterfactuals
  for select using (public.is_reviewer_or_admin());
create policy counterfactuals_curator_ins on public.counterfactuals
  for insert with check (public.is_reviewer_or_admin());
create policy counterfactuals_public_read on public.counterfactuals
  for select using (public.simulation_is_public(counterfactuals.simulation_id));

-- ---------- world_timelines ---------------------------------------------------
drop policy if exists world_timelines_owner_all    on public.world_timelines;
drop policy if exists world_timelines_curator_read on public.world_timelines;
drop policy if exists world_timelines_curator_ins  on public.world_timelines;
drop policy if exists world_timelines_public_read  on public.world_timelines;

create policy world_timelines_owner_all on public.world_timelines
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy world_timelines_curator_read on public.world_timelines
  for select using (public.is_reviewer_or_admin());
create policy world_timelines_curator_ins on public.world_timelines
  for insert with check (public.is_reviewer_or_admin());
create policy world_timelines_public_read on public.world_timelines
  for select using (public.simulation_is_public(world_timelines.simulation_id));

-- ---------- simulation_provenance --------------------------------------------
drop policy if exists sim_provenance_owner_all    on public.simulation_provenance;
drop policy if exists sim_provenance_curator_read on public.simulation_provenance;
drop policy if exists sim_provenance_curator_ins  on public.simulation_provenance;
drop policy if exists sim_provenance_public_read  on public.simulation_provenance;

create policy sim_provenance_owner_all on public.simulation_provenance
  for all using (
    exists (
      select 1 from public.simulations s
      where s.id = simulation_provenance.simulation_id
        and s.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.simulations s
      where s.id = simulation_provenance.simulation_id
        and s.created_by = auth.uid()
    )
  );
create policy sim_provenance_curator_read on public.simulation_provenance
  for select using (public.is_reviewer_or_admin());
create policy sim_provenance_curator_ins on public.simulation_provenance
  for insert with check (public.is_reviewer_or_admin());
create policy sim_provenance_public_read on public.simulation_provenance
  for select using (public.simulation_is_public(simulation_provenance.simulation_id));

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. Server-side simulation
-- jobs (recompute, versioning, seeding) use it. NEVER expose it to clients.
-- =============================================================================

-- =============================================================================
-- End of 0005_worldforge.sql
-- =============================================================================
