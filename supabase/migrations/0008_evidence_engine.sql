-- =============================================================================
-- Human Signal Index — 0008_evidence_engine.sql
-- WorldForge (Phase 4) — Evidence & Citation Engine persistence schema.
--
-- Phase 4 replaces the Phase 3 placeholder citations (research_citations) with
-- REAL, retrievable evidence. The '@hsi/evidence-engine' takes the Claim[] a
-- research run produced, searches curated fixtures (default) or live public APIs
-- (arXiv / Crossref / PubMed / Semantic Scholar / DOI / web fallback), classifies
-- each source as supports/contradicts/background/unclear, and computes a coverage
-- summary. This migration persists:
--   * a SHARED citation library  (evidence_sources)
--   * per-run claim->source links (claim_evidence_links)
--   * human review verdicts       (evidence_reviews)
-- and surfaces a run's aggregate coverage by adding two columns to research_runs.
--
-- CONVENTIONS (match 0001-0007):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz default now().
--   - mutable tables get an updated_at column + the shared public.set_updated_at()
--     BEFORE UPDATE trigger from 0003.
--   - `created_by uuid references public.users(id) on delete set null` — and
--     public.users.id == auth.uid() (mirrored by 0006_auth_users_trigger).
--   - RLS via the helpers from 0002: public.is_admin(), public.is_reviewer_or_admin().
--   - run publicity reuses public.research_run_is_public(uuid) from 0007.
--   - jsonb columns hold canonical engine payloads (EvidenceResult.raw, authors)
--     and SQL constrains shape lightly (numeric 0..1 ranges + enum-style guards).
--
-- ROLE MODEL:
--   evidence_sources       -> a SHARED, public citation library. ANY caller (incl
--                             anon) may READ; ANY authenticated user may INSERT
--                             (the engine persists sources during a run); only
--                             curators (is_reviewer_or_admin) UPDATE/DELETE.
--   claim_evidence_links   -> owned via the parent run (research_runs.created_by =
--                             auth.uid): full CRUD; curators read+write; viewer/
--                             anon read when the parent run is public.
--   evidence_reviews       -> curators (is_reviewer_or_admin) full CRUD; a reviewer
--                             may always read their own rows; authenticated read.
--
-- This migration does NOT drop or alter any existing policy from 0001-0007. The
-- ALTER on research_runs only ADDs columns and keeps its existing RLS intact.
-- =============================================================================

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------- evidence_sources -------------------------------------------------
-- A SHARED, de-duplicated citation library. One row per real evidence source
-- (a paper, preprint, encyclopedia entry, dataset, ...). Mirrors the engine's
-- EvidenceResult. De-dupe keys: a normalized DOI or arXiv id (UNIQUE where set),
-- so the engine can upsert a source it sees across multiple runs/claims.
create table if not exists public.evidence_sources (
  id                  uuid primary key default gen_random_uuid(),
  source_type         text,                                 -- coarse class (paper/dataset/web/...)
  title               text not null,
  authors             jsonb,                                -- string[] of author names
  year                int,
  abstract            text,
  url                 text,
  doi                 text,                                 -- normalized DOI (no scheme, lowercased)
  arxiv_id            text,
  pubmed_id           text,
  semantic_scholar_id text,
  source_name         text,                                 -- provider name ('arXiv','Crossref','fixture',...)
  publication_type    text,                                 -- EvidencePublicationType
  reliability_score   numeric check (reliability_score >= 0 and reliability_score <= 1),
  is_fixture          boolean not null default false,
  metadata            jsonb,                                -- EvidenceResult.raw + extras
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.evidence_sources is
  'WorldForge Phase 4: shared, de-duplicated citation library (mirrors EvidenceResult).';

-- ---------- claim_evidence_links ---------------------------------------------
-- A per-run link between one research claim and one evidence source, carrying the
-- classified relationship (support_type), the relevance/confidence the engine
-- computed, and an optional human-readable rationale. Mirrors ClaimEvidence rows.
create table if not exists public.claim_evidence_links (
  id                 uuid primary key default gen_random_uuid(),
  research_run_id    uuid not null references public.research_runs(id) on delete cascade,
  agent_output_id    uuid references public.research_agent_outputs(id) on delete cascade,
  claim_id           text,                                  -- Claim.id within the run's outputs
  evidence_source_id uuid not null references public.evidence_sources(id) on delete cascade,
  support_type       text check (support_type in ('supports','contradicts','background','unclear')),
  relevance_score    numeric check (relevance_score >= 0 and relevance_score <= 1),
  confidence         numeric check (confidence >= 0 and confidence <= 1),
  rationale          text,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now()
);
comment on table public.claim_evidence_links is
  'WorldForge Phase 4: per-run claim->evidence_source links with classified support_type.';

-- ---------- evidence_reviews -------------------------------------------------
-- A human reviewer's verdict on an evidence source. Drives the citation-quality
-- workflow (pending -> validated / rejected / needs_more). Curators write these.
create table if not exists public.evidence_reviews (
  id                 uuid primary key default gen_random_uuid(),
  evidence_source_id uuid not null references public.evidence_sources(id) on delete cascade,
  reviewed_by        uuid references public.users(id) on delete set null,
  status             text check (status in ('pending','validated','rejected','needs_more')),
  notes              text,
  created_at         timestamptz not null default now()
);
comment on table public.evidence_reviews is
  'WorldForge Phase 4: human review verdicts on evidence sources (pending/validated/rejected/needs_more).';

-- ---------- research_runs: surface evidence coverage -------------------------
-- ADD-ONLY: a run now carries the aggregate EvidenceCoverage (jsonb) the engine
-- computed and a coarse status. This is how the consensus/run UI surfaces how
-- well-supported the run's claims are. Existing research_runs RLS is untouched.
alter table public.research_runs
  add column if not exists evidence_coverage jsonb;
alter table public.research_runs
  add column if not exists evidence_status text default 'none';
comment on column public.research_runs.evidence_coverage is
  'WorldForge Phase 4: aggregate EvidenceCoverage summary jsonb for this run.';
comment on column public.research_runs.evidence_status is
  'WorldForge Phase 4: none|fixture|live|mixed — how this run''s evidence was gathered.';

-- =============================================================================
-- 2. INDEXES — foreign keys + de-dupe + common filter columns
-- =============================================================================
-- De-dupe UNIQUE partial indexes: a DOI / arXiv id identifies a source, so an
-- upsert can target these. NULLs are excluded so key-less sources coexist freely.
create unique index if not exists uq_evidence_sources_doi
  on public.evidence_sources(doi) where doi is not null;
create unique index if not exists uq_evidence_sources_arxiv_id
  on public.evidence_sources(arxiv_id) where arxiv_id is not null;

create index if not exists idx_evidence_sources_doi              on public.evidence_sources(doi);
create index if not exists idx_evidence_sources_arxiv_id         on public.evidence_sources(arxiv_id);
create index if not exists idx_evidence_sources_publication_type on public.evidence_sources(publication_type);

create index if not exists idx_claim_evidence_links_run_id    on public.claim_evidence_links(research_run_id);
create index if not exists idx_claim_evidence_links_source_id on public.claim_evidence_links(evidence_source_id);
create index if not exists idx_claim_evidence_links_claim_id  on public.claim_evidence_links(claim_id);
create index if not exists idx_claim_evidence_links_output_id on public.claim_evidence_links(agent_output_id);
create index if not exists idx_claim_evidence_links_created_by on public.claim_evidence_links(created_by);

create index if not exists idx_evidence_reviews_source_id   on public.evidence_reviews(evidence_source_id);
create index if not exists idx_evidence_reviews_reviewed_by on public.evidence_reviews(reviewed_by);
create index if not exists idx_evidence_reviews_status      on public.evidence_reviews(status);

-- =============================================================================
-- 3. updated_at TRIGGER (only evidence_sources carries updated_at)
--    Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.evidence_sources;
create trigger trg_set_updated_at before update on public.evidence_sources
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. ENABLE RLS on the 3 new tables
--    (research_runs already had RLS enabled in 0007; the ALTER above kept it.)
-- =============================================================================
alter table public.evidence_sources      enable row level security;
alter table public.claim_evidence_links  enable row level security;
alter table public.evidence_reviews       enable row level security;

-- =============================================================================
-- 5. POLICIES
-- Convention (matches 0002/0005/0007): permissive policies are OR-combined. A
-- row is visible/writable if ANY policy allows it.
-- =============================================================================

-- ---------- evidence_sources --------------------------------------------------
-- A SHARED public citation library. Citations are public references: anyone
-- (incl anon) may read them. Any authenticated user may INSERT (the engine
-- persists sources during a run). Only curators may mutate/remove existing rows.
drop policy if exists evidence_sources_auth_read     on public.evidence_sources;
drop policy if exists evidence_sources_auth_insert   on public.evidence_sources;
drop policy if exists evidence_sources_curator_update on public.evidence_sources;
drop policy if exists evidence_sources_curator_delete on public.evidence_sources;

create policy evidence_sources_auth_read on public.evidence_sources
  for select using (true);
create policy evidence_sources_auth_insert on public.evidence_sources
  for insert with check (auth.uid() is not null);
create policy evidence_sources_curator_update on public.evidence_sources
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy evidence_sources_curator_delete on public.evidence_sources
  for delete using (public.is_reviewer_or_admin());

-- ---------- claim_evidence_links ----------------------------------------------
-- Owned via the parent run. The owner of the run has full CRUD over its links;
-- curators read+write; viewer/anon read links belonging to a PUBLIC run.
drop policy if exists claim_evidence_links_owner_all    on public.claim_evidence_links;
drop policy if exists claim_evidence_links_curator_read on public.claim_evidence_links;
drop policy if exists claim_evidence_links_curator_ins  on public.claim_evidence_links;
drop policy if exists claim_evidence_links_curator_upd  on public.claim_evidence_links;
drop policy if exists claim_evidence_links_public_read  on public.claim_evidence_links;

create policy claim_evidence_links_owner_all on public.claim_evidence_links
  for all using (
    exists (
      select 1 from public.research_runs r
      where r.id = claim_evidence_links.research_run_id
        and r.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.research_runs r
      where r.id = claim_evidence_links.research_run_id
        and r.created_by = auth.uid()
    )
  );
create policy claim_evidence_links_curator_read on public.claim_evidence_links
  for select using (public.is_reviewer_or_admin());
create policy claim_evidence_links_curator_ins on public.claim_evidence_links
  for insert with check (public.is_reviewer_or_admin());
create policy claim_evidence_links_curator_upd on public.claim_evidence_links
  for update using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy claim_evidence_links_public_read on public.claim_evidence_links
  for select using (public.research_run_is_public(claim_evidence_links.research_run_id));

-- ---------- evidence_reviews --------------------------------------------------
-- Curators (is_reviewer_or_admin) have full CRUD; a reviewer may always read
-- their own rows; any authenticated user may read review verdicts (transparency).
drop policy if exists evidence_reviews_curator_all on public.evidence_reviews;
drop policy if exists evidence_reviews_self_read   on public.evidence_reviews;
drop policy if exists evidence_reviews_auth_read   on public.evidence_reviews;

create policy evidence_reviews_curator_all on public.evidence_reviews
  for all using (public.is_reviewer_or_admin()) with check (public.is_reviewer_or_admin());
create policy evidence_reviews_self_read on public.evidence_reviews
  for select using (reviewed_by = auth.uid());
create policy evidence_reviews_auth_read on public.evidence_reviews
  for select using (auth.uid() is not null);

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. User-facing evidence
-- persistence NEVER uses it: the DAL writes through the per-request, cookie-backed
-- client so created_by = auth.uid() and these policies authorize the write.
-- =============================================================================

-- =============================================================================
-- End of 0008_evidence_engine.sql
-- =============================================================================
