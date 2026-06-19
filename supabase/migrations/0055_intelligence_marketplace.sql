-- =============================================================================
-- HSI Phase 69 — Intelligence Marketplace.
--
-- A commercial/distribution layer that PACKAGES + CATALOGS existing HSI
-- intelligence (reports, forecasts, watchlists, source/narrative/evidence
-- collections, feeds, briefs). It does NOT create intelligence — products link
-- back to real assets (Phase 64/65/67) for provenance. ADDITIVE: no existing
-- table/column/policy modified. Commerce hooks (license/price/subscription/access)
-- are SCHEMA-READY only — no payments, no Stripe, no checkout in this phase.
--
-- SECURITY (RLS): published products are world-readable; admins manage; signed-in
-- users may favorite/rate; downloads are counter rows. IDEMPOTENT (0048–0054).
-- =============================================================================

-- ---- categories (seeded vocabulary = the 8 product types) -------------------
create table if not exists public.marketplace_categories (
  slug text primary key,
  label text not null,
  product_type text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.marketplace_categories (slug, label, product_type, description, sort_order) values
  ('research-report',    'Research Reports',          'RESEARCH_REPORT',    'Published research and analysis.',                 1),
  ('forecast-package',   'Forecast Packages',         'FORECAST_PACKAGE',   'Forecasts with recorded outcomes + calibration.', 2),
  ('watchlist',          'Watchlists',                'WATCHLIST',          'Curated source/term watchlists.',                 3),
  ('source-collection',  'Source Collections',        'SOURCE_COLLECTION',  'Vetted source sets with reliability metrics.',    4),
  ('narrative-package',  'Narrative Intelligence',    'NARRATIVE_PACKAGE',  'Narrative clusters + evolution + health.',        5),
  ('evidence-collection','Evidence Collections',      'EVIDENCE_COLLECTION','Provenance-backed evidence sets.',                6),
  ('monitoring-feed',    'Monitoring Feeds',          'MONITORING_FEED',    'Source-health + monitoring feeds.',               7),
  ('executive-brief',    'Executive Briefings',       'EXECUTIVE_BRIEF',    'Executive intelligence summaries.',               8)
on conflict (slug) do nothing;

-- ---- publishers -------------------------------------------------------------
create table if not exists public.marketplace_publishers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  bio text,
  organization_id uuid references public.organizations (id) on delete set null,
  owner_id uuid references public.users (id) on delete set null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.marketplace_publishers add column if not exists bio text;
alter table public.marketplace_publishers add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.marketplace_publishers add column if not exists owner_id uuid references public.users (id) on delete set null;
alter table public.marketplace_publishers add column if not exists verified boolean not null default false;
alter table public.marketplace_publishers add column if not exists updated_at timestamptz;

-- ---- products ---------------------------------------------------------------
create table if not exists public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  description text,
  product_type text not null check (product_type in (
    'RESEARCH_REPORT', 'FORECAST_PACKAGE', 'WATCHLIST', 'SOURCE_COLLECTION',
    'NARRATIVE_PACKAGE', 'EVIDENCE_COLLECTION', 'MONITORING_FEED', 'EXECUTIVE_BRIEF'
  )),
  category_slug text references public.marketplace_categories (slug) on delete set null,
  publisher_id uuid references public.marketplace_publishers (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  pinned boolean not null default false,
  version integer not null default 1,
  source_count integer not null default 0,
  evidence_count integer not null default 0,
  narrative_count integer not null default 0,
  forecast_count integer not null default 0,
  provenance_summary jsonb not null default '{}'::jsonb,
  -- future commerce hooks (schema-ready ONLY; no payment logic in this phase)
  license_type text not null default 'open',
  price_tier text,
  subscription_tier text,
  access_policy text not null default 'public',
  organization_id uuid references public.organizations (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  published_at timestamptz
);
alter table public.marketplace_products add column if not exists summary text;
alter table public.marketplace_products add column if not exists description text;
alter table public.marketplace_products add column if not exists category_slug text references public.marketplace_categories (slug) on delete set null;
alter table public.marketplace_products add column if not exists publisher_id uuid references public.marketplace_publishers (id) on delete set null;
alter table public.marketplace_products add column if not exists status text not null default 'draft';
alter table public.marketplace_products add column if not exists featured boolean not null default false;
alter table public.marketplace_products add column if not exists pinned boolean not null default false;
alter table public.marketplace_products add column if not exists version integer not null default 1;
alter table public.marketplace_products add column if not exists source_count integer not null default 0;
alter table public.marketplace_products add column if not exists evidence_count integer not null default 0;
alter table public.marketplace_products add column if not exists narrative_count integer not null default 0;
alter table public.marketplace_products add column if not exists forecast_count integer not null default 0;
alter table public.marketplace_products add column if not exists provenance_summary jsonb not null default '{}'::jsonb;
alter table public.marketplace_products add column if not exists license_type text not null default 'open';
alter table public.marketplace_products add column if not exists price_tier text;
alter table public.marketplace_products add column if not exists subscription_tier text;
alter table public.marketplace_products add column if not exists access_policy text not null default 'public';
alter table public.marketplace_products add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.marketplace_products add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.marketplace_products add column if not exists updated_at timestamptz;
alter table public.marketplace_products add column if not exists published_at timestamptz;
create index if not exists idx_marketplace_products_status on public.marketplace_products (status);
create index if not exists idx_marketplace_products_type on public.marketplace_products (product_type);
create index if not exists idx_marketplace_products_publisher on public.marketplace_products (publisher_id);

-- ---- versions (history) -----------------------------------------------------
create table if not exists public.marketplace_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products (id) on delete cascade,
  version integer not null,
  changelog text,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.marketplace_versions add column if not exists changelog text;
alter table public.marketplace_versions add column if not exists snapshot jsonb not null default '{}'::jsonb;
create index if not exists idx_marketplace_versions_product on public.marketplace_versions (product_id, version desc);

-- ---- product assets (provenance links to real intelligence) -----------------
create table if not exists public.marketplace_product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products (id) on delete cascade,
  asset_type text not null check (asset_type in (
    'SOURCE', 'SIGNAL', 'EVIDENCE', 'NARRATIVE', 'FORECAST', 'PUBLICATION', 'GRAPH_NODE', 'WATCHLIST', 'CORRECTION'
  )),
  asset_id text not null,
  label text,
  created_at timestamptz not null default now()
);
alter table public.marketplace_product_assets add column if not exists label text;
create index if not exists idx_marketplace_assets_product on public.marketplace_product_assets (product_id);

-- ---- collections (curated bundles) -----------------------------------------
create table if not exists public.marketplace_collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  curated boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.marketplace_collections add column if not exists description text;
alter table public.marketplace_collections add column if not exists curated boolean not null default true;

-- ---- engagement (downloads / ratings / favorites) ---------------------------
create table if not exists public.marketplace_downloads (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  kind text not null default 'download' check (kind in ('download', 'view')),
  created_at timestamptz not null default now()
);
alter table public.marketplace_downloads add column if not exists kind text not null default 'download';
create index if not exists idx_marketplace_downloads_product on public.marketplace_downloads (product_id, kind);

create table if not exists public.marketplace_ratings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (product_id, user_id)
);
alter table public.marketplace_ratings add column if not exists review text;
alter table public.marketplace_ratings add column if not exists updated_at timestamptz;
create index if not exists idx_marketplace_ratings_product on public.marketplace_ratings (product_id);

create table if not exists public.marketplace_favorites (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index if not exists idx_marketplace_favorites_product on public.marketplace_favorites (product_id);
create index if not exists idx_marketplace_favorites_user on public.marketplace_favorites (user_id);

-- ---- RLS --------------------------------------------------------------------
alter table public.marketplace_categories enable row level security;
alter table public.marketplace_publishers enable row level security;
alter table public.marketplace_products enable row level security;
alter table public.marketplace_versions enable row level security;
alter table public.marketplace_product_assets enable row level security;
alter table public.marketplace_collections enable row level security;
alter table public.marketplace_downloads enable row level security;
alter table public.marketplace_ratings enable row level security;
alter table public.marketplace_favorites enable row level security;

-- categories / publishers / collections: world-readable; admin manage.
drop policy if exists marketplace_categories_read on public.marketplace_categories;
create policy marketplace_categories_read on public.marketplace_categories for select using (true);
drop policy if exists marketplace_categories_admin on public.marketplace_categories;
create policy marketplace_categories_admin on public.marketplace_categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists marketplace_publishers_read on public.marketplace_publishers;
create policy marketplace_publishers_read on public.marketplace_publishers for select using (true);
drop policy if exists marketplace_publishers_admin on public.marketplace_publishers;
create policy marketplace_publishers_admin on public.marketplace_publishers for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists marketplace_collections_read on public.marketplace_collections;
create policy marketplace_collections_read on public.marketplace_collections for select using (true);
drop policy if exists marketplace_collections_admin on public.marketplace_collections;
create policy marketplace_collections_admin on public.marketplace_collections for all using (public.is_admin()) with check (public.is_admin());

-- products: PUBLISHED rows are world-readable; admins see/manage all.
drop policy if exists marketplace_products_read on public.marketplace_products;
create policy marketplace_products_read on public.marketplace_products for select using (status = 'published' or public.is_admin());
drop policy if exists marketplace_products_admin on public.marketplace_products;
create policy marketplace_products_admin on public.marketplace_products for all using (public.is_admin()) with check (public.is_admin());

-- versions / assets: readable only when the parent product is published (or admin).
drop policy if exists marketplace_versions_read on public.marketplace_versions;
create policy marketplace_versions_read on public.marketplace_versions for select using (
  public.is_admin() or exists (select 1 from public.marketplace_products p where p.id = product_id and p.status = 'published'));
drop policy if exists marketplace_versions_admin on public.marketplace_versions;
create policy marketplace_versions_admin on public.marketplace_versions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists marketplace_assets_read on public.marketplace_product_assets;
create policy marketplace_assets_read on public.marketplace_product_assets for select using (
  public.is_admin() or exists (select 1 from public.marketplace_products p where p.id = product_id and p.status = 'published'));
drop policy if exists marketplace_assets_admin on public.marketplace_product_assets;
create policy marketplace_assets_admin on public.marketplace_product_assets for all using (public.is_admin()) with check (public.is_admin());

-- ratings: world-readable; a signed-in user manages their OWN; admin manage.
drop policy if exists marketplace_ratings_read on public.marketplace_ratings;
create policy marketplace_ratings_read on public.marketplace_ratings for select using (true);
drop policy if exists marketplace_ratings_owner on public.marketplace_ratings;
create policy marketplace_ratings_owner on public.marketplace_ratings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists marketplace_ratings_admin on public.marketplace_ratings;
create policy marketplace_ratings_admin on public.marketplace_ratings for all using (public.is_admin()) with check (public.is_admin());

-- favorites: a signed-in user manages their OWN; admin read.
drop policy if exists marketplace_favorites_owner on public.marketplace_favorites;
create policy marketplace_favorites_owner on public.marketplace_favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists marketplace_favorites_admin on public.marketplace_favorites;
create policy marketplace_favorites_admin on public.marketplace_favorites for select using (public.is_admin());

-- downloads: a signed-in user may log their own; admin reads. (Public counts use
-- the service-role read path in the cached service.)
drop policy if exists marketplace_downloads_insert on public.marketplace_downloads;
create policy marketplace_downloads_insert on public.marketplace_downloads for insert with check (auth.uid() = user_id or user_id is null);
drop policy if exists marketplace_downloads_admin on public.marketplace_downloads;
create policy marketplace_downloads_admin on public.marketplace_downloads for select using (public.is_admin());
