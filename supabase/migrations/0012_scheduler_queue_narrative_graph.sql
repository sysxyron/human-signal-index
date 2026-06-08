-- =============================================================================
-- Human Signal Index — 0012_scheduler_queue_narrative_graph.sql
-- WorldForge / HSI (Phase 8) — Scheduler, Queue & Narrative Graph.
--
-- Phase 8 adds the OPERATIONAL backbone that drives the Phase-7 observatory and a
-- shared INTELLIGENCE GRAPH layered on top of captured signals. It introduces:
--   * a durable JOB QUEUE + per-attempt log (the worker drains this), cron-style
--     SCHEDULER RULES, and capture DEDUPE bookkeeping;
--   * an ENTITY + NARRATIVE knowledge graph (entities, narratives, the edges
--     between narratives, and the signal<->entity / signal<->narrative links);
--   * TRIAGE RULES + SLA POLICIES that automate signal handling and deadlines;
--   * PROVIDER ACCOUNTS + RATE LIMITS for outbound capture/enrichment providers.
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phase 7 / migration 0011).
-- ---------------------------------------------------------------------------
-- Every Phase-8 table uses the `hsin_` prefix, matching Phase 7. This avoids any
-- collision with the Phase-1 `sources`/`signals` tables and keeps the network
-- subsystem self-contained. Phase-8 tables reference the Phase-7 hsin_ tables
-- (hsin_sources, hsin_signals) — NOT the Phase-1 plain tables.
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY w.r.t. existing schema. It creates 13 new `hsin_`-
-- prefixed tables (+ indexes, updated_at triggers, RLS, and policies). It does NOT
-- edit migrations 0001-0011, drop existing policies/roles/helpers, or touch any
-- existing table/RLS (including the Phase-1 `sources`/`signals` and the Phase-7
-- hsin_ tables).
--
-- CONVENTIONS (match 0001-0011):
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
--   Two access shapes:
--   (A) OPERATIONAL tables (job queue/attempts, scheduler rules, capture dedupes,
--       provider accounts/rate limits): reviewer+ READ; curator/admin WRITE.
--   (B) KNOWLEDGE-GRAPH tables (entities, signal_entities, narratives,
--       signal_narratives, narrative_edges): any authenticated user READS (shared
--       intelligence graph); researcher+ INSERT/UPDATE; admin all.
--   (C) TRIAGE RULES + SLA POLICIES: reviewer+ READ; curator/admin WRITE.
--
--   The background WORKER uses the Supabase service_role key, which BYPASSES RLS
--   entirely — it enqueues/claims/updates jobs, writes attempts, advances scheduler
--   rules, records dedupes, and populates the graph without needing these policies.
--   The policies below govern only user-facing (per-request, cookie-backed) access.
-- =============================================================================

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------- hsin_job_queue ----------------------------------------------------
-- A durable unit of work for the background worker (e.g. capture a source, run
-- classification, enrich an entity). status drives the queue lifecycle; priority
-- orders the worklist (lower = sooner by convention); scheduled_for gates when the
-- job becomes eligible; attempt_count / max_attempts back the retry policy.
create table if not exists public.hsin_job_queue (
  id            uuid primary key default gen_random_uuid(),
  job_type      text not null,
  status        text not null default 'queued'
                  check (status in ('queued','running','completed','failed','retrying','cancelled')),
  priority      int not null default 5,
  source_id     uuid references public.hsin_sources(id) on delete set null,
  payload_json  jsonb,
  scheduled_for timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  error_message text,
  attempt_count int not null default 0,
  max_attempts  int not null default 3,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.hsin_job_queue is
  'HSIN Phase 8: durable job queue drained by the background worker (queued/running/completed/failed/retrying/cancelled).';

-- ---------- hsin_job_attempts -------------------------------------------------
-- One execution attempt of a queued job. Append-only log of when each attempt ran,
-- its terminal status, any error, and an arbitrary structured log payload.
create table if not exists public.hsin_job_attempts (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.hsin_job_queue(id) on delete cascade,
  attempt_number int not null,
  started_at     timestamptz,
  finished_at    timestamptz,
  status         text,
  error_message  text,
  log_json       jsonb,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_job_attempts is
  'HSIN Phase 8: append-only per-attempt execution log for a queued job.';

-- ---------- hsin_scheduler_rules ----------------------------------------------
-- A cron-style schedule that enqueues a job_type (optionally scoped to a source).
-- enabled gates the rule; next_run_at / last_run_at track the cron cursor.
create table if not exists public.hsin_scheduler_rules (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid references public.hsin_sources(id) on delete cascade,
  job_type        text not null,
  cron_expression text not null,
  enabled         boolean not null default true,
  next_run_at     timestamptz,
  last_run_at     timestamptz,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.hsin_scheduler_rules is
  'HSIN Phase 8: cron-style rule that periodically enqueues a job_type (optionally per source).';

-- ---------- hsin_capture_dedupes ----------------------------------------------
-- De-dup bookkeeping per source: a content_hash (and optional canonical_url) seen
-- for a source, with first/last seen timestamps and the signal it resolved to.
-- unique(source_id, content_hash) makes the capture pipeline idempotent.
create table if not exists public.hsin_capture_dedupes (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.hsin_sources(id) on delete cascade,
  content_hash  text not null,
  canonical_url text,
  first_seen_at timestamptz default now(),
  last_seen_at  timestamptz default now(),
  signal_id     uuid references public.hsin_signals(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (source_id, content_hash)
);
comment on table public.hsin_capture_dedupes is
  'HSIN Phase 8: capture de-dup bookkeeping; unique per (source_id, content_hash).';

-- ---------- hsin_entities -----------------------------------------------------
-- A node in the shared intelligence graph: a person/organization/movement/etc.
-- referenced across signals. unique(name, entity_type) de-dupes the catalog.
create table if not exists public.hsin_entities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  entity_type text not null
                check (entity_type in ('person','organization','movement','ideology',
                                       'topic','place','platform','publication','unknown')),
  description text,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name, entity_type)
);
comment on table public.hsin_entities is
  'HSIN Phase 8: an entity node in the shared intelligence graph; unique per (name, entity_type).';

-- ---------- hsin_signal_entities ----------------------------------------------
-- Links a captured signal to an entity it references, with extraction confidence
-- and the supporting evidence text. unique(signal_id, entity_id).
create table if not exists public.hsin_signal_entities (
  id            uuid primary key default gen_random_uuid(),
  signal_id     uuid not null references public.hsin_signals(id) on delete cascade,
  entity_id     uuid not null references public.hsin_entities(id) on delete cascade,
  confidence    numeric check (confidence >= 0 and confidence <= 1),
  evidence_text text,
  created_at    timestamptz not null default now(),
  unique (signal_id, entity_id)
);
comment on table public.hsin_signal_entities is
  'HSIN Phase 8: signal<->entity link with extraction confidence; unique per (signal_id, entity_id).';

-- ---------- hsin_narratives ---------------------------------------------------
-- A tracked narrative in the graph (a recurring framing/storyline). risk_level is
-- a 1-5 baseline; category groups narratives for the UI.
create table if not exists public.hsin_narratives (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    text,
  risk_level  int check (risk_level between 1 and 5),
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.hsin_narratives is
  'HSIN Phase 8: a tracked narrative (recurring framing/storyline) in the intelligence graph.';

-- ---------- hsin_signal_narratives --------------------------------------------
-- Links a captured signal to a narrative it expresses, with confidence + rationale.
-- unique(signal_id, narrative_id).
create table if not exists public.hsin_signal_narratives (
  id           uuid primary key default gen_random_uuid(),
  signal_id    uuid not null references public.hsin_signals(id) on delete cascade,
  narrative_id uuid not null references public.hsin_narratives(id) on delete cascade,
  confidence   numeric check (confidence >= 0 and confidence <= 1),
  rationale    text,
  created_at   timestamptz not null default now(),
  unique (signal_id, narrative_id)
);
comment on table public.hsin_signal_narratives is
  'HSIN Phase 8: signal<->narrative link with confidence; unique per (signal_id, narrative_id).';

-- ---------- hsin_narrative_edges ----------------------------------------------
-- A directed edge between two narratives (related_to / contradicts / amplifies /
-- evolves_into / derived_from / co_occurs_with). weight quantifies the edge.
-- unique(source_narrative_id, target_narrative_id, edge_type).
create table if not exists public.hsin_narrative_edges (
  id                  uuid primary key default gen_random_uuid(),
  source_narrative_id uuid not null references public.hsin_narratives(id) on delete cascade,
  target_narrative_id uuid not null references public.hsin_narratives(id) on delete cascade,
  edge_type           text not null
                        check (edge_type in ('related_to','contradicts','amplifies',
                                             'evolves_into','derived_from','co_occurs_with')),
  weight              numeric,
  rationale           text,
  created_at          timestamptz not null default now(),
  unique (source_narrative_id, target_narrative_id, edge_type)
);
comment on table public.hsin_narrative_edges is
  'HSIN Phase 8: directed edge between two narratives; unique per (source, target, edge_type).';

-- ---------- hsin_triage_rules -------------------------------------------------
-- A declarative triage rule: when conditions_json matches a captured signal, run
-- actions_json (tag/route/alert/escalate/...). enabled gates the rule.
create table if not exists public.hsin_triage_rules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  enabled      boolean not null default true,
  conditions_json jsonb not null default '[]',
  actions_json    jsonb not null default '[]',
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.hsin_triage_rules is
  'HSIN Phase 8: declarative triage rule (conditions -> actions) applied to captured signals.';

-- ---------- hsin_sla_policies -------------------------------------------------
-- A service-level policy per severity: review + escalation deadlines (hours) that
-- drive SLA timers / escalation alerts in the triage workflow.
create table if not exists public.hsin_sla_policies (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  severity                   text check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  review_deadline_hours      numeric,
  escalation_deadline_hours  numeric,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
comment on table public.hsin_sla_policies is
  'HSIN Phase 8: per-severity SLA policy (review + escalation deadlines in hours).';

-- ---------- hsin_provider_accounts --------------------------------------------
-- An outbound provider account (capture/enrichment provider) and its config.
-- enabled gates use; config_json holds credentials/options. unique(provider_name).
create table if not exists public.hsin_provider_accounts (
  id            uuid primary key default gen_random_uuid(),
  provider_name text not null,
  enabled       boolean not null default false,
  config_json   jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider_name)
);
comment on table public.hsin_provider_accounts is
  'HSIN Phase 8: outbound provider account + config; unique per provider_name.';

-- ---------- hsin_provider_rate_limits -----------------------------------------
-- The current rate-limit window for a provider: window length, max + remaining
-- requests, and when the window resets. unique(provider_name).
create table if not exists public.hsin_provider_rate_limits (
  id                 uuid primary key default gen_random_uuid(),
  provider_name      text not null,
  window_seconds     int,
  max_requests       int,
  remaining_requests int,
  reset_at           timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider_name)
);
comment on table public.hsin_provider_rate_limits is
  'HSIN Phase 8: current rate-limit window for an outbound provider; unique per provider_name.';

-- =============================================================================
-- 2. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_job_queue_status_sched on public.hsin_job_queue(status, scheduled_for);
create index if not exists idx_hsin_job_queue_job_type      on public.hsin_job_queue(job_type);
create index if not exists idx_hsin_job_queue_source_id     on public.hsin_job_queue(source_id);
create index if not exists idx_hsin_job_queue_priority      on public.hsin_job_queue(priority);

create index if not exists idx_hsin_job_attempts_job_id     on public.hsin_job_attempts(job_id);

create index if not exists idx_hsin_scheduler_rules_enabled_next on public.hsin_scheduler_rules(enabled, next_run_at);
create index if not exists idx_hsin_scheduler_rules_source_id    on public.hsin_scheduler_rules(source_id);

create index if not exists idx_hsin_capture_dedupes_source_hash on public.hsin_capture_dedupes(source_id, content_hash);

create index if not exists idx_hsin_entities_entity_type    on public.hsin_entities(entity_type);

create index if not exists idx_hsin_signal_entities_signal_id on public.hsin_signal_entities(signal_id);
create index if not exists idx_hsin_signal_entities_entity_id on public.hsin_signal_entities(entity_id);

create index if not exists idx_hsin_narratives_category     on public.hsin_narratives(category);

create index if not exists idx_hsin_signal_narratives_signal_id    on public.hsin_signal_narratives(signal_id);
create index if not exists idx_hsin_signal_narratives_narrative_id on public.hsin_signal_narratives(narrative_id);

create index if not exists idx_hsin_narrative_edges_source on public.hsin_narrative_edges(source_narrative_id);
create index if not exists idx_hsin_narrative_edges_target on public.hsin_narrative_edges(target_narrative_id);
create index if not exists idx_hsin_narrative_edges_type   on public.hsin_narrative_edges(edge_type);

-- =============================================================================
-- 3. updated_at TRIGGERS
--    Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
--    Applied to every Phase-8 table carrying an updated_at column.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_job_queue;
create trigger trg_set_updated_at before update on public.hsin_job_queue
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_scheduler_rules;
create trigger trg_set_updated_at before update on public.hsin_scheduler_rules
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_entities;
create trigger trg_set_updated_at before update on public.hsin_entities
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_narratives;
create trigger trg_set_updated_at before update on public.hsin_narratives
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_triage_rules;
create trigger trg_set_updated_at before update on public.hsin_triage_rules
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_sla_policies;
create trigger trg_set_updated_at before update on public.hsin_sla_policies
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_provider_accounts;
create trigger trg_set_updated_at before update on public.hsin_provider_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_provider_rate_limits;
create trigger trg_set_updated_at before update on public.hsin_provider_rate_limits
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. ENABLE RLS on all 13 new tables
-- =============================================================================
alter table public.hsin_job_queue            enable row level security;
alter table public.hsin_job_attempts         enable row level security;
alter table public.hsin_scheduler_rules      enable row level security;
alter table public.hsin_capture_dedupes      enable row level security;
alter table public.hsin_entities             enable row level security;
alter table public.hsin_signal_entities      enable row level security;
alter table public.hsin_narratives           enable row level security;
alter table public.hsin_signal_narratives    enable row level security;
alter table public.hsin_narrative_edges      enable row level security;
alter table public.hsin_triage_rules         enable row level security;
alter table public.hsin_sla_policies         enable row level security;
alter table public.hsin_provider_accounts    enable row level security;
alter table public.hsin_provider_rate_limits enable row level security;

-- =============================================================================
-- 5. POLICIES
-- Convention (matches 0002/0010/0011): permissive policies are OR-combined — a row
-- is visible/writable if ANY policy allows it. Three access shapes (see header):
--   (A) OPERATIONAL : reviewer+ READ; curator/admin WRITE (insert/update/delete).
--   (B) GRAPH       : authenticated READ; researcher+ INSERT/UPDATE; admin all.
--   (C) RULES/SLA   : reviewer+ READ; curator/admin WRITE.
-- The background worker uses the service_role key and bypasses ALL of these.
-- =============================================================================

-- ---------- (A) hsin_job_queue ------------------------------------------------
-- Operational: reviewer+ read the queue; curator/admin manage (enqueue/cancel/edit).
drop policy if exists hsin_job_queue_admin_all      on public.hsin_job_queue;
drop policy if exists hsin_job_queue_reviewer_read  on public.hsin_job_queue;
drop policy if exists hsin_job_queue_curator_ins    on public.hsin_job_queue;
drop policy if exists hsin_job_queue_curator_upd    on public.hsin_job_queue;
drop policy if exists hsin_job_queue_curator_del    on public.hsin_job_queue;

create policy hsin_job_queue_admin_all on public.hsin_job_queue
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_job_queue_reviewer_read on public.hsin_job_queue
  for select using (public.is_reviewer_or_above());
create policy hsin_job_queue_curator_ins on public.hsin_job_queue
  for insert with check (public.is_curator_or_admin());
create policy hsin_job_queue_curator_upd on public.hsin_job_queue
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_job_queue_curator_del on public.hsin_job_queue
  for delete using (public.is_curator_or_admin());

-- ---------- (A) hsin_job_attempts ---------------------------------------------
-- Operational: reviewer+ read attempt logs; curator/admin manage. Append-only by
-- convention (the worker writes these via service_role).
drop policy if exists hsin_job_attempts_admin_all     on public.hsin_job_attempts;
drop policy if exists hsin_job_attempts_reviewer_read on public.hsin_job_attempts;
drop policy if exists hsin_job_attempts_curator_ins   on public.hsin_job_attempts;
drop policy if exists hsin_job_attempts_curator_upd   on public.hsin_job_attempts;
drop policy if exists hsin_job_attempts_curator_del   on public.hsin_job_attempts;

create policy hsin_job_attempts_admin_all on public.hsin_job_attempts
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_job_attempts_reviewer_read on public.hsin_job_attempts
  for select using (public.is_reviewer_or_above());
create policy hsin_job_attempts_curator_ins on public.hsin_job_attempts
  for insert with check (public.is_curator_or_admin());
create policy hsin_job_attempts_curator_upd on public.hsin_job_attempts
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_job_attempts_curator_del on public.hsin_job_attempts
  for delete using (public.is_curator_or_admin());

-- ---------- (A) hsin_scheduler_rules ------------------------------------------
-- Operational: reviewer+ read the schedule; curator/admin manage cron rules.
drop policy if exists hsin_scheduler_rules_admin_all     on public.hsin_scheduler_rules;
drop policy if exists hsin_scheduler_rules_reviewer_read on public.hsin_scheduler_rules;
drop policy if exists hsin_scheduler_rules_curator_ins   on public.hsin_scheduler_rules;
drop policy if exists hsin_scheduler_rules_curator_upd   on public.hsin_scheduler_rules;
drop policy if exists hsin_scheduler_rules_curator_del   on public.hsin_scheduler_rules;

create policy hsin_scheduler_rules_admin_all on public.hsin_scheduler_rules
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_scheduler_rules_reviewer_read on public.hsin_scheduler_rules
  for select using (public.is_reviewer_or_above());
create policy hsin_scheduler_rules_curator_ins on public.hsin_scheduler_rules
  for insert with check (public.is_curator_or_admin());
create policy hsin_scheduler_rules_curator_upd on public.hsin_scheduler_rules
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_scheduler_rules_curator_del on public.hsin_scheduler_rules
  for delete using (public.is_curator_or_admin());

-- ---------- (A) hsin_capture_dedupes ------------------------------------------
-- Operational: reviewer+ read dedupe bookkeeping; curator/admin manage.
drop policy if exists hsin_capture_dedupes_admin_all     on public.hsin_capture_dedupes;
drop policy if exists hsin_capture_dedupes_reviewer_read on public.hsin_capture_dedupes;
drop policy if exists hsin_capture_dedupes_curator_ins   on public.hsin_capture_dedupes;
drop policy if exists hsin_capture_dedupes_curator_upd   on public.hsin_capture_dedupes;
drop policy if exists hsin_capture_dedupes_curator_del   on public.hsin_capture_dedupes;

create policy hsin_capture_dedupes_admin_all on public.hsin_capture_dedupes
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_capture_dedupes_reviewer_read on public.hsin_capture_dedupes
  for select using (public.is_reviewer_or_above());
create policy hsin_capture_dedupes_curator_ins on public.hsin_capture_dedupes
  for insert with check (public.is_curator_or_admin());
create policy hsin_capture_dedupes_curator_upd on public.hsin_capture_dedupes
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_capture_dedupes_curator_del on public.hsin_capture_dedupes
  for delete using (public.is_curator_or_admin());

-- ---------- (B) hsin_entities -------------------------------------------------
-- Graph: any authenticated user reads the shared graph; researcher+ insert/update;
-- admin all (incl. delete).
drop policy if exists hsin_entities_admin_all        on public.hsin_entities;
drop policy if exists hsin_entities_auth_read        on public.hsin_entities;
drop policy if exists hsin_entities_researcher_ins   on public.hsin_entities;
drop policy if exists hsin_entities_researcher_upd   on public.hsin_entities;

create policy hsin_entities_admin_all on public.hsin_entities
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_entities_auth_read on public.hsin_entities
  for select using (auth.uid() is not null);
create policy hsin_entities_researcher_ins on public.hsin_entities
  for insert with check (public.is_researcher_or_above());
create policy hsin_entities_researcher_upd on public.hsin_entities
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());

-- ---------- (B) hsin_signal_entities ------------------------------------------
-- Graph: authenticated read; researcher+ insert/update; admin all.
drop policy if exists hsin_signal_entities_admin_all      on public.hsin_signal_entities;
drop policy if exists hsin_signal_entities_auth_read      on public.hsin_signal_entities;
drop policy if exists hsin_signal_entities_researcher_ins on public.hsin_signal_entities;
drop policy if exists hsin_signal_entities_researcher_upd on public.hsin_signal_entities;

create policy hsin_signal_entities_admin_all on public.hsin_signal_entities
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_signal_entities_auth_read on public.hsin_signal_entities
  for select using (auth.uid() is not null);
create policy hsin_signal_entities_researcher_ins on public.hsin_signal_entities
  for insert with check (public.is_researcher_or_above());
create policy hsin_signal_entities_researcher_upd on public.hsin_signal_entities
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());

-- ---------- (B) hsin_narratives -----------------------------------------------
-- Graph: authenticated read; researcher+ insert/update; admin all.
drop policy if exists hsin_narratives_admin_all      on public.hsin_narratives;
drop policy if exists hsin_narratives_auth_read      on public.hsin_narratives;
drop policy if exists hsin_narratives_researcher_ins on public.hsin_narratives;
drop policy if exists hsin_narratives_researcher_upd on public.hsin_narratives;

create policy hsin_narratives_admin_all on public.hsin_narratives
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narratives_auth_read on public.hsin_narratives
  for select using (auth.uid() is not null);
create policy hsin_narratives_researcher_ins on public.hsin_narratives
  for insert with check (public.is_researcher_or_above());
create policy hsin_narratives_researcher_upd on public.hsin_narratives
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());

-- ---------- (B) hsin_signal_narratives ----------------------------------------
-- Graph: authenticated read; researcher+ insert/update; admin all.
drop policy if exists hsin_signal_narratives_admin_all      on public.hsin_signal_narratives;
drop policy if exists hsin_signal_narratives_auth_read      on public.hsin_signal_narratives;
drop policy if exists hsin_signal_narratives_researcher_ins on public.hsin_signal_narratives;
drop policy if exists hsin_signal_narratives_researcher_upd on public.hsin_signal_narratives;

create policy hsin_signal_narratives_admin_all on public.hsin_signal_narratives
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_signal_narratives_auth_read on public.hsin_signal_narratives
  for select using (auth.uid() is not null);
create policy hsin_signal_narratives_researcher_ins on public.hsin_signal_narratives
  for insert with check (public.is_researcher_or_above());
create policy hsin_signal_narratives_researcher_upd on public.hsin_signal_narratives
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());

-- ---------- (B) hsin_narrative_edges ------------------------------------------
-- Graph: authenticated read; researcher+ insert/update; admin all.
drop policy if exists hsin_narrative_edges_admin_all      on public.hsin_narrative_edges;
drop policy if exists hsin_narrative_edges_auth_read      on public.hsin_narrative_edges;
drop policy if exists hsin_narrative_edges_researcher_ins on public.hsin_narrative_edges;
drop policy if exists hsin_narrative_edges_researcher_upd on public.hsin_narrative_edges;

create policy hsin_narrative_edges_admin_all on public.hsin_narrative_edges
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_edges_auth_read on public.hsin_narrative_edges
  for select using (auth.uid() is not null);
create policy hsin_narrative_edges_researcher_ins on public.hsin_narrative_edges
  for insert with check (public.is_researcher_or_above());
create policy hsin_narrative_edges_researcher_upd on public.hsin_narrative_edges
  for update using (public.is_researcher_or_above()) with check (public.is_researcher_or_above());

-- ---------- (C) hsin_triage_rules ---------------------------------------------
-- Rules: reviewer+ read; curator/admin manage.
drop policy if exists hsin_triage_rules_admin_all     on public.hsin_triage_rules;
drop policy if exists hsin_triage_rules_reviewer_read on public.hsin_triage_rules;
drop policy if exists hsin_triage_rules_curator_ins   on public.hsin_triage_rules;
drop policy if exists hsin_triage_rules_curator_upd   on public.hsin_triage_rules;
drop policy if exists hsin_triage_rules_curator_del   on public.hsin_triage_rules;

create policy hsin_triage_rules_admin_all on public.hsin_triage_rules
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_triage_rules_reviewer_read on public.hsin_triage_rules
  for select using (public.is_reviewer_or_above());
create policy hsin_triage_rules_curator_ins on public.hsin_triage_rules
  for insert with check (public.is_curator_or_admin());
create policy hsin_triage_rules_curator_upd on public.hsin_triage_rules
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_triage_rules_curator_del on public.hsin_triage_rules
  for delete using (public.is_curator_or_admin());

-- ---------- (C) hsin_sla_policies ---------------------------------------------
-- SLA: reviewer+ read; curator/admin manage.
drop policy if exists hsin_sla_policies_admin_all     on public.hsin_sla_policies;
drop policy if exists hsin_sla_policies_reviewer_read on public.hsin_sla_policies;
drop policy if exists hsin_sla_policies_curator_ins   on public.hsin_sla_policies;
drop policy if exists hsin_sla_policies_curator_upd   on public.hsin_sla_policies;
drop policy if exists hsin_sla_policies_curator_del   on public.hsin_sla_policies;

create policy hsin_sla_policies_admin_all on public.hsin_sla_policies
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_sla_policies_reviewer_read on public.hsin_sla_policies
  for select using (public.is_reviewer_or_above());
create policy hsin_sla_policies_curator_ins on public.hsin_sla_policies
  for insert with check (public.is_curator_or_admin());
create policy hsin_sla_policies_curator_upd on public.hsin_sla_policies
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_sla_policies_curator_del on public.hsin_sla_policies
  for delete using (public.is_curator_or_admin());

-- ---------- (A) hsin_provider_accounts ----------------------------------------
-- Operational: reviewer+ read provider config (credentials live in config_json —
-- worker reads via service_role); curator/admin manage.
drop policy if exists hsin_provider_accounts_admin_all     on public.hsin_provider_accounts;
drop policy if exists hsin_provider_accounts_reviewer_read on public.hsin_provider_accounts;
drop policy if exists hsin_provider_accounts_curator_ins   on public.hsin_provider_accounts;
drop policy if exists hsin_provider_accounts_curator_upd   on public.hsin_provider_accounts;
drop policy if exists hsin_provider_accounts_curator_del   on public.hsin_provider_accounts;

create policy hsin_provider_accounts_admin_all on public.hsin_provider_accounts
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_provider_accounts_reviewer_read on public.hsin_provider_accounts
  for select using (public.is_reviewer_or_above());
create policy hsin_provider_accounts_curator_ins on public.hsin_provider_accounts
  for insert with check (public.is_curator_or_admin());
create policy hsin_provider_accounts_curator_upd on public.hsin_provider_accounts
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_provider_accounts_curator_del on public.hsin_provider_accounts
  for delete using (public.is_curator_or_admin());

-- ---------- (A) hsin_provider_rate_limits -------------------------------------
-- Operational: reviewer+ read live rate-limit state; curator/admin manage. The
-- worker updates remaining_requests/reset_at via service_role on each call.
drop policy if exists hsin_provider_rate_limits_admin_all     on public.hsin_provider_rate_limits;
drop policy if exists hsin_provider_rate_limits_reviewer_read on public.hsin_provider_rate_limits;
drop policy if exists hsin_provider_rate_limits_curator_ins   on public.hsin_provider_rate_limits;
drop policy if exists hsin_provider_rate_limits_curator_upd   on public.hsin_provider_rate_limits;
drop policy if exists hsin_provider_rate_limits_curator_del   on public.hsin_provider_rate_limits;

create policy hsin_provider_rate_limits_admin_all on public.hsin_provider_rate_limits
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_provider_rate_limits_reviewer_read on public.hsin_provider_rate_limits
  for select using (public.is_reviewer_or_above());
create policy hsin_provider_rate_limits_curator_ins on public.hsin_provider_rate_limits
  for insert with check (public.is_curator_or_admin());
create policy hsin_provider_rate_limits_curator_upd on public.hsin_provider_rate_limits
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_provider_rate_limits_curator_del on public.hsin_provider_rate_limits
  for delete using (public.is_curator_or_admin());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background worker
-- (queue drain, attempt logging, scheduler tick, capture/dedupe, entity+narrative
-- extraction, provider rate-limit accounting) uses it. User-facing reads/writes go
-- through the per-request, cookie-backed client and are authorized by the policies
-- above (the role predicates). NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0012_scheduler_queue_narrative_graph.sql
-- =============================================================================
