-- =============================================================================
-- Human Signal Index — 0023_publishing_and_subscribers.sql
-- WorldForge / HSI (Phase 19) — Public Intelligence Publishing, Subscriber
-- Network & Distribution Engine.
--
-- Phase 19 turns the internal intelligence OS into a PUBLIC platform: governed
-- research becomes publishable, traceable, trust-aware reports; subscribers
-- receive digests; reports are distributed via feeds. NOTHING auto-publishes —
-- publishing stays human-approved, governed, auditable, and reversible.
--
--   * hsin_publications           — the unit of published intelligence (lifecycle
--       state, trust/confidence/evidence/source rollups, categories/topics).
--   * hsin_publication_versions   — APPEND-ONLY version snapshots of a publication.
--   * hsin_publication_reviews    — APPEND-ONLY governance publish-review decisions
--       (approved/rejected + the canPublish gate snapshot).
--   * hsin_publication_retractions— APPEND-ONLY retraction records (reason/detail);
--       retractions remain VISIBLE — history is never deleted.
--   * hsin_subscribers            — subscriber accounts (FREE/RESEARCHER/ANALYST/ORG).
--   * hsin_subscription_preferences — per-subscriber digest/topic/notification/
--       delivery preferences.
--   * hsin_digest_runs            — generated digest runs (daily/weekly/topic).
--   * hsin_distribution_events    — planned/performed distributions per subscriber.
--   * hsin_topic_pages            — public topic aggregation pages.
--
-- ---------------------------------------------------------------------------
-- PUBLIC ACCESS — this is the FIRST migration to grant ANONYMOUS read. Only
-- PUBLISHED / RETRACTED publications (and their public topic pages) are world-
-- readable; everything else (drafts, reviews, subscribers, distribution) stays
-- behind the researcher+/curator role ladder. A subscriber may read/write only
-- their OWN row (auth.uid() = user_id).
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY. It does NOT edit migrations 0001-0022.
--
-- CONVENTIONS (match 0001-0022): snake_case; gen_random_uuid() PKs; created_at
-- default now(); CHECK-guarded enums + ranges; the shared set_updated_at() trigger
-- on mutable tables; APPEND-ONLY tables carry no updated_at trigger. RLS via
-- public.is_admin() / public.is_researcher_or_above() / public.is_curator_or_admin().
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

-- ---------- hsin_publications -------------------------------------------------
create table if not exists public.hsin_publications (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique,
  title             text,
  summary           text,
  state             text check (state in (
                      'DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED','ARCHIVED','RETRACTED')) default 'DRAFT',
  run_id            uuid references public.hsin_research_runs(id) on delete set null,
  trust_score       numeric check (trust_score is null or (trust_score >= 0 and trust_score <= 100)),
  confidence        numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_count    int default 0,
  source_count      int default 0,
  categories        jsonb,
  topics            jsonb,
  review_status     text,
  governance_status text,
  body              jsonb,
  published_at      timestamptz,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz default now()
);
comment on table public.hsin_publications is
  'HSIN Phase 19: the unit of published intelligence (lifecycle state + trust/evidence/source rollups). Only PUBLISHED/RETRACTED are world-readable.';

-- ---------- hsin_publication_versions -----------------------------------------
create table if not exists public.hsin_publication_versions (
  id             uuid primary key default gen_random_uuid(),
  publication_id uuid references public.hsin_publications(id) on delete cascade,
  version        int default 1,
  from_state     text,
  to_state       text,
  actor          text,
  reason         text,
  snapshot       jsonb,
  at             timestamptz,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_publication_versions is
  'HSIN Phase 19: APPEND-ONLY publication version/transition snapshots (the audited history).';

-- ---------- hsin_publication_reviews ------------------------------------------
create table if not exists public.hsin_publication_reviews (
  id             uuid primary key default gen_random_uuid(),
  publication_id uuid references public.hsin_publications(id) on delete cascade,
  reviewer_id    uuid references public.users(id) on delete set null,
  decision       text check (decision in ('approved','rejected')),
  reason         text,
  gate           jsonb,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_publication_reviews is
  'HSIN Phase 19: APPEND-ONLY governance publish-review decisions (approved/rejected + the canPublish gate snapshot).';

-- ---------- hsin_publication_retractions --------------------------------------
create table if not exists public.hsin_publication_retractions (
  id             uuid primary key default gen_random_uuid(),
  publication_id uuid references public.hsin_publications(id) on delete cascade,
  reason         text check (reason in (
                   'evidence_error','trust_collapse','governance_decision','data_quality_issue','methodology_issue')),
  detail         text,
  previous_state text,
  retracted_by   uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_publication_retractions is
  'HSIN Phase 19: APPEND-ONLY retraction records (reason/detail); retractions remain visible, history is never deleted.';

-- ---------- hsin_subscribers --------------------------------------------------
create table if not exists public.hsin_subscribers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  email       text,
  type        text check (type in ('FREE','RESEARCHER','ANALYST','ORGANIZATION')) default 'FREE',
  active      boolean default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.hsin_subscribers is
  'HSIN Phase 19: subscriber accounts (FREE/RESEARCHER/ANALYST/ORGANIZATION).';

-- ---------- hsin_subscription_preferences -------------------------------------
create table if not exists public.hsin_subscription_preferences (
  id                   uuid primary key default gen_random_uuid(),
  subscriber_id        uuid references public.hsin_subscribers(id) on delete cascade,
  digest_frequency     text check (digest_frequency in ('none','daily','weekly')) default 'weekly',
  topics               jsonb,
  notify_trust_changes boolean default true,
  notify_retractions   boolean default true,
  channels             jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz default now(),
  unique (subscriber_id)
);
comment on table public.hsin_subscription_preferences is
  'HSIN Phase 19: per-subscriber digest/topic/notification/delivery preferences.';

-- ---------- hsin_digest_runs --------------------------------------------------
create table if not exists public.hsin_digest_runs (
  id           uuid primary key default gen_random_uuid(),
  kind         text check (kind in ('daily','weekly','topic')),
  topic        text,
  title        text,
  period_start timestamptz,
  period_end   timestamptz,
  item_count   int default 0,
  dropped_no_source int default 0,
  items        jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.hsin_digest_runs is
  'HSIN Phase 19: generated digest runs (daily/weekly/topic) with item + dropped counts.';

-- ---------- hsin_distribution_events ------------------------------------------
create table if not exists public.hsin_distribution_events (
  id            uuid primary key default gen_random_uuid(),
  digest_run_id uuid references public.hsin_digest_runs(id) on delete set null,
  subscriber_id uuid references public.hsin_subscribers(id) on delete cascade,
  channel       text check (channel in ('email','rss','json','webhook')),
  kind          text check (kind in ('digest','feed','webhook')),
  ref           text,
  item_count    int default 0,
  status        text check (status in ('planned','sent','failed')) default 'planned',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz default now()
);
comment on table public.hsin_distribution_events is
  'HSIN Phase 19: planned/performed distributions per subscriber + channel.';

-- ---------- hsin_topic_pages --------------------------------------------------
create table if not exists public.hsin_topic_pages (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  title       text,
  description text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.hsin_topic_pages is
  'HSIN Phase 19: public topic aggregation pages (history/archaeology/genetics/…).';

-- =============================================================================
-- B. INDEXES
-- =============================================================================
create index if not exists idx_hsin_publications_state      on public.hsin_publications(state);
create index if not exists idx_hsin_publications_slug       on public.hsin_publications(slug);
create index if not exists idx_hsin_publications_run_id     on public.hsin_publications(run_id);
create index if not exists idx_hsin_publications_published_at on public.hsin_publications(published_at);

create index if not exists idx_hsin_publication_versions_pub on public.hsin_publication_versions(publication_id);
create index if not exists idx_hsin_publication_reviews_pub  on public.hsin_publication_reviews(publication_id);
create index if not exists idx_hsin_publication_retractions_pub on public.hsin_publication_retractions(publication_id);

create index if not exists idx_hsin_subscribers_user_id on public.hsin_subscribers(user_id);
create index if not exists idx_hsin_subscribers_type    on public.hsin_subscribers(type);
create index if not exists idx_hsin_subscription_preferences_sub on public.hsin_subscription_preferences(subscriber_id);

create index if not exists idx_hsin_digest_runs_kind       on public.hsin_digest_runs(kind);
create index if not exists idx_hsin_digest_runs_created_at on public.hsin_digest_runs(created_at);

create index if not exists idx_hsin_distribution_events_subscriber on public.hsin_distribution_events(subscriber_id);
create index if not exists idx_hsin_distribution_events_digest     on public.hsin_distribution_events(digest_run_id);
create index if not exists idx_hsin_distribution_events_status     on public.hsin_distribution_events(status);

create index if not exists idx_hsin_topic_pages_slug on public.hsin_topic_pages(slug);

-- =============================================================================
-- C. UPDATED_AT TRIGGERS — on the mutable tables (publications, subscribers,
-- subscription_preferences, digest_runs, distribution_events, topic_pages). The
-- three APPEND-ONLY tables (versions, reviews, retractions) carry no trigger.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_publications;
create trigger trg_set_updated_at before update on public.hsin_publications
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.hsin_subscribers;
create trigger trg_set_updated_at before update on public.hsin_subscribers
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.hsin_subscription_preferences;
create trigger trg_set_updated_at before update on public.hsin_subscription_preferences
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.hsin_digest_runs;
create trigger trg_set_updated_at before update on public.hsin_digest_runs
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.hsin_distribution_events;
create trigger trg_set_updated_at before update on public.hsin_distribution_events
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at on public.hsin_topic_pages;
create trigger trg_set_updated_at before update on public.hsin_topic_pages
  for each row execute function public.set_updated_at();

-- =============================================================================
-- D. ENABLE RLS
-- =============================================================================
alter table public.hsin_publications              enable row level security;
alter table public.hsin_publication_versions      enable row level security;
alter table public.hsin_publication_reviews       enable row level security;
alter table public.hsin_publication_retractions   enable row level security;
alter table public.hsin_subscribers               enable row level security;
alter table public.hsin_subscription_preferences  enable row level security;
alter table public.hsin_digest_runs               enable row level security;
alter table public.hsin_distribution_events       enable row level security;
alter table public.hsin_topic_pages               enable row level security;

-- =============================================================================
-- E. POLICIES
-- =============================================================================

-- ---------- hsin_publications: PUBLIC read of PUBLISHED/RETRACTED -------------
drop policy if exists hsin_publications_public_read on public.hsin_publications;
drop policy if exists hsin_publications_staff_read  on public.hsin_publications;
drop policy if exists hsin_publications_admin_all   on public.hsin_publications;
drop policy if exists hsin_publications_curator_ins on public.hsin_publications;
drop policy if exists hsin_publications_curator_upd on public.hsin_publications;
drop policy if exists hsin_publications_curator_del on public.hsin_publications;

-- ANYONE (incl. anon) may read published/retracted publications.
create policy hsin_publications_public_read on public.hsin_publications
  for select using (state in ('PUBLISHED','RETRACTED'));
-- researcher+ may read every state (drafts, under-review, …).
create policy hsin_publications_staff_read on public.hsin_publications
  for select using (public.is_researcher_or_above());
create policy hsin_publications_admin_all on public.hsin_publications
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_publications_curator_ins on public.hsin_publications
  for insert with check (public.is_curator_or_admin());
create policy hsin_publications_curator_upd on public.hsin_publications
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_publications_curator_del on public.hsin_publications
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_publication_retractions: PUBLIC read (retractions visible) ---
drop policy if exists hsin_publication_retractions_public_read on public.hsin_publication_retractions;
drop policy if exists hsin_publication_retractions_admin_all   on public.hsin_publication_retractions;
drop policy if exists hsin_publication_retractions_curator_ins on public.hsin_publication_retractions;
create policy hsin_publication_retractions_public_read on public.hsin_publication_retractions
  for select using (true);
create policy hsin_publication_retractions_admin_all on public.hsin_publication_retractions
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_publication_retractions_curator_ins on public.hsin_publication_retractions
  for insert with check (public.is_curator_or_admin());

-- ---------- hsin_topic_pages: PUBLIC read -------------------------------------
drop policy if exists hsin_topic_pages_public_read on public.hsin_topic_pages;
drop policy if exists hsin_topic_pages_admin_all   on public.hsin_topic_pages;
drop policy if exists hsin_topic_pages_curator_ins on public.hsin_topic_pages;
drop policy if exists hsin_topic_pages_curator_upd on public.hsin_topic_pages;
create policy hsin_topic_pages_public_read on public.hsin_topic_pages
  for select using (true);
create policy hsin_topic_pages_admin_all on public.hsin_topic_pages
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_topic_pages_curator_ins on public.hsin_topic_pages
  for insert with check (public.is_curator_or_admin());
create policy hsin_topic_pages_curator_upd on public.hsin_topic_pages
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());

-- ---------- hsin_subscribers + preferences: OWN row (auth.uid) ----------------
drop policy if exists hsin_subscribers_own       on public.hsin_subscribers;
drop policy if exists hsin_subscribers_own_write on public.hsin_subscribers;
drop policy if exists hsin_subscribers_admin_all on public.hsin_subscribers;
create policy hsin_subscribers_admin_all on public.hsin_subscribers
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_subscribers_own on public.hsin_subscribers
  for select using (user_id = auth.uid() or public.is_curator_or_admin());
create policy hsin_subscribers_own_write on public.hsin_subscribers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists hsin_subscription_preferences_own on public.hsin_subscription_preferences;
drop policy if exists hsin_subscription_preferences_admin_all on public.hsin_subscription_preferences;
create policy hsin_subscription_preferences_admin_all on public.hsin_subscription_preferences
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_subscription_preferences_own on public.hsin_subscription_preferences
  for all using (
    subscriber_id in (select id from public.hsin_subscribers where user_id = auth.uid())
    or public.is_curator_or_admin()
  ) with check (
    subscriber_id in (select id from public.hsin_subscribers where user_id = auth.uid())
    or public.is_curator_or_admin()
  );

-- ---------- staff-only tables (versions / reviews / digest / distribution) ----
-- researcher+ read; curator/admin write; admin all — applied via a DO block.
do $$
declare
  t text;
  tables text[] := array[
    'hsin_publication_versions','hsin_publication_reviews',
    'hsin_digest_runs','hsin_distribution_events'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_del', t);

    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.is_curator_or_admin())', t || '_curator_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin())', t || '_curator_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_curator_or_admin())', t || '_curator_del', t);
  end loop;
end $$;

-- =============================================================================
-- NOTE ON SERVICE ROLE + ANON
-- The Supabase service_role key bypasses RLS (the publishing worker uses it to
-- generate digests + plan distribution). The ANON key may read ONLY published/
-- retracted publications, retraction records, and topic pages (the public portal).
-- All draft/review/subscriber/distribution data stays behind the role ladder.
-- NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0023_publishing_and_subscribers.sql
-- =============================================================================
