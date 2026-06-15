-- =============================================================================
-- Human Signal Index — 0044_advanced_source_collection.sql
-- WorldForge / HSI (Phase 40) — Advanced source-collection framework.
--
-- Adds watchlist snapshots + diffs and capture-event telemetry on top of the
-- Phase-7 signal intelligence network (hsin_sources), plus a per-source `config`
-- jsonb for type-specific settings (capture interval, content selector, subreddit,
-- api method, …). NO source_type CHECK exists on hsin_sources, so the new source
-- types (news/research/reddit/social/government/watchlist/email/api/webhook/
-- archive/intelligence_feed) work without a constraint change.
--
-- GOVERNANCE: shared-observatory RLS mirrors 0011 — authenticated read, researcher+
-- insert, admin all. PUBLIC-only capture (enforced in @hsi/source-connectors). NO
-- RBAC/auth/user_roles/billing/Stripe changes. ADD-ONLY (0001-0043).
-- =============================================================================

-- =============================================================================
-- A. Per-source config (type-specific settings). Additive jsonb column.
-- =============================================================================
alter table public.hsin_sources
  add column if not exists config jsonb not null default '{}'::jsonb;
comment on column public.hsin_sources.config is 'HSI Phase 40: type-specific source config (captureUrl, connector, captureIntervalMinutes, contentSelector, subreddit, apiMethod, …).';

-- =============================================================================
-- B. SOURCE SNAPSHOTS — watchlist point-in-time captures (no-RSS pages).
-- =============================================================================
create table if not exists public.source_snapshots (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.hsin_sources(id) on delete cascade,
  url           text not null,
  content_text  text,
  content_hash  text not null,
  captured_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
comment on table public.source_snapshots is 'HSI Phase 40: watchlist page snapshots (readable text + content hash).';
create index if not exists idx_source_snapshots_source on public.source_snapshots(source_id, captured_at desc);
create index if not exists idx_source_snapshots_hash on public.source_snapshots(source_id, content_hash);

-- =============================================================================
-- C. SOURCE DIFFS — change detection between consecutive snapshots.
-- =============================================================================
create table if not exists public.source_diffs (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.hsin_sources(id) on delete cascade,
  snapshot_id    uuid references public.source_snapshots(id) on delete set null,
  changed        boolean not null default false,
  previous_hash  text,
  new_hash       text not null,
  added_chars    integer not null default 0,
  removed_chars  integer not null default 0,
  signal_id      uuid references public.hsin_signals(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.source_diffs is 'HSI Phase 40: snapshot-to-snapshot diffs; links the signal created on change.';
create index if not exists idx_source_diffs_source on public.source_diffs(source_id, created_at desc);

-- =============================================================================
-- D. SOURCE CAPTURE EVENTS — per-attempt capture telemetry + health.
-- =============================================================================
create table if not exists public.source_capture_events (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.hsin_sources(id) on delete cascade,
  source_type     text not null,
  connector       text,
  status          text not null default 'healthy'
                    check (status in ('healthy','warning','failing','disabled','unsupported','needs_configuration')),
  reason          text,
  items_captured  integer not null default 0,
  content_changed boolean not null default false,
  error           text,
  captured_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
comment on table public.source_capture_events is 'HSI Phase 40: per-attempt capture telemetry + health state (explains zero-signal cases).';
create index if not exists idx_source_capture_events_source on public.source_capture_events(source_id, created_at desc);
create index if not exists idx_source_capture_events_status on public.source_capture_events(status, created_at desc);

-- =============================================================================
-- RLS — shared-observatory model (mirrors 0011): authenticated read, researcher+
-- insert, admin all. Reuses is_admin() / is_researcher_or_above() from 0011.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['source_snapshots','source_diffs','source_capture_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_researcher_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for insert with check (public.is_researcher_or_above())', t || '_researcher_ins', t);
    execute format('create policy %I on public.%I for select using (auth.uid() is not null)', t || '_auth_read', t);
  end loop;
end$$;

-- =============================================================================
-- NOTE
-- @hsi/source-collectors validates + normalizes sources by type (rejecting Spotify
-- URLs for podcasts, suggesting reddit .rss, requiring feeds where needed), routes
-- capture by type (rss/atom feeds, reddit, watchlist page text), snapshots + diffs
-- watchlist pages, and derives an explicit health state with a clear reason — so a
-- source never silently produces zero signals. The worker routes by source type;
-- the web DAL persists config + reads health. No RBAC/auth/billing changes.
-- =============================================================================

-- =============================================================================
-- End of 0044_advanced_source_collection.sql
-- =============================================================================
