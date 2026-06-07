-- =============================================================================
-- Human Signal Index — 0004_storage_buckets.sql
-- Storage buckets + storage.objects RLS policies.
--
-- BUCKETS
--   evidence              -> PRIVATE. Raw chain-of-custody evidence captures.
--                            Read/write: admin + reviewer only. Never public.
--   uploads               -> PRIVATE. Operator-uploaded source files.
--                            Read/write: admin + reviewer only. Never public.
--   public-report-assets  -> PUBLIC-READ. Images/PDFs attached to PUBLISHED
--                            reports. Anyone may read; only admin/reviewer write.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create buckets (idempotent upsert). `public = false` keeps the object
--    listing private; `public = true` exposes objects via the public CDN URL.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('evidence',             'evidence',             false),
  ('uploads',              'uploads',              false),
  ('public-report-assets', 'public-report-assets', true)
on conflict (id) do update set public = excluded.public;

-- -----------------------------------------------------------------------------
-- 2. RLS policies on storage.objects.
--    storage.objects already has RLS enabled by Supabase. We add per-bucket
--    policies. The helper functions from 0002 (is_admin / is_reviewer_or_admin)
--    are reused for consistency with table-level access control.
-- -----------------------------------------------------------------------------

-- ---------- evidence (private) ------------------------------------------------
-- Only admin + reviewer may read, write, update, or delete evidence objects.
drop policy if exists evidence_read   on storage.objects;
drop policy if exists evidence_insert on storage.objects;
drop policy if exists evidence_update on storage.objects;
drop policy if exists evidence_delete on storage.objects;

create policy evidence_read on storage.objects
  for select using (bucket_id = 'evidence' and public.is_reviewer_or_admin());
create policy evidence_insert on storage.objects
  for insert with check (bucket_id = 'evidence' and public.is_reviewer_or_admin());
create policy evidence_update on storage.objects
  for update using (bucket_id = 'evidence' and public.is_reviewer_or_admin())
  with check (bucket_id = 'evidence' and public.is_reviewer_or_admin());
create policy evidence_delete on storage.objects
  for delete using (bucket_id = 'evidence' and public.is_admin());

-- ---------- uploads (private) -------------------------------------------------
-- Only admin + reviewer may read, write, update, or delete uploaded objects.
drop policy if exists uploads_read   on storage.objects;
drop policy if exists uploads_insert on storage.objects;
drop policy if exists uploads_update on storage.objects;
drop policy if exists uploads_delete on storage.objects;

create policy uploads_read on storage.objects
  for select using (bucket_id = 'uploads' and public.is_reviewer_or_admin());
create policy uploads_insert on storage.objects
  for insert with check (bucket_id = 'uploads' and public.is_reviewer_or_admin());
create policy uploads_update on storage.objects
  for update using (bucket_id = 'uploads' and public.is_reviewer_or_admin())
  with check (bucket_id = 'uploads' and public.is_reviewer_or_admin());
create policy uploads_delete on storage.objects
  for delete using (bucket_id = 'uploads' and public.is_admin());

-- ---------- public-report-assets (public-read) --------------------------------
-- Anyone (incl. anon) may READ; only admin + reviewer may WRITE.
-- These assets are intended to accompany published, approved public reports.
drop policy if exists report_assets_read   on storage.objects;
drop policy if exists report_assets_insert on storage.objects;
drop policy if exists report_assets_update on storage.objects;
drop policy if exists report_assets_delete on storage.objects;

create policy report_assets_read on storage.objects
  for select using (bucket_id = 'public-report-assets');
create policy report_assets_insert on storage.objects
  for insert with check (bucket_id = 'public-report-assets' and public.is_reviewer_or_admin());
create policy report_assets_update on storage.objects
  for update using (bucket_id = 'public-report-assets' and public.is_reviewer_or_admin())
  with check (bucket_id = 'public-report-assets' and public.is_reviewer_or_admin());
create policy report_assets_delete on storage.objects
  for delete using (bucket_id = 'public-report-assets' and public.is_admin());

-- =============================================================================
-- End of 0004.
-- =============================================================================
