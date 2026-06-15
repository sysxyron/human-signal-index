-- =============================================================================
-- Human Signal Index — 0034_intelligence_lineage_graph.sql
-- WorldForge / HSI (Phase 30) — Intelligence Lineage & Traceability Graph.
--
-- Phase 29 inferred some attribution because signals were not explicitly linked to
-- investigations, nor investigations to publications. This migration MATERIALIZES
-- those links so every artifact is traceable end-to-end:
--   Signal → Evidence → Investigation → Publication → Outcome.
--
--   * investigation_signals      — signal ↔ investigation (M:N)
--   * investigation_publications — investigation ↔ publication (M:N)
--   * investigation_evidence     — evidence ↔ investigation (M:N)
--   * publication_evidence       — evidence ↔ publication (M:N, provenance)
--   * graph_health               — APPEND-ONLY lineage health snapshots.
--
-- GOVERNANCE (hard constraints): lineage is traceability only. Nothing here
-- changes auth, middleware, RBAC, user_roles, or IAM. The worker only recomputes
-- and backfills links it can DERIVE; it never writes public.user_roles.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0033. CONVENTIONS match 0001-0033.
-- =============================================================================

-- =============================================================================
-- A. LINK TABLES (M:N, unique-constrained, audited).
-- =============================================================================
create table if not exists public.investigation_signals (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  signal_id        uuid not null references public.hsin_signals(id) on delete cascade,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (signal_id, investigation_id)
);
comment on table public.investigation_signals is 'HSI Phase 30: signal ↔ investigation lineage links (M:N).';
create index if not exists idx_inv_signals_inv on public.investigation_signals(investigation_id);
create index if not exists idx_inv_signals_sig on public.investigation_signals(signal_id);

create table if not exists public.investigation_publications (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  publication_id   uuid not null references public.hsin_publications(id) on delete cascade,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (investigation_id, publication_id)
);
comment on table public.investigation_publications is 'HSI Phase 30: investigation ↔ publication lineage links (M:N).';
create index if not exists idx_inv_pubs_inv on public.investigation_publications(investigation_id);
create index if not exists idx_inv_pubs_pub on public.investigation_publications(publication_id);

create table if not exists public.investigation_evidence (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  evidence_id      uuid not null references public.evidence_sources(id) on delete cascade,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (investigation_id, evidence_id)
);
comment on table public.investigation_evidence is 'HSI Phase 30: evidence ↔ investigation lineage links (M:N).';
create index if not exists idx_inv_evi_inv on public.investigation_evidence(investigation_id);
create index if not exists idx_inv_evi_evi on public.investigation_evidence(evidence_id);

create table if not exists public.publication_evidence (
  id             uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.hsin_publications(id) on delete cascade,
  evidence_id    uuid not null references public.evidence_sources(id) on delete cascade,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (publication_id, evidence_id)
);
comment on table public.publication_evidence is 'HSI Phase 30: evidence ↔ publication lineage links (M:N, provenance).';
create index if not exists idx_pub_evi_pub on public.publication_evidence(publication_id);
create index if not exists idx_pub_evi_evi on public.publication_evidence(evidence_id);

-- =============================================================================
-- B. GRAPH HEALTH — APPEND-ONLY lineage health snapshots (Deliverables 23, 24).
-- =============================================================================
create table if not exists public.graph_health (
  id                  uuid primary key default gen_random_uuid(),
  node_count          integer not null default 0,
  edge_count          integer not null default 0,
  orphan_count        integer not null default 0,
  broken_chain_count  integer not null default 0,
  cycle_count         integer not null default 0,
  chain_completeness  integer not null default 0 check (chain_completeness between 0 and 100),
  average_trace_depth numeric not null default 0,
  coverage            integer not null default 0 check (coverage between 0 and 100),
  health_score        integer not null default 0 check (health_score between 0 and 100),
  computed_at         timestamptz,
  created_at          timestamptz not null default now()
);
comment on table public.graph_health is 'HSI Phase 30: APPEND-ONLY lineage graph health snapshots.';
create index if not exists idx_graph_health_computed on public.graph_health(computed_at desc);

-- =============================================================================
-- C. RLS — link tables: researcher+ READ, reviewer+ WRITE, admin all.
--    graph_health: researcher+ READ, admin all (worker writes via service role).
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['investigation_signals','investigation_publications','investigation_evidence','publication_evidence']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_del', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.is_reviewer_or_above())', t || '_ins', t);
    execute format('create policy %I on public.%I for delete using (public.is_reviewer_or_above())', t || '_del', t);
  end loop;
end$$;

alter table public.graph_health enable row level security;
drop policy if exists graph_health_admin_all on public.graph_health;
drop policy if exists graph_health_read on public.graph_health;
create policy graph_health_admin_all on public.graph_health
  for all using (public.is_admin()) with check (public.is_admin());
create policy graph_health_read on public.graph_health
  for select using (public.is_researcher_or_above());

-- =============================================================================
-- NOTE
-- The Phase-30 worker BACKFILLS publication_evidence from the research-runs
-- pipeline (evidence_sources.research_run_id ⋈ hsin_publications.run_id) and
-- computes graph_health. Signal↔investigation / investigation↔publication links
-- are written by the new reviewer+ link actions (and any future wiring). The
-- lineage engine + outcome attribution consume these MATERIALIZED links instead
-- of inferred chains. No autonomous role changes.
-- =============================================================================

-- =============================================================================
-- End of 0034_intelligence_lineage_graph.sql
-- =============================================================================
