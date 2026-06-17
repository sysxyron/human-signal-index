-- =============================================================================
-- Human Signal Index — 0047_cms_footer_groups.sql
-- Phase 41B.3 (D) — CMS-managed footer navigation groups.
--
-- ADDITIVE ONLY (no breaking changes): adds a nullable `nav_group` column to
-- cms_navigation so footer links can be organized into sections (Platform,
-- About, Trust, Security & Reporting, …), and a public read policy so the public
-- footer can render ACTIVE nav items anonymously. No RBAC/auth/billing changes.
-- =============================================================================

alter table public.cms_navigation
  add column if not exists nav_group text;
comment on column public.cms_navigation.nav_group is 'HSI Phase 41B.3: footer/section group label (e.g. Platform, About, Trust). NULL = ungrouped.';

-- Public (anonymous-safe) read of ACTIVE navigation for the public footer/header.
-- Admin-all policies (0035) still authorize every write; this only adds read of
-- active rows. Multiple permissive policies are OR-ed by Postgres.
drop policy if exists cms_navigation_public_read on public.cms_navigation;
create policy cms_navigation_public_read on public.cms_navigation
  for select using (active = true);

-- =============================================================================
-- End of 0047_cms_footer_groups.sql
-- =============================================================================
