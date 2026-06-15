-- =============================================================================
-- Human Signal Index — 0038_cms_platform_conversion.sql
-- WorldForge / HSI (Phase 34) — CMS Platform Conversion & Site Operations.
--
-- Extends the Phase-31 CMS so an admin can operate the whole site (branding,
-- navigation visibility, role/mission/badge content, media archive) without code:
--   * cms_site_settings            — branding + site settings (singleton row).
--   * cms_navigation.visibility    — render-only audience (all/role/tester/admin).
--   * cms_navigation location enum — adds dashboard/admin/help locations.
--   * cms_role_content.details     — responsibilities/benefits/advancement (jsonb).
--   * cms_mission_content          — + xp_reward / intel_credits / difficulty / badge_rewards.
--   * cms_badge_content            — + icon / rewards.
--   * cms_media.archived           — soft-archive.
--   * cms_audit_log                — + previous_value / new_value (change tracking).
--
-- GOVERNANCE (hard constraints): nav VISIBILITY controls RENDERING ONLY — never
-- permissions/RBAC. Nothing here changes auth, middleware, user_roles, or IAM.
-- Admin-only writes (admin-all RLS, unchanged). All additive.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0037. CONVENTIONS match 0001-0037.
-- =============================================================================

-- =============================================================================
-- A. SITE SETTINGS (B1) — single-row settings; world-readable, admin-write.
-- =============================================================================
create table if not exists public.cms_site_settings (
  id            text primary key default 'default',
  site_name     text,
  logo_url      text,
  favicon_url   text,
  footer_text   text,
  contact_email text,
  social_links  jsonb not null default '{}'::jsonb,
  theme         jsonb not null default '{}'::jsonb,
  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz default now()
);
comment on table public.cms_site_settings is 'HSI Phase 34: operator-managed branding + site settings (singleton id=default).';
insert into public.cms_site_settings (id, site_name, footer_text, contact_email)
  values ('default', 'Human Signal Index', '© Human Signal Index. Governed contributor intelligence.', 'contact@hsi.example')
  on conflict (id) do nothing;

-- =============================================================================
-- B. NAVIGATION — add visibility + extend locations (C1, C2).
-- =============================================================================
alter table public.cms_navigation
  add column if not exists visibility text not null default 'all'
    check (visibility in ('all','observer','researcher','reviewer','governor','tester','admin'));
comment on column public.cms_navigation.visibility is 'HSI Phase 34: RENDER-ONLY audience. Never a permission — RBAC + middleware enforce access.';
alter table public.cms_navigation drop constraint if exists cms_navigation_location_check;
alter table public.cms_navigation add constraint cms_navigation_location_check check (location in (
  'header','footer','dashboard_help','dashboard','admin','help'
));

-- =============================================================================
-- C. ROLE / MISSION / BADGE content — richer operator fields (D1, E1, F1).
-- =============================================================================
alter table public.cms_role_content add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.cms_mission_content
  add column if not exists xp_reward integer not null default 0,
  add column if not exists intel_credits integer not null default 0,
  add column if not exists difficulty text default 'standard' check (difficulty in ('intro','standard','advanced','elite')),
  add column if not exists badge_rewards jsonb not null default '[]'::jsonb;

alter table public.cms_badge_content
  add column if not exists icon text,
  add column if not exists rewards text;

-- =============================================================================
-- D. MEDIA — soft-archive (G1).
-- =============================================================================
alter table public.cms_media add column if not exists archived boolean not null default false;
create index if not exists idx_cms_media_archived on public.cms_media(archived);

-- =============================================================================
-- E. AUDIT — change tracking with before/after (I1).
-- =============================================================================
alter table public.cms_audit_log
  add column if not exists previous_value jsonb,
  add column if not exists new_value jsonb;

-- =============================================================================
-- F. updated_at trigger for site settings.
-- =============================================================================
drop trigger if exists set_updated_at on public.cms_site_settings;
create trigger set_updated_at before update on public.cms_site_settings
  for each row execute function public.set_updated_at();

-- =============================================================================
-- G. RLS — cms_site_settings: world-readable (branding), admin-write.
-- =============================================================================
alter table public.cms_site_settings enable row level security;
drop policy if exists cms_site_settings_admin_all on public.cms_site_settings;
drop policy if exists cms_site_settings_read on public.cms_site_settings;
create policy cms_site_settings_admin_all on public.cms_site_settings for all using (public.is_admin()) with check (public.is_admin());
create policy cms_site_settings_read on public.cms_site_settings for select using (true);

-- =============================================================================
-- NOTE
-- The Phase-34 site-ops DAL writes these tables admin-only (requireAdmin +
-- admin-all RLS) and records cms_audit_log with previous_value/new_value. Nav
-- visibility is render-only (the sidebar already RBAC-gates every route). No
-- auth/RBAC/middleware/user_roles changes.
-- =============================================================================

-- =============================================================================
-- End of 0038_cms_platform_conversion.sql
-- =============================================================================
