-- =============================================================================
-- Human Signal Index — 0007_research_agents.sql
-- WorldForge (Phase 3) — multi-agent RESEARCH layer persistence schema.
--
-- The research layer turns a free-text world CONCEPT into a structured, traceable,
-- debate-ready simulation BLUEPRINT *before* a world is generated. 9 domain agents
-- reason in dependency order, a skeptic falsifies the weakest claims, and a
-- consensus agent synthesizes a buildable blueprint (see the '@hsi/research-agents'
-- engine). This migration persists each run + its agent outputs, consensus report,
-- citations, and disputes, and links a run to the world it eventually generates.
--
-- CONVENTIONS (match 0001-0006):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz default now().
--   - mutable tables get an updated_at column + the shared public.set_updated_at()
--     BEFORE UPDATE trigger from 0003.
--   - `created_by uuid references public.users(id) on delete set null` — and
--     public.users.id == auth.uid() (mirrored by 0006_auth_users_trigger).
--   - RLS via the helpers from 0002: public.is_admin(), public.is_reviewer_or_admin().
--   - jsonb columns hold canonical engine payloads (AgentOutput, ConsensusReport,
--     SimulationBlueprint, ...). SQL constrains shape lightly (numeric ranges +
--     enum-style text guards) and the application writes the FULL objects.
--
-- ROLE MODEL (re-uses HSI roles, mirrors 0005_worldforge):
--   owner            -> the creating user (research_runs.created_by = auth.uid()):
--                       full CRUD on their own runs and all child rows.
--   admin / reviewer -> is_reviewer_or_admin(): read all + write all (curation).
--   viewer / anon    -> read ONLY rows belonging to a PUBLIC run. A run is public
--                       when research_runs.is_public = true; child tables inherit
--                       publicity from their parent run via the SECURITY DEFINER
--                       helper public.research_run_is_public().
-- =============================================================================

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------- research_runs -----------------------------------------------------
-- One full research run: the parsed concept, run status, top-line consensus
-- metrics, the synthesized SimulationBlueprint, and (once generated) the world.
create table if not exists public.research_runs (
  id                 uuid primary key default gen_random_uuid(),
  created_by         uuid references public.users(id) on delete set null,
  title              text,
  concept_text       text not null,                       -- raw user concept text
  concept_signals    jsonb,                               -- parsed ConceptSignals
  status             text not null default 'complete'
                       check (status in ('pending','running','complete','failed')),
  overall_confidence numeric check (overall_confidence >= 0 and overall_confidence <= 100),
  agreement_score    numeric check (agreement_score >= 0 and agreement_score <= 100),
  blueprint          jsonb,                               -- SimulationBlueprint
  world_id           uuid references public.worlds(id) on delete set null,
  is_public          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.research_runs is
  'WorldForge Phase 3: a multi-agent research run; blueprint is the synthesized SimulationBlueprint, world_id the generated world (if any).';

-- ---------- research_agent_outputs -------------------------------------------
-- One row per agent that participated in a run (the 9 domain agents + skeptic +
-- the consensus agent). `output` holds the full AgentOutput / ConsensusReport JSON.
create table if not exists public.research_agent_outputs (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.research_runs(id) on delete cascade,
  domain            text not null,                        -- AgentDomain (incl 'consensus')
  title             text,
  output            jsonb not null,                       -- AgentOutput / ConsensusReport
  confidence_score  numeric,
  uncertainty_score numeric,
  created_at        timestamptz not null default now()
);
comment on table public.research_agent_outputs is
  'WorldForge Phase 3: per-agent AgentOutput payloads for a run (domain incl skeptic/consensus).';

-- ---------- research_consensus_reports ---------------------------------------
-- The single consensus synthesis for a run (ConsensusReport).
create table if not exists public.research_consensus_reports (
  id                       uuid primary key default gen_random_uuid(),
  run_id                   uuid not null references public.research_runs(id) on delete cascade,
  report                   jsonb not null,                -- full ConsensusReport
  overall_confidence       numeric,
  agreement_score          numeric,
  classification_breakdown jsonb,                         -- claims per ScientificConfidenceTier
  created_at               timestamptz not null default now()
);
comment on table public.research_consensus_reports is
  'WorldForge Phase 3: the consensus synthesis (ConsensusReport) for a run.';

-- ---------- research_citations ------------------------------------------------
-- Flattened citations from every agent (Citation, placeholders in Phase 3).
create table if not exists public.research_citations (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.research_runs(id) on delete cascade,
  agent_domain text,                                      -- domain that cited it
  label        text not null,
  kind         text not null default 'placeholder',
  note         text,
  created_at   timestamptz not null default now()
);
comment on table public.research_citations is
  'WorldForge Phase 3: flattened agent citations (placeholders in Phase 3).';

-- ---------- research_disputes -------------------------------------------------
-- Skeptic challenges raised against specific claims/domains (Dispute).
create table if not exists public.research_disputes (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.research_runs(id) on delete cascade,
  raised_by       text not null default 'skeptic',
  target_domain   text,
  target_claim_id text,
  severity        text check (severity in ('low','medium','high')),
  challenge       text not null,
  resolution      text,
  status          text not null default 'open'
                    check (status in ('open','mitigated','accepted')),
  created_at      timestamptz not null default now()
);
comment on table public.research_disputes is
  'WorldForge Phase 3: skeptic disputes raised against agent claims/domains.';

-- =============================================================================
-- 2. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_research_runs_created_by   on public.research_runs(created_by);
create index if not exists idx_research_runs_is_public     on public.research_runs(is_public);
create index if not exists idx_research_runs_world_id      on public.research_runs(world_id);

create index if not exists idx_research_agent_outputs_run_id on public.research_agent_outputs(run_id);
create index if not exists idx_research_agent_outputs_domain on public.research_agent_outputs(domain);

create index if not exists idx_research_consensus_reports_run_id on public.research_consensus_reports(run_id);

create index if not exists idx_research_citations_run_id   on public.research_citations(run_id);

create index if not exists idx_research_disputes_run_id    on public.research_disputes(run_id);

-- =============================================================================
-- 3. updated_at TRIGGER (only research_runs carries updated_at)
--    Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.research_runs;
create trigger trg_set_updated_at before update on public.research_runs
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. PUBLICITY HELPER (SECURITY DEFINER)
--    Returns true when a run is public (is_public). Used by child tables to grant
--    viewer/anon read access without exposing private runs. SECURITY DEFINER so
--    the EXISTS check can read research_runs regardless of the caller's own RLS,
--    while remaining strictly read-only.
-- =============================================================================
create or replace function public.research_run_is_public(run uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.research_runs r
    where r.id = run
      and r.is_public = true
  );
$$;

comment on function public.research_run_is_public(uuid) is
  'WorldForge Phase 3: true when the research run is public (is_public).';

-- =============================================================================
-- 5. ENABLE RLS on every new table
-- =============================================================================
alter table public.research_runs              enable row level security;
alter table public.research_agent_outputs     enable row level security;
alter table public.research_consensus_reports enable row level security;
alter table public.research_citations         enable row level security;
alter table public.research_disputes          enable row level security;

-- =============================================================================
-- 6. POLICIES
-- Convention (matches 0002 + 0005): permissive policies are OR-combined. A row is
-- visible/writable if ANY policy allows it. Layers:
--   *_owner_all   -> owning run's created_by = auth.uid(): full CRUD.
--   *_curator_*   -> is_reviewer_or_admin(): read all + write.
--   *_public_read -> viewer/anon read of public rows only.
-- =============================================================================

-- ---------- research_runs -----------------------------------------------------
drop policy if exists research_runs_owner_all    on public.research_runs;
drop policy if exists research_runs_curator_read on public.research_runs;
drop policy if exists research_runs_curator_ins  on public.research_runs;
drop policy if exists research_runs_curator_upd  on public.research_runs;
drop policy if exists research_runs_public_read  on public.research_runs;

create policy research_runs_owner_all on public.research_runs
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy research_runs_curator_read on public.research_runs
  for select using (public.is_reviewer_or_admin());
create policy research_runs_curator_ins on public.research_runs
  for insert with check (public.is_reviewer_or_admin());
create policy research_runs_curator_upd on public.research_runs
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy research_runs_public_read on public.research_runs
  for select using (is_public = true);

-- ---------- research_agent_outputs -------------------------------------------
drop policy if exists research_agent_outputs_owner_all    on public.research_agent_outputs;
drop policy if exists research_agent_outputs_curator_read on public.research_agent_outputs;
drop policy if exists research_agent_outputs_curator_ins  on public.research_agent_outputs;
drop policy if exists research_agent_outputs_public_read  on public.research_agent_outputs;

create policy research_agent_outputs_owner_all on public.research_agent_outputs
  for all using (
    exists (
      select 1 from public.research_runs r
      where r.id = research_agent_outputs.run_id
        and r.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.research_runs r
      where r.id = research_agent_outputs.run_id
        and r.created_by = auth.uid()
    )
  );
create policy research_agent_outputs_curator_read on public.research_agent_outputs
  for select using (public.is_reviewer_or_admin());
create policy research_agent_outputs_curator_ins on public.research_agent_outputs
  for insert with check (public.is_reviewer_or_admin());
create policy research_agent_outputs_public_read on public.research_agent_outputs
  for select using (public.research_run_is_public(research_agent_outputs.run_id));

-- ---------- research_consensus_reports ---------------------------------------
drop policy if exists research_consensus_owner_all    on public.research_consensus_reports;
drop policy if exists research_consensus_curator_read on public.research_consensus_reports;
drop policy if exists research_consensus_curator_ins  on public.research_consensus_reports;
drop policy if exists research_consensus_public_read  on public.research_consensus_reports;

create policy research_consensus_owner_all on public.research_consensus_reports
  for all using (
    exists (
      select 1 from public.research_runs r
      where r.id = research_consensus_reports.run_id
        and r.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.research_runs r
      where r.id = research_consensus_reports.run_id
        and r.created_by = auth.uid()
    )
  );
create policy research_consensus_curator_read on public.research_consensus_reports
  for select using (public.is_reviewer_or_admin());
create policy research_consensus_curator_ins on public.research_consensus_reports
  for insert with check (public.is_reviewer_or_admin());
create policy research_consensus_public_read on public.research_consensus_reports
  for select using (public.research_run_is_public(research_consensus_reports.run_id));

-- ---------- research_citations ------------------------------------------------
drop policy if exists research_citations_owner_all    on public.research_citations;
drop policy if exists research_citations_curator_read on public.research_citations;
drop policy if exists research_citations_curator_ins  on public.research_citations;
drop policy if exists research_citations_public_read  on public.research_citations;

create policy research_citations_owner_all on public.research_citations
  for all using (
    exists (
      select 1 from public.research_runs r
      where r.id = research_citations.run_id
        and r.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.research_runs r
      where r.id = research_citations.run_id
        and r.created_by = auth.uid()
    )
  );
create policy research_citations_curator_read on public.research_citations
  for select using (public.is_reviewer_or_admin());
create policy research_citations_curator_ins on public.research_citations
  for insert with check (public.is_reviewer_or_admin());
create policy research_citations_public_read on public.research_citations
  for select using (public.research_run_is_public(research_citations.run_id));

-- ---------- research_disputes -------------------------------------------------
drop policy if exists research_disputes_owner_all    on public.research_disputes;
drop policy if exists research_disputes_curator_read on public.research_disputes;
drop policy if exists research_disputes_curator_ins  on public.research_disputes;
drop policy if exists research_disputes_public_read  on public.research_disputes;

create policy research_disputes_owner_all on public.research_disputes
  for all using (
    exists (
      select 1 from public.research_runs r
      where r.id = research_disputes.run_id
        and r.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.research_runs r
      where r.id = research_disputes.run_id
        and r.created_by = auth.uid()
    )
  );
create policy research_disputes_curator_read on public.research_disputes
  for select using (public.is_reviewer_or_admin());
create policy research_disputes_curator_ins on public.research_disputes
  for insert with check (public.is_reviewer_or_admin());
create policy research_disputes_public_read on public.research_disputes
  for select using (public.research_run_is_public(research_disputes.run_id));

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. User-facing research
-- persistence NEVER uses it: the DAL writes through the per-request, cookie-backed
-- client so created_by = auth.uid() and these owner policies authorize the write.
-- =============================================================================

-- =============================================================================
-- End of 0007_research_agents.sql
-- =============================================================================
