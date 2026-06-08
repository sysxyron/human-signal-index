-- =============================================================================
-- Human Signal Index — 0009_evidence_hardening.sql
-- WorldForge (Phase 5) — Live Retrieval & Evidence Hardening persistence schema.
--
-- Phase 5 hardens the Phase 4 Evidence & Citation Engine for LIVE retrieval:
--   * a retrieval CACHE so repeated provider queries are cheap + resilient
--     (memory in-process; this table is the cross-request / durable layer);
--   * per-provider HEALTH tracking (HEALTHY/DEGRADED/OFFLINE) surfaced to ops UI;
--   * evidence-WEIGHTED consensus columns on research_runs so the run can show
--     how its agent confidence moved once real evidence was weighed.
--
-- This migration is ADD-ONLY. It introduces two new tables (provider_health,
-- evidence_cache) and ADDs four numeric columns to research_runs. It does NOT
-- drop or alter any existing table, column, policy, or trigger from 0001-0008,
-- and it does NOT touch the existing research_runs RLS.
--
-- CONVENTIONS (match 0001-0008):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz default now().
--   - mutable tables get an updated_at column + the shared public.set_updated_at()
--     BEFORE UPDATE trigger from 0003.
--   - RLS via the helpers from 0002: public.is_admin(), public.is_reviewer_or_admin().
--   - jsonb columns hold canonical engine payloads (the cached provider union);
--     SQL constrains shape lightly (enum-style text guards + numeric defaults).
--
-- ROLE MODEL:
--   provider_health -> operational telemetry. ANY caller (incl anon) may READ
--                      (so a public status page can render). Only curators
--                      (is_reviewer_or_admin) may write (the DAL upserts the
--                      engine's health snapshot under a reviewer/admin, or the
--                      worker under the service role which bypasses RLS).
--   evidence_cache  -> a server/service retrieval cache. The app's Supabase
--                      CacheStore writes it under the per-request user session,
--                      so any AUTHENTICATED user may READ and INSERT/UPDATE; only
--                      curators may DELETE (cache eviction / purge is a curator op).
-- =============================================================================

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------- provider_health --------------------------------------------------
-- One row per retrieval provider (fixture/arXiv/Crossref/PubMed/Semantic Scholar/
-- DOI/web/openai-embed/...). Mirrors the engine's ProviderHealth snapshot so the
-- ops UI can show which backends are HEALTHY, DEGRADED, or OFFLINE. The DAL
-- upserts on `provider` after each run; the worker refresh also updates it.
create table if not exists public.provider_health (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null unique,                 -- ProviderHealth.name
  enabled       boolean not null default true,
  available     boolean not null default true,
  last_success  timestamptz,
  last_failure  timestamptz,
  latency_ms    numeric,
  error_count   int not null default 0,
  success_count int not null default 0,
  status        text not null default 'HEALTHY'
                  check (status in ('HEALTHY','DEGRADED','OFFLINE')),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
comment on table public.provider_health is
  'WorldForge Phase 5: per-provider retrieval health snapshot (mirrors engine ProviderHealth).';

-- ---------- evidence_cache ---------------------------------------------------
-- A durable retrieval cache. Keyed by (provider, query_hash) where provider is
-- the engine cache namespace (the engine uses the MODE, e.g. 'fixture'/'live')
-- and query_hash is hashQuery(queryText). response_json holds the cached provider
-- union (EvidenceResult[]). Entries expire at expires_at; reads filter on it.
create table if not exists public.evidence_cache (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,                        -- cache namespace (engine mode)
  query_hash    text not null,                        -- hashQuery(queryText)
  query_text    text,                                 -- original query (diagnostics)
  response_json jsonb,                                -- cached EvidenceResult[] union
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  unique (provider, query_hash)
);
comment on table public.evidence_cache is
  'WorldForge Phase 5: durable retrieval cache keyed by (provider, query_hash) with TTL.';

-- ---------- research_runs: surface evidence-weighted consensus ---------------
-- ADD-ONLY: a run now carries the evidence-weighted confidence the engine + the
-- evidenceWeightedConsensus model computed, plus the three driving ratios. These
-- mirror EvidenceWeightedResult so the run/consensus UI can show how the score
-- moved once evidence was weighed. Existing research_runs RLS is untouched.
alter table public.research_runs
  add column if not exists evidence_weighted_confidence numeric;
alter table public.research_runs
  add column if not exists support_ratio numeric;
alter table public.research_runs
  add column if not exists contradiction_ratio numeric;
alter table public.research_runs
  add column if not exists unsupported_ratio numeric;
comment on column public.research_runs.evidence_weighted_confidence is
  'WorldForge Phase 5: confidence after weighting research confidence by evidence (0..100).';
comment on column public.research_runs.support_ratio is
  'WorldForge Phase 5: supported / totalClaims (0..1).';
comment on column public.research_runs.contradiction_ratio is
  'WorldForge Phase 5: contradicted / totalClaims (0..1).';
comment on column public.research_runs.unsupported_ratio is
  'WorldForge Phase 5: unsupported / totalClaims (0..1).';

-- =============================================================================
-- 2. INDEXES — unique de-dupe + common filter columns
-- =============================================================================
create index if not exists idx_provider_health_provider_status
  on public.provider_health(provider, status);

-- The unique(provider, query_hash) above already backs the cache-key lookup; add
-- an expiry index so a sweep / TTL filter is cheap.
create index if not exists idx_evidence_cache_expires_at
  on public.evidence_cache(expires_at);

-- =============================================================================
-- 3. updated_at TRIGGER (only provider_health carries updated_at)
--    Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.provider_health;
create trigger trg_set_updated_at before update on public.provider_health
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. ENABLE RLS on the 2 new tables
--    (research_runs already had RLS enabled in 0007; the ALTER above kept it.)
-- =============================================================================
alter table public.provider_health enable row level security;
alter table public.evidence_cache  enable row level security;

-- =============================================================================
-- 5. POLICIES
-- Convention (matches 0002/0005/0007/0008): permissive policies are OR-combined.
-- A row is visible/writable if ANY policy allows it.
-- =============================================================================

-- ---------- provider_health ---------------------------------------------------
-- Operational telemetry: world-readable (a public status page renders it). Only
-- curators may write the snapshot (the DAL upserts under a reviewer/admin; the
-- worker uses the service role which bypasses RLS entirely).
drop policy if exists provider_health_read         on public.provider_health;
drop policy if exists provider_health_curator_ins  on public.provider_health;
drop policy if exists provider_health_curator_upd  on public.provider_health;
drop policy if exists provider_health_curator_del  on public.provider_health;

create policy provider_health_read on public.provider_health
  for select using (true);
create policy provider_health_curator_ins on public.provider_health
  for insert with check (public.is_reviewer_or_admin());
create policy provider_health_curator_upd on public.provider_health
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy provider_health_curator_del on public.provider_health
  for delete using (public.is_reviewer_or_admin());

-- ---------- evidence_cache ----------------------------------------------------
-- A server/service retrieval cache. The app CacheStore writes it under the
-- per-request user session, so any AUTHENTICATED user may READ + INSERT/UPDATE
-- (cache writes are not sensitive — they only memoize public provider results).
-- Only curators may DELETE (purge/eviction is a curator op; the worker bypasses
-- RLS via the service role).
drop policy if exists evidence_cache_auth_read   on public.evidence_cache;
drop policy if exists evidence_cache_auth_ins    on public.evidence_cache;
drop policy if exists evidence_cache_auth_upd    on public.evidence_cache;
drop policy if exists evidence_cache_curator_del on public.evidence_cache;

create policy evidence_cache_auth_read on public.evidence_cache
  for select using (auth.uid() is not null);
create policy evidence_cache_auth_ins on public.evidence_cache
  for insert with check (auth.uid() is not null);
create policy evidence_cache_auth_upd on public.evidence_cache
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy evidence_cache_curator_del on public.evidence_cache
  for delete using (public.is_reviewer_or_admin());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The nightly evidence
-- refresh worker uses it to upsert provider_health + evidence_cache in batch.
-- User-facing writes (the app CacheStore + the per-run health upsert) go through
-- the per-request, cookie-backed client and are authorized by the policies above.
-- =============================================================================

-- =============================================================================
-- End of 0009_evidence_hardening.sql
-- =============================================================================
