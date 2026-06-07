-- =============================================================================
-- Human Signal Index — 0003_indexes_constraints.sql
-- Indexes, CHECK constraints, enum-style guards, updated_at columns + trigger.
-- Idempotent where practical (IF NOT EXISTS / guarded DO blocks).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. captures — raw source snapshots (referenced by Prisma + shared-types).
--    Created here because 0001 did not define it.
-- -----------------------------------------------------------------------------
create table if not exists public.captures (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid references public.sources(id) on delete cascade,
  payload     jsonb not null,
  captured_at timestamptz not null default now()
);
create index if not exists idx_captures_source_id on public.captures(source_id);

-- captures is sensitive working material: admin + reviewer only (same model as
-- evidence/transcripts). RLS enabled here since the table is created here.
alter table public.captures enable row level security;
drop policy if exists captures_admin_all on public.captures;
drop policy if exists captures_reviewer_read on public.captures;
drop policy if exists captures_reviewer_ins on public.captures;
create policy captures_admin_all on public.captures
  for all using (public.is_admin()) with check (public.is_admin());
create policy captures_reviewer_read on public.captures
  for select using (public.is_reviewer_or_admin());
create policy captures_reviewer_ins on public.captures
  for insert with check (public.is_reviewer_or_admin());

-- -----------------------------------------------------------------------------
-- 1. updated_at columns + shared trigger function
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at = now() on mutable tables.';

-- Add updated_at to mutable tables.
alter table public.users             add column if not exists updated_at timestamptz not null default now();
alter table public.sources           add column if not exists updated_at timestamptz not null default now();
alter table public.signals           add column if not exists updated_at timestamptz not null default now();
alter table public.evidence_items    add column if not exists updated_at timestamptz not null default now();
alter table public.transcripts       add column if not exists updated_at timestamptz not null default now();
alter table public.classifications   add column if not exists updated_at timestamptz not null default now();
alter table public.risk_scores       add column if not exists updated_at timestamptz not null default now();
alter table public.reviews           add column if not exists updated_at timestamptz not null default now();
alter table public.alerts            add column if not exists updated_at timestamptz not null default now();
alter table public.generated_content add column if not exists updated_at timestamptz not null default now();
alter table public.public_reports    add column if not exists updated_at timestamptz not null default now();
alter table public.uploaded_files    add column if not exists updated_at timestamptz not null default now();
alter table public.comments          add column if not exists updated_at timestamptz not null default now();
alter table public.category_taxonomy add column if not exists updated_at timestamptz not null default now();
alter table public.tags              add column if not exists updated_at timestamptz not null default now();

-- Attach trigger to each mutable table (drop-then-create for idempotency).
do $$
declare
  t text;
  mutable_tables text[] := array[
    'users','sources','signals','evidence_items','transcripts','classifications',
    'risk_scores','reviews','alerts','generated_content','public_reports',
    'uploaded_files','comments','category_taxonomy','tags'
  ];
begin
  foreach t in array mutable_tables loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Indexes on foreign keys + common query columns
-- -----------------------------------------------------------------------------
-- Foreign keys
create index if not exists idx_user_roles_user_id        on public.user_roles(user_id);
create index if not exists idx_user_roles_role_id        on public.user_roles(role_id);
create index if not exists idx_signals_source_id         on public.signals(source_id);
create index if not exists idx_evidence_signal_id        on public.evidence_items(signal_id);
create index if not exists idx_transcripts_signal_id     on public.transcripts(signal_id);
create index if not exists idx_classifications_signal_id on public.classifications(signal_id);
create index if not exists idx_risk_scores_signal_id     on public.risk_scores(signal_id);
create index if not exists idx_reviews_signal_id         on public.reviews(signal_id);
create index if not exists idx_reviews_user_id           on public.reviews(user_id);
create index if not exists idx_alerts_signal_id          on public.alerts(signal_id);
create index if not exists idx_ai_runs_signal_id         on public.ai_runs(signal_id);
create index if not exists idx_ai_trace_run_id           on public.ai_trace_passages(ai_run_id);
create index if not exists idx_generated_signal_id       on public.generated_content(signal_id);
create index if not exists idx_reports_signal_id         on public.public_reports(signal_id);
create index if not exists idx_audit_user_id             on public.audit_logs(user_id);
create index if not exists idx_source_changes_source_id  on public.source_changes(source_id);
create index if not exists idx_uploads_source_id         on public.uploaded_files(source_id);
create index if not exists idx_uploads_signal_id         on public.uploaded_files(signal_id);
create index if not exists idx_comments_signal_id        on public.comments(signal_id);
create index if not exists idx_comments_user_id          on public.comments(user_id);

-- Common query / filter columns
create index if not exists idx_sources_status            on public.sources(status);
create index if not exists idx_signals_status            on public.signals(status);
create index if not exists idx_signals_risk_score        on public.signals(risk_score);
create index if not exists idx_risk_scores_risk_level    on public.risk_scores(risk_level);
create index if not exists idx_risk_scores_review_status on public.risk_scores(reviewer_status);
create index if not exists idx_alerts_level              on public.alerts(level);
create index if not exists idx_security_events_level     on public.security_events(level);
create index if not exists idx_security_events_created   on public.security_events(created_at);
create index if not exists idx_audit_created             on public.audit_logs(created_at);
create index if not exists idx_reports_published         on public.public_reports(published, reviewer_status);
create index if not exists idx_classifications_category  on public.classifications(category);

-- Array membership lookups (GIN) for category/tag filtering.
create index if not exists idx_signals_category_gin      on public.signals using gin (category);
create index if not exists idx_sources_tags_gin          on public.sources using gin (tags);

-- -----------------------------------------------------------------------------
-- 3. Chain-of-custody integrity: unique evidence hash
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_evidence_hash_digest'
  ) then
    alter table public.evidence_items
      add constraint uq_evidence_hash_digest unique (hash_digest);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. CHECK constraints — numeric ranges
--    risk_baseline / risk_score / risk_level between 1 and 5
--    confidence / classification score between 0 and 1
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_sources_risk_baseline') then
    alter table public.sources
      add constraint chk_sources_risk_baseline check (risk_baseline between 1 and 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_signals_risk_score') then
    alter table public.signals
      add constraint chk_signals_risk_score check (risk_score between 1 and 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_risk_scores_level') then
    alter table public.risk_scores
      add constraint chk_risk_scores_level check (risk_level between 1 and 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_risk_scores_confidence') then
    alter table public.risk_scores
      add constraint chk_risk_scores_confidence check (confidence between 0 and 1);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_classifications_score') then
    alter table public.classifications
      add constraint chk_classifications_score check (score between 0 and 1);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_ai_trace_confidence') then
    alter table public.ai_trace_passages
      add constraint chk_ai_trace_confidence check (confidence between 0 and 1);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Enum-style guards via CHECK constraints
--    (CHECK keeps the base text columns; cheaper to evolve than Postgres enums.)
-- -----------------------------------------------------------------------------
do $$
begin
  -- sources.source_type
  if not exists (select 1 from pg_constraint where conname = 'chk_sources_type') then
    alter table public.sources
      add constraint chk_sources_type check (source_type in (
        'website','social_page','video','podcast','forum','uploaded_file','manual_entry'
      ));
  end if;

  -- sources.status
  if not exists (select 1 from pg_constraint where conname = 'chk_sources_status') then
    alter table public.sources
      add constraint chk_sources_status check (status in (
        'active','paused','archived','unavailable'
      ));
  end if;

  -- signals.status
  if not exists (select 1 from pg_constraint where conname = 'chk_signals_status') then
    alter table public.signals
      add constraint chk_signals_status check (status in (
        'draft','review','approved','published','rejected','archived'
      ));
  end if;

  -- risk_scores.reviewer_status (mirrors ReviewStatus enum)
  if not exists (select 1 from pg_constraint where conname = 'chk_risk_scores_review_status') then
    alter table public.risk_scores
      add constraint chk_risk_scores_review_status check (reviewer_status in (
        'pending','approved','rejected','needs_more_evidence','escalated'
      ));
  end if;

  -- reviews.status (mirrors ReviewStatus enum)
  if not exists (select 1 from pg_constraint where conname = 'chk_reviews_status') then
    alter table public.reviews
      add constraint chk_reviews_status check (status in (
        'pending','approved','rejected','needs_more_evidence','escalated'
      ));
  end if;

  -- public_reports.reviewer_status
  if not exists (select 1 from pg_constraint where conname = 'chk_reports_review_status') then
    alter table public.public_reports
      add constraint chk_reports_review_status check (reviewer_status in (
        'pending','approved','rejected','needs_more_evidence','escalated'
      ));
  end if;

  -- alerts.level / security_events.level (shared severity scale)
  if not exists (select 1 from pg_constraint where conname = 'chk_alerts_level') then
    alter table public.alerts
      add constraint chk_alerts_level check (level in ('info','low','medium','high','critical'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_security_events_level') then
    alter table public.security_events
      add constraint chk_security_events_level check (level in ('info','low','medium','high','critical'));
  end if;

  -- alerts.title is also the alert_type in this schema-light model; guard the
  -- known alert types when present is enforced at the app layer. We constrain
  -- the severity only here to avoid over-coupling.
end;
$$;

-- =============================================================================
-- End of 0003.
-- =============================================================================
