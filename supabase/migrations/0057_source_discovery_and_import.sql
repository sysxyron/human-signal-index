-- =============================================================================
-- HSI Phase 70.3 — Source Import, Discovery Agent & Signal Scout.
--
-- Human-gated source onboarding: CSV import + deterministic classification +
-- duplicate detection + agent-suggested candidates, ALL entering review queues.
-- NOTHING auto-activates a source or auto-publishes a signal. ADDITIVE — no
-- existing table/column/policy modified; no ingestion/review/publish workflow
-- changed. Approved candidates are written to hsin_sources as PAUSED + monitoring
-- DISABLED (activation remains a separate, manual step).
--
-- RLS: reviewer+ READ, admin MANAGE (review/approve flows use server-side gates).
-- IDEMPOTENT (0048–0056 lessons). Seeds the two Phase 66 agents.
-- =============================================================================

-- ---- import batches + rows --------------------------------------------------
create table if not exists public.source_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  invalid_count integer not null default 0,
  duplicate_count integer not null default 0,
  status text not null default 'uploaded' check (status in ('uploaded', 'validated', 'imported', 'failed')),
  uploaded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.source_import_batches add column if not exists row_count integer not null default 0;
alter table public.source_import_batches add column if not exists valid_count integer not null default 0;
alter table public.source_import_batches add column if not exists invalid_count integer not null default 0;
alter table public.source_import_batches add column if not exists duplicate_count integer not null default 0;
alter table public.source_import_batches add column if not exists status text not null default 'uploaded';
alter table public.source_import_batches add column if not exists uploaded_by uuid references public.users (id) on delete set null;
create index if not exists idx_source_import_batches_created on public.source_import_batches (created_at desc);

create table if not exists public.source_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.source_import_batches (id) on delete cascade,
  row_number integer not null,
  raw jsonb not null default '{}'::jsonb,
  valid boolean not null default false,
  errors text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.source_import_rows add column if not exists raw jsonb not null default '{}'::jsonb;
alter table public.source_import_rows add column if not exists valid boolean not null default false;
alter table public.source_import_rows add column if not exists errors text[] not null default '{}';
create index if not exists idx_source_import_rows_batch on public.source_import_rows (batch_id);

-- ---- discovery runs + findings ---------------------------------------------
create table if not exists public.source_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null default 'SOURCE_DISCOVERY_AGENT',
  trigger text not null default 'manual',
  status text not null default 'succeeded' check (status in ('running', 'succeeded', 'failed')),
  findings_count integer not null default 0,
  candidates_created integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  actor_id uuid references public.users (id) on delete set null
);
alter table public.source_discovery_runs add column if not exists findings_count integer not null default 0;
alter table public.source_discovery_runs add column if not exists candidates_created integer not null default 0;
alter table public.source_discovery_runs add column if not exists finished_at timestamptz;
alter table public.source_discovery_runs add column if not exists actor_id uuid references public.users (id) on delete set null;
create index if not exists idx_source_discovery_runs_started on public.source_discovery_runs (started_at desc);

create table if not exists public.source_discovery_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.source_discovery_runs (id) on delete cascade,
  kind text not null,
  detail text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.source_discovery_findings add column if not exists detail text;
alter table public.source_discovery_findings add column if not exists evidence jsonb not null default '{}'::jsonb;
create index if not exists idx_source_discovery_findings_run on public.source_discovery_findings (run_id);

-- ---- source candidates ------------------------------------------------------
create table if not exists public.source_candidates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.source_import_batches (id) on delete set null,
  discovery_run_id uuid references public.source_discovery_runs (id) on delete set null,
  origin text not null default 'csv_import' check (origin in ('csv_import', 'discovery_agent', 'manual')),
  source_name text not null,
  source_type text,
  category text,
  primary_url text,
  feed_or_api_url text,
  platform text,
  capture_interval_minutes integer,
  baseline_risk integer,
  content_selector text,
  priority text,
  ingestion_mode text,
  tags text[] not null default '{}',
  description text,
  corroboration_rule text,
  notes text,
  classification_category text,
  classification_type text,
  classification_confidence numeric,
  classification_reason text,
  duplicate_status text not null default 'none' check (duplicate_status in ('none', 'exact_duplicate', 'domain_duplicate', 'feed_duplicate', 'related_source')),
  existing_source_id uuid references public.hsin_sources (id) on delete set null,
  existing_source_name text,
  duplicate_reason text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'needs_changes', 'duplicate', 'archived')),
  -- map readiness (optional; never fabricated)
  country text, region text, city text, latitude numeric, longitude numeric, geo_confidence numeric, geo_source text,
  source_id uuid references public.hsin_sources (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
-- (additive backfill for the key columns)
alter table public.source_candidates add column if not exists origin text not null default 'csv_import';
alter table public.source_candidates add column if not exists classification_category text;
alter table public.source_candidates add column if not exists classification_type text;
alter table public.source_candidates add column if not exists classification_confidence numeric;
alter table public.source_candidates add column if not exists classification_reason text;
alter table public.source_candidates add column if not exists duplicate_status text not null default 'none';
alter table public.source_candidates add column if not exists existing_source_id uuid references public.hsin_sources (id) on delete set null;
alter table public.source_candidates add column if not exists existing_source_name text;
alter table public.source_candidates add column if not exists duplicate_reason text;
alter table public.source_candidates add column if not exists status text not null default 'pending_review';
alter table public.source_candidates add column if not exists latitude numeric;
alter table public.source_candidates add column if not exists longitude numeric;
alter table public.source_candidates add column if not exists geo_confidence numeric;
alter table public.source_candidates add column if not exists geo_source text;
alter table public.source_candidates add column if not exists source_id uuid references public.hsin_sources (id) on delete set null;
alter table public.source_candidates add column if not exists updated_at timestamptz;
create index if not exists idx_source_candidates_status on public.source_candidates (status, created_at desc);
create index if not exists idx_source_candidates_batch on public.source_candidates (batch_id);

create table if not exists public.source_candidate_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.source_candidates (id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected', 'needs_changes')),
  reason text,
  reviewer_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.source_candidate_reviews add column if not exists reason text;
create index if not exists idx_source_candidate_reviews_candidate on public.source_candidate_reviews (candidate_id, created_at desc);

-- ---- signal candidates ------------------------------------------------------
create table if not exists public.signal_candidates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  source_url text,
  source_id uuid references public.hsin_sources (id) on delete set null,
  source_candidate_id uuid references public.source_candidates (id) on delete set null,
  category text,
  possible_narrative_match uuid references public.narratives (id) on delete set null,
  possible_watchlist_match uuid references public.hsin_watchlists (id) on delete set null,
  confidence numeric,
  reason text,
  evidence_url text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'archived')),
  discovered_at timestamptz not null default now(),
  reviewed_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.signal_candidates add column if not exists summary text;
alter table public.signal_candidates add column if not exists source_candidate_id uuid references public.source_candidates (id) on delete set null;
alter table public.signal_candidates add column if not exists possible_narrative_match uuid references public.narratives (id) on delete set null;
alter table public.signal_candidates add column if not exists possible_watchlist_match uuid references public.hsin_watchlists (id) on delete set null;
alter table public.signal_candidates add column if not exists confidence numeric;
alter table public.signal_candidates add column if not exists reason text;
alter table public.signal_candidates add column if not exists evidence_url text;
alter table public.signal_candidates add column if not exists status text not null default 'pending_review';
alter table public.signal_candidates add column if not exists reviewed_by uuid references public.users (id) on delete set null;
create index if not exists idx_signal_candidates_status on public.signal_candidates (status, created_at desc);

-- ---- Phase 66 agents (additive seed) ---------------------------------------
insert into public.agents (agent_key, name, description, category) values
  ('SOURCE_DISCOVERY_AGENT', 'Source Discovery Agent', 'Suggests new public source candidates from domains already referenced in real signals/evidence (never fabricates URLs). All results enter review.', 'discovery'),
  ('SIGNAL_SCOUT_AGENT', 'Signal Scout Agent', 'Identifies potential signal candidates from recent captures + watchlist/narrative matches. Never publishes; human review required.', 'discovery')
on conflict (agent_key) do nothing;
insert into public.agent_schedules (agent_key, cadence) values ('SOURCE_DISCOVERY_AGENT', 'weekly'), ('SIGNAL_SCOUT_AGENT', 'daily') on conflict (agent_key) do nothing;
insert into public.agent_metrics (agent_key) values ('SOURCE_DISCOVERY_AGENT'), ('SIGNAL_SCOUT_AGENT') on conflict (agent_key) do nothing;

-- ---- RLS (reviewer+ read, admin manage) ------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'source_import_batches', 'source_import_rows', 'source_discovery_runs', 'source_discovery_findings',
    'source_candidates', 'source_candidate_reviews', 'signal_candidates'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_read on public.%I;', t, t);
    execute format('create policy %I_read on public.%I for select using (public.is_reviewer_or_above());', t, t);
    execute format('drop policy if exists %I_admin on public.%I;', t, t);
    execute format('create policy %I_admin on public.%I for all using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;
