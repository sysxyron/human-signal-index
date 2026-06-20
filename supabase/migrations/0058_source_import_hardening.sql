-- =============================================================================
-- HSI Phase 70.3.1 — Source Import Hardening & Discovery Diagnostics.
--
-- ADDITIVE/FIX-ONLY hardening of Phase 70.3: platform-aware duplicate identity
-- (canonical_url / identity_key / identity_strategy on candidates), widened
-- duplicate_status vocabulary, discovery-run diagnostics, and an admin-config
-- discovery-seed table. No ingestion/review/publish workflow changed. No
-- auto-activation, no fabricated data.
-- =============================================================================

-- ---- canonical identity on candidates --------------------------------------
alter table public.source_candidates add column if not exists canonical_url text;
alter table public.source_candidates add column if not exists identity_key text;
alter table public.source_candidates add column if not exists identity_strategy text;
create index if not exists idx_source_candidates_identity on public.source_candidates (identity_key);

-- widen duplicate_status to include the two platform-aware values
alter table public.source_candidates drop constraint if exists source_candidates_duplicate_status_check;
alter table public.source_candidates add constraint source_candidates_duplicate_status_check
  check (duplicate_status in ('none', 'exact_duplicate', 'domain_duplicate', 'feed_duplicate', 'related_source', 'platform_identity_duplicate', 'platform_domain_only_not_duplicate'));

-- ---- discovery run diagnostics ---------------------------------------------
alter table public.source_discovery_runs add column if not exists reason text;
alter table public.source_discovery_runs add column if not exists sources_considered integer not null default 0;
alter table public.source_discovery_runs add column if not exists sources_skipped integer not null default 0;
alter table public.source_discovery_runs add column if not exists diagnostics jsonb not null default '{}'::jsonb;

-- ---- discovery seeds (admin-config; suggestion scope only) ------------------
create table if not exists public.source_discovery_seeds (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  seed_term text not null,
  enabled boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (category, seed_term)
);
alter table public.source_discovery_seeds add column if not exists enabled boolean not null default true;
create index if not exists idx_source_discovery_seeds_category on public.source_discovery_seeds (category);

insert into public.source_discovery_seeds (category, seed_term) values
  ('A', 'extremism research centers'), ('A', 'public ideology forums'), ('A', 'watchlist sources'),
  ('B', 'government press releases'), ('B', 'court opinions'), ('B', 'public policy sources'),
  ('C', 'OSINT research sources'), ('C', 'think tanks'), ('C', 'watchdog organizations'),
  ('D', 'news RSS'), ('D', 'podcast RSS'), ('D', 'YouTube channels'),
  ('Foundation', 'API feeds'), ('Foundation', 'threat intelligence feeds'), ('Foundation', 'archives')
on conflict (category, seed_term) do nothing;

-- ---- RLS for seeds (reviewer+ read, admin manage) --------------------------
alter table public.source_discovery_seeds enable row level security;
drop policy if exists source_discovery_seeds_read on public.source_discovery_seeds;
create policy source_discovery_seeds_read on public.source_discovery_seeds for select using (public.is_reviewer_or_above());
drop policy if exists source_discovery_seeds_admin on public.source_discovery_seeds;
create policy source_discovery_seeds_admin on public.source_discovery_seeds for all using (public.is_admin()) with check (public.is_admin());
