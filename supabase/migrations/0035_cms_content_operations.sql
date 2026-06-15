-- =============================================================================
-- Human Signal Index — 0035_cms_content_operations.sql
-- WorldForge / HSI (Phase 31) — CMS & Content Operations Layer.
--
-- Makes content OPERATOR-MANAGED: admins manage pages, navigation, media, email
-- templates, and the role/mission/badge/onboarding/report content from the
-- dashboard — no code changes. Content is code-FALLBACK: the app renders CMS
-- content when published, else the existing hardcoded copy, so nothing breaks.
--
-- PERMISSIONS (Deliverable 25): only ADMINS may write/publish CMS content
-- (admin-all RLS). Published pages + active navigation + content rows are
-- world-readable so public/marketing pages can render them. Researchers/reviewers
-- cannot publish. RBAC is unchanged — these are NEW tables with their own RLS;
-- nothing here edits auth, middleware, user_roles, or existing policies.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0034. CONVENTIONS match 0001-0034:
-- snake_case; gen_random_uuid() PKs; created_at default now(); CHECK enums;
-- set_updated_at() on mutable tables; APPEND-ONLY tables carry no trigger.
-- =============================================================================

-- =============================================================================
-- A. PAGES / BLOCKS / REVISIONS / PUBLISH EVENTS (Deliverables 1, 5–8).
-- =============================================================================
create table if not exists public.cms_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  page_type    text not null check (page_type in ('landing','content','report','knowledge','legal','help')),
  title        text not null,
  status       text not null default 'draft' check (status in ('draft','review','published','archived')),
  seo          jsonb,
  created_by   uuid references public.users(id) on delete set null,
  updated_by   uuid references public.users(id) on delete set null,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.cms_pages is 'HSI Phase 31: CMS pages (operator-managed). Only published pages are world-readable.';
create index if not exists idx_cms_pages_status on public.cms_pages(status);

create table if not exists public.cms_blocks (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.cms_pages(id) on delete cascade,
  block_type text not null check (block_type in ('hero','rich_text','image','quote','cta','faq','divider','card_grid')),
  position   integer not null default 0,
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (page_id, position)
);
comment on table public.cms_blocks is 'HSI Phase 31: ordered content blocks for a page.';
create index if not exists idx_cms_blocks_page on public.cms_blocks(page_id);

create table if not exists public.cms_revisions (
  id             uuid primary key default gen_random_uuid(),
  page_id        uuid not null references public.cms_pages(id) on delete cascade,
  author         uuid references public.users(id) on delete set null,
  change_summary text,
  snapshot       jsonb not null,
  created_at     timestamptz not null default now()
);
comment on table public.cms_revisions is 'HSI Phase 31: APPEND-ONLY page revisions (version history + rollback source).';
create index if not exists idx_cms_revisions_page on public.cms_revisions(page_id, created_at desc);

create table if not exists public.cms_publish_events (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid references public.cms_pages(id) on delete set null,
  action     text not null check (action in ('published','unpublished','archived','rolled_back')),
  actor      uuid references public.users(id) on delete set null,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
comment on table public.cms_publish_events is 'HSI Phase 31: APPEND-ONLY publish audit (who/when/what).';
create index if not exists idx_cms_publish_events_page on public.cms_publish_events(page_id, created_at desc);

-- =============================================================================
-- B. NAVIGATION + MEDIA (Deliverables 2, 3).
-- =============================================================================
create table if not exists public.cms_navigation (
  id         uuid primary key default gen_random_uuid(),
  location   text not null check (location in ('header','footer','dashboard_help')),
  label      text not null,
  href       text not null,
  position   integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);
comment on table public.cms_navigation is 'HSI Phase 31: operator-managed navigation (header/footer/help).';
create index if not exists idx_cms_navigation_loc on public.cms_navigation(location, position);

create table if not exists public.cms_media (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  mime_type   text,
  size_bytes  bigint,
  url         text not null,
  alt         text,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.cms_media is 'HSI Phase 31: media library (images/docs/logos/report assets).';

-- =============================================================================
-- C. STRUCTURED CONTENT (Deliverables 15–20).
-- =============================================================================
create table if not exists public.cms_email_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  subject    text not null,
  body       text not null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);
comment on table public.cms_email_templates is 'HSI Phase 31: editable email templates (invites/approvals/missions/notifications).';

create table if not exists public.cms_role_content (
  role        text primary key check (role in ('viewer','researcher','reviewer','curator','admin')),
  title       text,
  description text,
  updated_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.cms_role_content is 'HSI Phase 31: editable role descriptions.';

create table if not exists public.cms_mission_content (
  mission_key  text primary key,
  title        text,
  instructions text,
  rewards      text,
  requirements jsonb,
  updated_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.cms_mission_content is 'HSI Phase 31: editable mission copy (title/instructions/rewards/requirements).';

create table if not exists public.cms_badge_content (
  badge_id            text primary key,
  name                text,
  description         text,
  unlock_requirements text,
  updated_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz default now()
);
comment on table public.cms_badge_content is 'HSI Phase 31: editable badge copy.';

create table if not exists public.cms_onboarding_content (
  key        text primary key,
  title      text,
  body       text,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);
comment on table public.cms_onboarding_content is 'HSI Phase 31: editable onboarding copy (welcome/application/team/beta).';

create table if not exists public.cms_report_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  layout     jsonb not null default '{}'::jsonb,
  active     boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);
comment on table public.cms_report_templates is 'HSI Phase 31: public report/publication layout templates.';

-- =============================================================================
-- D. AUDIT LOG (Deliverable 26) — APPEND-ONLY.
-- =============================================================================
create table if not exists public.cms_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor       uuid references public.users(id) on delete set null,
  action      text not null,
  entity_kind text not null,
  entity_id   text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.cms_audit_log is 'HSI Phase 31: APPEND-ONLY CMS action audit.';
create index if not exists idx_cms_audit_actor on public.cms_audit_log(actor, created_at desc);

-- =============================================================================
-- E. updated_at triggers (mutable tables only).
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'cms_pages','cms_blocks','cms_navigation','cms_email_templates','cms_role_content',
    'cms_mission_content','cms_badge_content','cms_onboarding_content','cms_report_templates'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- =============================================================================
-- F. RLS — admin ALL (only admins write/publish, Deliverable 25). Public READ of
--    published/active content so marketing + dashboard pages render it.
-- =============================================================================

-- F1. cms_pages: published is world-readable; admin all.
alter table public.cms_pages enable row level security;
drop policy if exists cms_pages_admin_all on public.cms_pages;
drop policy if exists cms_pages_published_read on public.cms_pages;
create policy cms_pages_admin_all on public.cms_pages for all using (public.is_admin()) with check (public.is_admin());
create policy cms_pages_published_read on public.cms_pages for select using (status = 'published');

-- F2. cms_blocks: readable when their page is published; admin all.
alter table public.cms_blocks enable row level security;
drop policy if exists cms_blocks_admin_all on public.cms_blocks;
drop policy if exists cms_blocks_published_read on public.cms_blocks;
create policy cms_blocks_admin_all on public.cms_blocks for all using (public.is_admin()) with check (public.is_admin());
create policy cms_blocks_published_read on public.cms_blocks for select using (
  exists (select 1 from public.cms_pages p where p.id = cms_blocks.page_id and p.status = 'published')
);

-- F3. cms_navigation: active is world-readable; admin all.
alter table public.cms_navigation enable row level security;
drop policy if exists cms_navigation_admin_all on public.cms_navigation;
drop policy if exists cms_navigation_read on public.cms_navigation;
create policy cms_navigation_admin_all on public.cms_navigation for all using (public.is_admin()) with check (public.is_admin());
create policy cms_navigation_read on public.cms_navigation for select using (active);

-- F4. World-readable content tables; admin all.
do $$
declare t text;
begin
  foreach t in array array['cms_media','cms_role_content','cms_mission_content','cms_badge_content','cms_onboarding_content','cms_report_templates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
  end loop;
end$$;

-- F5. Admin-only tables (revisions / publish events / email templates / audit).
do $$
declare t text;
begin
  foreach t in array array['cms_revisions','cms_publish_events','cms_email_templates','cms_audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end$$;

-- =============================================================================
-- NOTE
-- Only admins can write/publish (admin-all RLS). The CMS DAL additionally gates
-- every mutation behind requireAdmin() and records cms_audit_log + cms_publish_
-- events. Public pages read PUBLISHED content with a code fallback, so removing or
-- unpublishing CMS content never breaks the site. No auth/RBAC/middleware changes.
-- =============================================================================

-- =============================================================================
-- End of 0035_cms_content_operations.sql
-- =============================================================================
