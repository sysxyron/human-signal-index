-- =============================================================================
-- Human Signal Index — 0022_research_orchestration.sql
-- WorldForge / HSI (Phase 18) — Autonomous Research Orchestration & Intelligence
-- Operations Center.
--
-- Phase 18 turns the Phase 1-17 engines into a continuously-operating system: a
-- research-run state machine, a priority queue, agent coordination, automated
-- opportunity discovery, escalation, workflow templates, and platform health —
-- all human-governed, auditable, and reversible. This migration persists that
-- operations layer:
--
--   * hsin_research_runs         — the unit of orchestrated work: state, priority,
--       workflow, agent/evidence/confidence/trust/outcome rollups.
--   * hsin_research_run_events   — APPEND-ONLY audited state transitions (from→to,
--       actor, reason) — the run's replayable history. NOTHING overwrites it.
--   * hsin_research_tasks        — agent tasks attached to a run stage (state,
--       attempts, runtime, last error).
--   * hsin_research_queue        — the durable priority queue (survives restarts):
--       item status, priority, attempts, backoff (available_at).
--   * hsin_research_opportunities— PROPOSED research opportunities (never
--       auto-published) from discovery.
--   * hsin_research_escalations  — issues requiring human attention (trigger,
--       severity, evidence, recommendation). Never auto-resolved.
--   * hsin_agent_assignments     — APPEND-ONLY record of which agent served which
--       run stage.
--   * hsin_workflow_templates    — reusable workflow definitions (stages, required
--       agents/evidence, governance flag).
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7-17 / migrations 0011-0021).
-- ---------------------------------------------------------------------------
-- A research run's `id` is a uuid PK; child tables FK to it. `entity_id` /
-- opportunity / escalation references that point at the polymorphic intelligence
-- graph (signals/narratives/sources) are text (no FK), as in Phases 16-17.
-- created_by / reviewer / actor user references → public.users(id) on delete set
-- null.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY. It does NOT edit migrations 0001-0021, drop
-- existing policies/roles/helpers, or touch any other existing table/RLS.
--
-- CONVENTIONS (match 0001-0021):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz not null default now().
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - The shared public.set_updated_at() trigger (from 0003) is attached to the
--     mutable tables (runs, tasks, queue, opportunities, escalations, templates).
--     The two APPEND-ONLY tables (run_events, agent_assignments) carry no trigger.
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- ROLE / ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   READ: researcher+ may read the operations center (is_researcher_or_above).
--   WRITE: curator/admin may create/modify runs, queue, tasks, opportunities,
--     escalations, assignments, and templates (is_curator_or_admin). admin all.
--   The background RESEARCH-ORCHESTRATOR WORKER uses the service_role key, which
--   BYPASSES RLS — it polls the queue, advances runs, assigns agents, discovers
--   opportunities, and raises escalations without these policies.
--   GOVERNANCE: opportunities/escalations/workflow approvals/overrides remain
--   human-approved, auditable, and reversible — the worker never auto-acts.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

-- ---------- hsin_workflow_templates -------------------------------------------
-- Reusable workflow definitions (seeded by the app/worker; editable by curators).
create table if not exists public.hsin_workflow_templates (
  id                  uuid primary key default gen_random_uuid(),
  template_key        text unique,
  name                text,
  description         text,
  stages              jsonb,
  required_agents     jsonb,
  required_evidence   int default 0,
  governance_required boolean default true,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz default now()
);
comment on table public.hsin_workflow_templates is
  'HSIN Phase 18: reusable research workflow templates (stages/required agents/required evidence/governance flag).';

-- ---------- hsin_research_runs ------------------------------------------------
-- The unit of orchestrated work. state mirrors the orchestrator state machine.
create table if not exists public.hsin_research_runs (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  state           text check (state in (
                    'CREATED','QUEUED','DISCOVERING','COLLECTING','ANALYZING','REASONING',
                    'EVIDENCING','TEMPORAL','CAUSAL','COUNTERFACTUAL','DECISION','OUTCOME',
                    'CALIBRATION','TRUST','GOVERNANCE','COMPLETE','FAILED','ESCALATED')) default 'CREATED',
  priority        text check (priority in ('CRITICAL','HIGH','NORMAL','LOW')) default 'NORMAL',
  workflow_key    text,
  opportunity_id  uuid,
  -- rollups surfaced in the operations center.
  assigned_agents jsonb,
  evidence_count  int default 0,
  confidence      numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  trust_score     numeric check (trust_score is null or (trust_score >= 0 and trust_score <= 100)),
  outcome_status  text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);
comment on table public.hsin_research_runs is
  'HSIN Phase 18: the unit of orchestrated research work (state machine + priority + rollups for the operations center).';

-- ---------- hsin_research_run_events ------------------------------------------
-- APPEND-ONLY audited state transitions — the run's replayable history.
create table if not exists public.hsin_research_run_events (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references public.hsin_research_runs(id) on delete cascade,
  from_state  text,
  to_state    text,
  actor       text,
  reason      text,
  metadata    jsonb,
  at          timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_research_run_events is
  'HSIN Phase 18: APPEND-ONLY audited research-run state transitions (from→to/actor/reason); the replayable history.';

-- ---------- hsin_research_tasks -----------------------------------------------
-- Agent tasks attached to a run stage.
create table if not exists public.hsin_research_tasks (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid references public.hsin_research_runs(id) on delete cascade,
  task_key     text,
  agent_type   text check (agent_type in (
                 'research','evidence','temporal','causal','counterfactual','decision','outcome','trust')),
  stage        text,
  state        text check (state in ('pending','active','completed','failed','blocked')) default 'pending',
  attempts     int default 0,
  max_attempts int default 3,
  runtime_ms   bigint default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.hsin_research_tasks is
  'HSIN Phase 18: agent tasks attached to a research-run stage (state/attempts/runtime/last error).';

-- ---------- hsin_research_queue -----------------------------------------------
-- The durable priority queue (survives restarts).
create table if not exists public.hsin_research_queue (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid references public.hsin_research_runs(id) on delete cascade,
  priority     text check (priority in ('CRITICAL','HIGH','NORMAL','LOW')) default 'NORMAL',
  status       text check (status in ('queued','active','completed','failed','cancelled','retrying')) default 'queued',
  attempts     int default 0,
  max_attempts int default 3,
  available_at timestamptz,
  enqueued_at  timestamptz,
  last_error   text,
  payload      jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.hsin_research_queue is
  'HSIN Phase 18: the durable priority research queue (priority/status/attempts/backoff); survives restarts.';

-- ---------- hsin_research_opportunities ---------------------------------------
-- PROPOSED research opportunities from discovery (never auto-published).
create table if not exists public.hsin_research_opportunities (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  reason      text,
  confidence  numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  priority    text check (priority in ('CRITICAL','HIGH','NORMAL','LOW')) default 'NORMAL',
  source      text check (source in (
                'signal','evidence','alert','trust_drift','outcome_failure','narrative_spike')),
  entity_id   text,
  status      text check (status in ('proposed','accepted','rejected')) default 'proposed',
  reviewed_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.hsin_research_opportunities is
  'HSIN Phase 18: PROPOSED research opportunities from discovery (never auto-published); accepted/rejected by a human.';

-- ---------- hsin_research_escalations -----------------------------------------
-- Issues requiring human attention (never auto-resolved).
create table if not exists public.hsin_research_escalations (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid references public.hsin_research_runs(id) on delete set null,
  trigger        text check (trigger in (
                   'repeated_failures','trust_collapse','calibration_drift','missing_evidence',
                   'governance_backlog','queue_blockage')),
  severity       text check (severity in ('INFO','WARNING','HIGH','CRITICAL')),
  reason         text,
  evidence       jsonb,
  recommendation text,
  status         text check (status in ('open','acknowledged','resolved')) default 'open',
  resolved_by    uuid references public.users(id) on delete set null,
  resolution     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz default now()
);
comment on table public.hsin_research_escalations is
  'HSIN Phase 18: research escalations requiring human attention (trigger/severity/evidence/recommendation); never auto-resolved.';

-- ---------- hsin_agent_assignments --------------------------------------------
-- APPEND-ONLY record of which agent served which run stage.
create table if not exists public.hsin_agent_assignments (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references public.hsin_research_runs(id) on delete cascade,
  task_id     uuid references public.hsin_research_tasks(id) on delete set null,
  agent_type  text check (agent_type in (
                'research','evidence','temporal','causal','counterfactual','decision','outcome','trust')),
  stage       text,
  assigned_at timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.hsin_agent_assignments is
  'HSIN Phase 18: APPEND-ONLY record of which agent served which research-run stage.';

-- =============================================================================
-- B. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_research_runs_state      on public.hsin_research_runs(state);
create index if not exists idx_hsin_research_runs_priority   on public.hsin_research_runs(priority);
create index if not exists idx_hsin_research_runs_created_at on public.hsin_research_runs(created_at);

create index if not exists idx_hsin_research_run_events_run_id on public.hsin_research_run_events(run_id);
create index if not exists idx_hsin_research_run_events_at     on public.hsin_research_run_events(at);

create index if not exists idx_hsin_research_tasks_run_id     on public.hsin_research_tasks(run_id);
create index if not exists idx_hsin_research_tasks_agent_type on public.hsin_research_tasks(agent_type);
create index if not exists idx_hsin_research_tasks_state      on public.hsin_research_tasks(state);

create index if not exists idx_hsin_research_queue_run_id   on public.hsin_research_queue(run_id);
create index if not exists idx_hsin_research_queue_status   on public.hsin_research_queue(status);
create index if not exists idx_hsin_research_queue_priority on public.hsin_research_queue(priority);
create index if not exists idx_hsin_research_queue_available_at on public.hsin_research_queue(available_at);

create index if not exists idx_hsin_research_opportunities_status   on public.hsin_research_opportunities(status);
create index if not exists idx_hsin_research_opportunities_priority on public.hsin_research_opportunities(priority);
create index if not exists idx_hsin_research_opportunities_source   on public.hsin_research_opportunities(source);

create index if not exists idx_hsin_research_escalations_run_id   on public.hsin_research_escalations(run_id);
create index if not exists idx_hsin_research_escalations_severity on public.hsin_research_escalations(severity);
create index if not exists idx_hsin_research_escalations_status   on public.hsin_research_escalations(status);

create index if not exists idx_hsin_agent_assignments_run_id     on public.hsin_agent_assignments(run_id);
create index if not exists idx_hsin_agent_assignments_agent_type on public.hsin_agent_assignments(agent_type);

create index if not exists idx_hsin_workflow_templates_key on public.hsin_workflow_templates(template_key);

-- =============================================================================
-- C. UPDATED_AT TRIGGERS — on the six mutable tables. The two APPEND-ONLY tables
-- (hsin_research_run_events, hsin_agent_assignments) carry no updated_at column.
-- Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_research_runs;
create trigger trg_set_updated_at before update on public.hsin_research_runs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_research_tasks;
create trigger trg_set_updated_at before update on public.hsin_research_tasks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_research_queue;
create trigger trg_set_updated_at before update on public.hsin_research_queue
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_research_opportunities;
create trigger trg_set_updated_at before update on public.hsin_research_opportunities
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_research_escalations;
create trigger trg_set_updated_at before update on public.hsin_research_escalations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_workflow_templates;
create trigger trg_set_updated_at before update on public.hsin_workflow_templates
  for each row execute function public.set_updated_at();

-- =============================================================================
-- D. ENABLE RLS on all 8 new tables
-- =============================================================================
alter table public.hsin_research_runs          enable row level security;
alter table public.hsin_research_run_events     enable row level security;
alter table public.hsin_research_tasks          enable row level security;
alter table public.hsin_research_queue          enable row level security;
alter table public.hsin_research_opportunities  enable row level security;
alter table public.hsin_research_escalations    enable row level security;
alter table public.hsin_agent_assignments       enable row level security;
alter table public.hsin_workflow_templates      enable row level security;

-- =============================================================================
-- E. POLICIES
-- Convention (matches 0002/0010/0011-0021): permissive policies are OR-combined.
-- Drop-then-create for idempotency. The background research-orchestrator worker
-- uses the service_role key and bypasses ALL of these.
--
-- Uniform shape for all 8 tables:
--   researcher+ READ (public.is_researcher_or_above());
--   curator/admin INSERT/UPDATE/DELETE (public.is_curator_or_admin());
--   admin all (public.is_admin()).
-- =============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'hsin_research_runs','hsin_research_run_events','hsin_research_tasks',
    'hsin_research_queue','hsin_research_opportunities','hsin_research_escalations',
    'hsin_agent_assignments','hsin_workflow_templates'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_del', t);

    execute format(
      'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_researcher_or_above())',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.is_curator_or_admin())',
      t || '_curator_ins', t);
    execute format(
      'create policy %I on public.%I for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin())',
      t || '_curator_upd', t);
    execute format(
      'create policy %I on public.%I for delete using (public.is_curator_or_admin())',
      t || '_curator_del', t);
  end loop;
end $$;

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background
-- research-orchestrator worker (queue polling, agent assignment, workflow
-- progression, failure handling, escalation, trust/governance routing, retries)
-- uses it. User-facing reads/writes go through the per-request, cookie-backed
-- client and are authorized by the policies above. NEVER expose service_role.
-- =============================================================================

-- =============================================================================
-- End of 0022_research_orchestration.sql
-- =============================================================================
