-- =============================================================================
-- Human Signal Index — 0014_temporal_intelligence.sql
-- WorldForge / HSI (Phase 10) — Temporal Intelligence.
--
-- Phase 10 adds a TEMPORAL layer over the narrative-intelligence graph: it captures
-- point-in-time SNAPSHOTS of each narrative's shape, derives EVOLUTION events between
-- consecutive snapshots, tracks cross-narrative GENEALOGY (lineage) and INFLUENCE,
-- and produces FORECASTS of each narrative's near-term trajectory. Together these
-- power the WorldForge "history / forecast" bridge over time.
--   * hsin_narrative_snapshots  — point-in-time metrics for a narrative;
--   * hsin_narrative_evolution  — a typed change between two snapshots of a narrative;
--   * hsin_narrative_genealogy  — a typed lineage edge between two narratives;
--   * hsin_narrative_influence  — a directed influence score between two narratives;
--   * hsin_narrative_forecasts  — a probabilistic trajectory forecast for a narrative.
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7–9 / migrations 0011-0013).
-- ---------------------------------------------------------------------------
-- Every Phase-10 table uses the `hsin_` prefix and references the Phase-8 narrative
-- table public.hsin_narratives(id) (created in 0012), plus, for evolution edges, the
-- Phase-10 snapshot table itself.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY. It creates 5 new `hsin_`-prefixed tables (+ indexes,
-- RLS, policies). It does NOT edit migrations 0001-0013, drop existing
-- policies/roles/helpers, or touch any existing table/RLS.
--
-- CONVENTIONS (match 0001-0013):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz default now().
--   - FKs to public.hsin_narratives(id) on delete cascade.
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_reviewer_or_above(),
--       public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- TABLE SHAPE NOTE:
--   These are APPEND / RECOMPUTE tables (a temporal worker captures snapshots,
--   recomputes evolution/genealogy/influence, and regenerates forecasts). They are
--   intentionally WITHOUT an updated_at column / set_updated_at trigger — rows are
--   inserted (and, for the unique-keyed genealogy/influence tables, upserted) rather
--   than mutated in place. Consistent across all 5 tables.
--
-- ROLE / ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   All 5 tables are part of the SHARED narrative-intelligence graph (like
--   hsin_narratives in 0011/0012 and the shared-intelligence tables in 0013):
--     authenticated READ (auth.uid() is not null);
--     researcher+ INSERT/UPDATE/DELETE (public.is_researcher_or_above());
--     admin all (public.is_admin()).
--   The background TEMPORAL WORKER uses the Supabase service_role key, which
--   BYPASSES RLS entirely — it captures snapshots, recomputes evolution/genealogy/
--   influence, and regenerates forecasts without needing these policies. The
--   policies below govern only user-facing (per-request, cookie-backed) access.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

-- ---------- hsin_narrative_snapshots ------------------------------------------
-- A point-in-time capture of a narrative's shape: signal/source/community counts
-- plus the derived amplification/reliability and support/contradiction ratios at
-- captured_at. The evolution layer diffs consecutive snapshots of a narrative.
create table if not exists public.hsin_narrative_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  narrative_id        uuid not null references public.hsin_narratives(id) on delete cascade,
  captured_at         timestamptz not null default now(),
  signal_count        int default 0,
  source_count        int default 0,
  community_count     int default 0,
  amplification_score numeric,
  reliability_score   numeric,
  support_ratio       numeric,
  contradiction_ratio numeric,
  metadata            jsonb,
  created_at          timestamptz not null default now()
);
comment on table public.hsin_narrative_snapshots is
  'HSIN Phase 10: point-in-time metrics for a narrative (counts + derived scores/ratios) at captured_at.';

-- ---------- hsin_narrative_evolution ------------------------------------------
-- A typed change observed between two snapshots of the SAME narrative (parent ->
-- child): growth/decline/mutation/split/merge, with a growth percentage, confidence,
-- and the underlying metrics/reasoning. Parent/child snapshot FKs set null on delete
-- so the evolution record survives snapshot pruning.
create table if not exists public.hsin_narrative_evolution (
  id                 uuid primary key default gen_random_uuid(),
  narrative_id       uuid references public.hsin_narratives(id) on delete cascade,
  parent_snapshot_id uuid references public.hsin_narrative_snapshots(id) on delete set null,
  child_snapshot_id  uuid references public.hsin_narrative_snapshots(id) on delete set null,
  change_type        text check (change_type in ('growth','decline','mutation','split','merge')),
  growth_pct         numeric,
  confidence         numeric check (confidence >= 0 and confidence <= 1),
  metrics_json       jsonb,
  reasoning_json     jsonb,
  created_at         timestamptz not null default now()
);
comment on table public.hsin_narrative_evolution is
  'HSIN Phase 10: a typed change (growth/decline/mutation/split/merge) between two snapshots of a narrative.';

-- ---------- hsin_narrative_genealogy ------------------------------------------
-- A typed lineage edge BETWEEN two narratives (parent -> child): derived_from /
-- split_from / merged_from / contradicts / amplifies, with confidence, the count of
-- shared entities/sources, a similarity score, and a rationale. unique on
-- (parent, child, relationship) keeps one edge per relationship per pair.
create table if not exists public.hsin_narrative_genealogy (
  id                  uuid primary key default gen_random_uuid(),
  parent_narrative_id uuid references public.hsin_narratives(id) on delete cascade,
  child_narrative_id  uuid references public.hsin_narratives(id) on delete cascade,
  relationship        text check (relationship in ('derived_from','split_from','merged_from','contradicts','amplifies')),
  confidence          numeric check (confidence >= 0 and confidence <= 1),
  shared_entities     int,
  shared_sources      int,
  similarity          numeric,
  rationale           text,
  created_at          timestamptz not null default now(),
  unique (parent_narrative_id, child_narrative_id, relationship)
);
comment on table public.hsin_narrative_genealogy is
  'HSIN Phase 10: a typed lineage edge between two narratives; unique per (parent, child, relationship).';

-- ---------- hsin_narrative_influence ------------------------------------------
-- A directed INFLUENCE score (0..100) from a source narrative onto a target
-- narrative, backed by shared entity/source/community counts and a rationale.
-- unique on (source, target) keeps a single live influence edge per ordered pair.
create table if not exists public.hsin_narrative_influence (
  id                  uuid primary key default gen_random_uuid(),
  source_narrative_id uuid references public.hsin_narratives(id) on delete cascade,
  target_narrative_id uuid references public.hsin_narratives(id) on delete cascade,
  influence_score     numeric check (influence_score >= 0 and influence_score <= 100),
  shared_entities     int,
  shared_sources      int,
  shared_communities  int,
  rationale           text,
  created_at          timestamptz not null default now(),
  unique (source_narrative_id, target_narrative_id)
);
comment on table public.hsin_narrative_influence is
  'HSIN Phase 10: a directed influence score (0..100) between two narratives; unique per (source, target).';

-- ---------- hsin_narrative_forecasts ------------------------------------------
-- A probabilistic trajectory forecast for a narrative: a forecast_type state
-- (emerging/rising/stable/declining/dead) with its probability (0..1), the reasoning,
-- and the full state distribution. generated_at stamps the forecast run.
create table if not exists public.hsin_narrative_forecasts (
  id                uuid primary key default gen_random_uuid(),
  narrative_id      uuid references public.hsin_narratives(id) on delete cascade,
  forecast_type     text check (forecast_type in ('emerging','rising','stable','declining','dead')),
  probability       numeric check (probability >= 0 and probability <= 1),
  reasoning         jsonb,
  distribution_json jsonb,
  generated_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
comment on table public.hsin_narrative_forecasts is
  'HSIN Phase 10: a probabilistic trajectory forecast (emerging/rising/stable/declining/dead) for a narrative.';

-- =============================================================================
-- B. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_narrative_snapshots_narrative_captured
  on public.hsin_narrative_snapshots(narrative_id, captured_at);
create index if not exists idx_hsin_narrative_snapshots_captured_at
  on public.hsin_narrative_snapshots(captured_at);

create index if not exists idx_hsin_narrative_evolution_narrative_id on public.hsin_narrative_evolution(narrative_id);
create index if not exists idx_hsin_narrative_evolution_change_type  on public.hsin_narrative_evolution(change_type);
create index if not exists idx_hsin_narrative_evolution_created_at   on public.hsin_narrative_evolution(created_at);

create index if not exists idx_hsin_narrative_genealogy_parent       on public.hsin_narrative_genealogy(parent_narrative_id);
create index if not exists idx_hsin_narrative_genealogy_child        on public.hsin_narrative_genealogy(child_narrative_id);
create index if not exists idx_hsin_narrative_genealogy_relationship on public.hsin_narrative_genealogy(relationship);

create index if not exists idx_hsin_narrative_influence_source on public.hsin_narrative_influence(source_narrative_id);
create index if not exists idx_hsin_narrative_influence_target on public.hsin_narrative_influence(target_narrative_id);
create index if not exists idx_hsin_narrative_influence_score  on public.hsin_narrative_influence(influence_score);

create index if not exists idx_hsin_narrative_forecasts_narrative_id  on public.hsin_narrative_forecasts(narrative_id);
create index if not exists idx_hsin_narrative_forecasts_forecast_type on public.hsin_narrative_forecasts(forecast_type);
create index if not exists idx_hsin_narrative_forecasts_generated_at  on public.hsin_narrative_forecasts(generated_at);

-- =============================================================================
-- C. ENABLE RLS on all 5 new tables
-- =============================================================================
alter table public.hsin_narrative_snapshots enable row level security;
alter table public.hsin_narrative_evolution enable row level security;
alter table public.hsin_narrative_genealogy enable row level security;
alter table public.hsin_narrative_influence enable row level security;
alter table public.hsin_narrative_forecasts enable row level security;

-- =============================================================================
-- D. POLICIES
-- Convention (matches 0002/0010/0011/0012/0013): permissive policies are OR-combined —
-- a row is visible/writable if ANY policy allows it. All 5 Phase-10 tables share the
-- SHARED-INTELLIGENCE shape (like hsin_narratives + the 0013 shared-intelligence tables):
--   authenticated READ; researcher+ INSERT/UPDATE/DELETE; admin all.
-- The background temporal worker uses the service_role key and bypasses ALL of these.
-- =============================================================================

-- ---------- hsin_narrative_snapshots ------------------------------------------
drop policy if exists hsin_narrative_snapshots_admin_all      on public.hsin_narrative_snapshots;
drop policy if exists hsin_narrative_snapshots_auth_read      on public.hsin_narrative_snapshots;
drop policy if exists hsin_narrative_snapshots_researcher_ins on public.hsin_narrative_snapshots;
drop policy if exists hsin_narrative_snapshots_researcher_upd on public.hsin_narrative_snapshots;
drop policy if exists hsin_narrative_snapshots_researcher_del on public.hsin_narrative_snapshots;

create policy hsin_narrative_snapshots_admin_all on public.hsin_narrative_snapshots
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_snapshots_auth_read on public.hsin_narrative_snapshots
  for select using (auth.uid() is not null);
create policy hsin_narrative_snapshots_researcher_ins on public.hsin_narrative_snapshots
  for insert with check (public.is_researcher_or_above());
create policy hsin_narrative_snapshots_researcher_upd on public.hsin_narrative_snapshots
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_narrative_snapshots_researcher_del on public.hsin_narrative_snapshots
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_narrative_evolution ------------------------------------------
drop policy if exists hsin_narrative_evolution_admin_all      on public.hsin_narrative_evolution;
drop policy if exists hsin_narrative_evolution_auth_read      on public.hsin_narrative_evolution;
drop policy if exists hsin_narrative_evolution_researcher_ins on public.hsin_narrative_evolution;
drop policy if exists hsin_narrative_evolution_researcher_upd on public.hsin_narrative_evolution;
drop policy if exists hsin_narrative_evolution_researcher_del on public.hsin_narrative_evolution;

create policy hsin_narrative_evolution_admin_all on public.hsin_narrative_evolution
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_evolution_auth_read on public.hsin_narrative_evolution
  for select using (auth.uid() is not null);
create policy hsin_narrative_evolution_researcher_ins on public.hsin_narrative_evolution
  for insert with check (public.is_researcher_or_above());
create policy hsin_narrative_evolution_researcher_upd on public.hsin_narrative_evolution
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_narrative_evolution_researcher_del on public.hsin_narrative_evolution
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_narrative_genealogy ------------------------------------------
drop policy if exists hsin_narrative_genealogy_admin_all      on public.hsin_narrative_genealogy;
drop policy if exists hsin_narrative_genealogy_auth_read      on public.hsin_narrative_genealogy;
drop policy if exists hsin_narrative_genealogy_researcher_ins on public.hsin_narrative_genealogy;
drop policy if exists hsin_narrative_genealogy_researcher_upd on public.hsin_narrative_genealogy;
drop policy if exists hsin_narrative_genealogy_researcher_del on public.hsin_narrative_genealogy;

create policy hsin_narrative_genealogy_admin_all on public.hsin_narrative_genealogy
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_genealogy_auth_read on public.hsin_narrative_genealogy
  for select using (auth.uid() is not null);
create policy hsin_narrative_genealogy_researcher_ins on public.hsin_narrative_genealogy
  for insert with check (public.is_researcher_or_above());
create policy hsin_narrative_genealogy_researcher_upd on public.hsin_narrative_genealogy
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_narrative_genealogy_researcher_del on public.hsin_narrative_genealogy
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_narrative_influence ------------------------------------------
drop policy if exists hsin_narrative_influence_admin_all      on public.hsin_narrative_influence;
drop policy if exists hsin_narrative_influence_auth_read      on public.hsin_narrative_influence;
drop policy if exists hsin_narrative_influence_researcher_ins on public.hsin_narrative_influence;
drop policy if exists hsin_narrative_influence_researcher_upd on public.hsin_narrative_influence;
drop policy if exists hsin_narrative_influence_researcher_del on public.hsin_narrative_influence;

create policy hsin_narrative_influence_admin_all on public.hsin_narrative_influence
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_influence_auth_read on public.hsin_narrative_influence
  for select using (auth.uid() is not null);
create policy hsin_narrative_influence_researcher_ins on public.hsin_narrative_influence
  for insert with check (public.is_researcher_or_above());
create policy hsin_narrative_influence_researcher_upd on public.hsin_narrative_influence
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_narrative_influence_researcher_del on public.hsin_narrative_influence
  for delete using (public.is_researcher_or_above());

-- ---------- hsin_narrative_forecasts ------------------------------------------
drop policy if exists hsin_narrative_forecasts_admin_all      on public.hsin_narrative_forecasts;
drop policy if exists hsin_narrative_forecasts_auth_read      on public.hsin_narrative_forecasts;
drop policy if exists hsin_narrative_forecasts_researcher_ins on public.hsin_narrative_forecasts;
drop policy if exists hsin_narrative_forecasts_researcher_upd on public.hsin_narrative_forecasts;
drop policy if exists hsin_narrative_forecasts_researcher_del on public.hsin_narrative_forecasts;

create policy hsin_narrative_forecasts_admin_all on public.hsin_narrative_forecasts
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_forecasts_auth_read on public.hsin_narrative_forecasts
  for select using (auth.uid() is not null);
create policy hsin_narrative_forecasts_researcher_ins on public.hsin_narrative_forecasts
  for insert with check (public.is_researcher_or_above());
create policy hsin_narrative_forecasts_researcher_upd on public.hsin_narrative_forecasts
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());
create policy hsin_narrative_forecasts_researcher_del on public.hsin_narrative_forecasts
  for delete using (public.is_researcher_or_above());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background temporal
-- worker (capturing snapshots, recomputing evolution/genealogy/influence, and
-- regenerating forecasts) uses it. User-facing reads/writes go through the
-- per-request, cookie-backed client and are authorized by the policies above.
-- NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0014_temporal_intelligence.sql
-- =============================================================================
