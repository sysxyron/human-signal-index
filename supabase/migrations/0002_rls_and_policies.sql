-- =============================================================================
-- Human Signal Index — 0002_rls_and_policies.sql
-- Row Level Security (RLS) + role-based access policies.
--
-- ROLE MODEL
--   admin     -> full read/write on everything.
--   reviewer  -> read all; write reviews / classifications / risk_scores /
--                comments; may approve (set reviewer_status / published).
--   viewer    -> read ONLY non-sensitive, PUBLISHED content (published
--                public_reports + their approved citations + the published
--                signals/sources behind them). Never raw evidence/uploads.
--   anon      -> same as viewer but unauthenticated. Published-only.
--
-- KEY CONFIDENTIALITY RULE
--   evidence_items / uploaded_files / signals that are NOT linked to a
--   PUBLISHED public_report must NOT be readable by viewer or anon.
--   Private evidence is never public unless explicitly published.
--
-- IDENTITY MODEL
--   We assume application "users" rows are keyed by the Supabase auth user id
--   (users.id == auth.uid()). user_roles links users -> roles. The helper
--   functions below resolve the caller's role from that join.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read user_roles regardless of
-- the caller's own RLS on those tables, while remaining read-only + safe).
-- -----------------------------------------------------------------------------

-- Returns the highest-privilege application role name for the current caller,
-- or NULL when unauthenticated / unmapped. Precedence: admin > reviewer > viewer.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
  order by case r.name
             when 'admin'    then 1
             when 'reviewer' then 2
             when 'viewer'   then 3
             else 99
           end
  limit 1;
$$;

comment on function public.current_app_role() is
  'Resolves the calling auth user''s highest-privilege HSI role (admin>reviewer>viewer), or NULL.';

-- True when the caller holds the named role (or any higher-privilege role,
-- since admin implicitly satisfies reviewer/viewer and reviewer satisfies viewer).
create or replace function public.has_role(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_app_role() = 'admin' then true
    when target = 'reviewer' then public.current_app_role() in ('admin', 'reviewer')
    when target = 'viewer'   then public.current_app_role() in ('admin', 'reviewer', 'viewer')
    else public.current_app_role() = target
  end;
$$;

comment on function public.has_role(text) is
  'True if the caller holds the given HSI role or a higher-privilege one.';

-- Convenience predicates ------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() = 'admin';
$$;

create or replace function public.is_reviewer_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('admin', 'reviewer');
$$;

-- True when a signal is publicly visible: it is referenced by at least one
-- PUBLISHED + APPROVED public_report. Used to gate viewer/anon read access to
-- signals and (transitively) their evidence.
create or replace function public.signal_is_published(sig uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.public_reports pr
    where pr.signal_id = sig
      and pr.published = true
      and pr.reviewer_status = 'approved'
  );
$$;

comment on function public.signal_is_published(uuid) is
  'True when the signal is exposed by an approved + published public_report.';

-- =============================================================================
-- Enable RLS on every table. (FORCE so even table owners obey policies.)
-- =============================================================================
alter table public.users               enable row level security;
alter table public.roles               enable row level security;
alter table public.user_roles          enable row level security;
alter table public.sources             enable row level security;
alter table public.signals             enable row level security;
alter table public.evidence_items      enable row level security;
alter table public.transcripts         enable row level security;
alter table public.classifications     enable row level security;
alter table public.category_taxonomy   enable row level security;
alter table public.risk_scores         enable row level security;
alter table public.reviews             enable row level security;
alter table public.alerts              enable row level security;
alter table public.ai_runs             enable row level security;
alter table public.ai_trace_passages   enable row level security;
alter table public.generated_content   enable row level security;
alter table public.public_reports      enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.security_events     enable row level security;
alter table public.source_changes      enable row level security;
alter table public.uploaded_files      enable row level security;
alter table public.comments            enable row level security;
alter table public.tags                enable row level security;

-- =============================================================================
-- POLICIES
-- Convention: one "admin_all" policy grants admins everything per table; then
-- additional policies layer reviewer/viewer/anon access. Postgres OR-combines
-- permissive policies, so a row is visible if ANY policy allows it.
-- =============================================================================

-- ---------- users -------------------------------------------------------------
-- Admins manage all users. A user may read their own row.
create policy users_admin_all on public.users
  for all using (public.is_admin()) with check (public.is_admin());
create policy users_self_read on public.users
  for select using (id = auth.uid());

-- ---------- roles -------------------------------------------------------------
-- Reference data. Admin writes; any authenticated user may read role list.
create policy roles_admin_all on public.roles
  for all using (public.is_admin()) with check (public.is_admin());
create policy roles_auth_read on public.roles
  for select using (auth.role() = 'authenticated');

-- ---------- user_roles --------------------------------------------------------
-- Admin manages assignments. A user may read their own assignments.
create policy user_roles_admin_all on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());
create policy user_roles_self_read on public.user_roles
  for select using (user_id = auth.uid());

-- ---------- category_taxonomy / tags -----------------------------------------
-- Non-sensitive reference data: world-readable (anon included); admin writes.
create policy taxonomy_admin_all on public.category_taxonomy
  for all using (public.is_admin()) with check (public.is_admin());
create policy taxonomy_public_read on public.category_taxonomy
  for select using (true);

create policy tags_admin_all on public.tags
  for all using (public.is_admin()) with check (public.is_admin());
create policy tags_public_read on public.tags
  for select using (true);

-- ---------- sources -----------------------------------------------------------
-- Admin: full. Reviewer: read all + insert/update. Viewer/anon: only sources
-- that are behind a published signal/report.
create policy sources_admin_all on public.sources
  for all using (public.is_admin()) with check (public.is_admin());
create policy sources_reviewer_read on public.sources
  for select using (public.is_reviewer_or_admin());
create policy sources_reviewer_write on public.sources
  for insert with check (public.is_reviewer_or_admin());
create policy sources_reviewer_update on public.sources
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy sources_public_read on public.sources
  for select using (
    exists (
      select 1 from public.signals s
      where s.source_id = sources.id
        and public.signal_is_published(s.id)
    )
  );

-- ---------- signals -----------------------------------------------------------
-- Admin: full. Reviewer: read all + write. Viewer/anon: only published signals.
create policy signals_admin_all on public.signals
  for all using (public.is_admin()) with check (public.is_admin());
create policy signals_reviewer_read on public.signals
  for select using (public.is_reviewer_or_admin());
create policy signals_reviewer_write on public.signals
  for insert with check (public.is_reviewer_or_admin());
create policy signals_reviewer_update on public.signals
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy signals_public_read on public.signals
  for select using (public.signal_is_published(signals.id));

-- ---------- evidence_items ----------------------------------------------------
-- HIGHLY SENSITIVE. Admin + reviewer only. NEVER readable by viewer/anon,
-- even when the parent signal is published — raw evidence stays private.
create policy evidence_admin_all on public.evidence_items
  for all using (public.is_admin()) with check (public.is_admin());
create policy evidence_reviewer_read on public.evidence_items
  for select using (public.is_reviewer_or_admin());
create policy evidence_reviewer_write on public.evidence_items
  for insert with check (public.is_reviewer_or_admin());
create policy evidence_reviewer_update on public.evidence_items
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());

-- ---------- transcripts -------------------------------------------------------
-- Sensitive working material. Admin + reviewer only.
create policy transcripts_admin_all on public.transcripts
  for all using (public.is_admin()) with check (public.is_admin());
create policy transcripts_reviewer_rw on public.transcripts
  for select using (public.is_reviewer_or_admin());
create policy transcripts_reviewer_ins on public.transcripts
  for insert with check (public.is_reviewer_or_admin());
create policy transcripts_reviewer_upd on public.transcripts
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());

-- ---------- classifications ---------------------------------------------------
-- Admin: full. Reviewer: read all + write (core reviewer responsibility).
-- Viewer/anon: only classifications of published signals.
create policy classifications_admin_all on public.classifications
  for all using (public.is_admin()) with check (public.is_admin());
create policy classifications_reviewer_read on public.classifications
  for select using (public.is_reviewer_or_admin());
create policy classifications_reviewer_ins on public.classifications
  for insert with check (public.is_reviewer_or_admin());
create policy classifications_reviewer_upd on public.classifications
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy classifications_public_read on public.classifications
  for select using (public.signal_is_published(classifications.signal_id));

-- ---------- risk_scores -------------------------------------------------------
-- Admin: full. Reviewer: read all + write + approve.
-- Viewer/anon: only risk_scores of published signals.
create policy risk_scores_admin_all on public.risk_scores
  for all using (public.is_admin()) with check (public.is_admin());
create policy risk_scores_reviewer_read on public.risk_scores
  for select using (public.is_reviewer_or_admin());
create policy risk_scores_reviewer_ins on public.risk_scores
  for insert with check (public.is_reviewer_or_admin());
create policy risk_scores_reviewer_upd on public.risk_scores
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy risk_scores_public_read on public.risk_scores
  for select using (public.signal_is_published(risk_scores.signal_id));

-- ---------- reviews -----------------------------------------------------------
-- Internal workflow data. Admin: full. Reviewer: read all + write own reviews.
create policy reviews_admin_all on public.reviews
  for all using (public.is_admin()) with check (public.is_admin());
create policy reviews_reviewer_read on public.reviews
  for select using (public.is_reviewer_or_admin());
create policy reviews_reviewer_ins on public.reviews
  for insert with check (public.is_reviewer_or_admin() and user_id = auth.uid());
create policy reviews_reviewer_upd on public.reviews
  for update using (public.is_reviewer_or_admin() and user_id = auth.uid())
  with check (public.is_reviewer_or_admin() and user_id = auth.uid());

-- ---------- alerts ------------------------------------------------------------
-- Operational. Admin: full. Reviewer: read + create. Not public.
create policy alerts_admin_all on public.alerts
  for all using (public.is_admin()) with check (public.is_admin());
create policy alerts_reviewer_read on public.alerts
  for select using (public.is_reviewer_or_admin());
create policy alerts_reviewer_ins on public.alerts
  for insert with check (public.is_reviewer_or_admin());

-- ---------- ai_runs / ai_trace_passages --------------------------------------
-- AI provenance is internal. Admin: full. Reviewer: read + create.
create policy ai_runs_admin_all on public.ai_runs
  for all using (public.is_admin()) with check (public.is_admin());
create policy ai_runs_reviewer_read on public.ai_runs
  for select using (public.is_reviewer_or_admin());
create policy ai_runs_reviewer_ins on public.ai_runs
  for insert with check (public.is_reviewer_or_admin());

create policy ai_trace_admin_all on public.ai_trace_passages
  for all using (public.is_admin()) with check (public.is_admin());
create policy ai_trace_reviewer_read on public.ai_trace_passages
  for select using (public.is_reviewer_or_admin());
create policy ai_trace_reviewer_ins on public.ai_trace_passages
  for insert with check (public.is_reviewer_or_admin());

-- ---------- generated_content -------------------------------------------------
-- Admin: full. Reviewer: read + write. Viewer/anon: only for published signals.
create policy generated_admin_all on public.generated_content
  for all using (public.is_admin()) with check (public.is_admin());
create policy generated_reviewer_read on public.generated_content
  for select using (public.is_reviewer_or_admin());
create policy generated_reviewer_ins on public.generated_content
  for insert with check (public.is_reviewer_or_admin());
create policy generated_reviewer_upd on public.generated_content
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy generated_public_read on public.generated_content
  for select using (public.signal_is_published(generated_content.signal_id));

-- ---------- public_reports ----------------------------------------------------
-- Admin: full. Reviewer: read all + create/edit + approve+publish.
-- Viewer/anon: read ONLY published + approved reports (the public surface).
create policy reports_admin_all on public.public_reports
  for all using (public.is_admin()) with check (public.is_admin());
create policy reports_reviewer_read on public.public_reports
  for select using (public.is_reviewer_or_admin());
create policy reports_reviewer_ins on public.public_reports
  for insert with check (public.is_reviewer_or_admin());
create policy reports_reviewer_upd on public.public_reports
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy reports_public_read on public.public_reports
  for select using (published = true and reviewer_status = 'approved');

-- ---------- audit_logs --------------------------------------------------------
-- Append-only audit trail. Admin: read. Any authenticated actor: insert (so the
-- app can record actions). No updates/deletes via the API (immutability).
create policy audit_admin_read on public.audit_logs
  for select using (public.is_admin());
create policy audit_auth_insert on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

-- ---------- security_events ---------------------------------------------------
-- Sensitive ops telemetry. Admin: read. Authenticated actors / services: insert.
create policy security_admin_read on public.security_events
  for select using (public.is_admin());
create policy security_auth_insert on public.security_events
  for insert with check (auth.role() = 'authenticated');

-- ---------- source_changes ----------------------------------------------------
-- Change-detection log. Admin: full. Reviewer: read + insert.
create policy source_changes_admin_all on public.source_changes
  for all using (public.is_admin()) with check (public.is_admin());
create policy source_changes_reviewer_read on public.source_changes
  for select using (public.is_reviewer_or_admin());
create policy source_changes_reviewer_ins on public.source_changes
  for insert with check (public.is_reviewer_or_admin());

-- ---------- uploaded_files ----------------------------------------------------
-- HIGHLY SENSITIVE (points at private storage). Admin + reviewer only.
-- NEVER readable by viewer/anon. Public report assets live in a separate bucket.
create policy uploads_admin_all on public.uploaded_files
  for all using (public.is_admin()) with check (public.is_admin());
create policy uploads_reviewer_read on public.uploaded_files
  for select using (public.is_reviewer_or_admin());
create policy uploads_reviewer_ins on public.uploaded_files
  for insert with check (public.is_reviewer_or_admin());
create policy uploads_reviewer_upd on public.uploaded_files
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());

-- ---------- comments ----------------------------------------------------------
-- Internal collaboration. Admin: full. Reviewer: read all + write own comments.
create policy comments_admin_all on public.comments
  for all using (public.is_admin()) with check (public.is_admin());
create policy comments_reviewer_read on public.comments
  for select using (public.is_reviewer_or_admin());
create policy comments_reviewer_ins on public.comments
  for insert with check (public.is_reviewer_or_admin() and user_id = auth.uid());
create policy comments_reviewer_upd on public.comments
  for update using (public.is_reviewer_or_admin() and user_id = auth.uid())
  with check (public.is_reviewer_or_admin() and user_id = auth.uid());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. Server-side jobs
-- (ingestion, AI runs, seeding) use it. NEVER expose service_role to clients.
-- =============================================================================
