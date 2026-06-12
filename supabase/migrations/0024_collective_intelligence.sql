-- =============================================================================
-- Human Signal Index — 0024_collective_intelligence.sql
-- WorldForge / HSI (Phase 20) — Collective Intelligence Network, Peer Review &
-- Consensus Engine.
--
-- Phase 20 turns the publishing platform into a COLLABORATIVE ecosystem: multiple
-- researchers work a single investigation — submitting findings, challenging
-- conclusions, proposing alternative narratives, debating evidence, endorsing,
-- and being scored on their reliability — while a forming CONSENSUS is computed
-- (weighted, never majority vote) and routed through HUMAN governance. No
-- auto-consensus, no auto-truth, no auto-publish.
--
--   * hsin_investigations          — the collaborative unit (lifecycle state).
--   * hsin_findings                — submitted findings (a position + support).
--   * hsin_challenges              — challenges against findings (open/upheld/rejected).
--   * hsin_alternative_narratives  — competing narratives.
--   * hsin_endorsements            — finding endorsements (withdrawable, never deleted).
--   * hsin_evidence_claims         — evidence under debate (support/challenge/review tallies).
--   * hsin_evidence_reviews        — APPEND-ONLY human evidence reviews.
--   * hsin_consensus_snapshots     — APPEND-ONLY computed consensus snapshots.
--   * hsin_consensus_reviews       — APPEND-ONLY governance decisions over a consensus.
--   * hsin_contributor_scores      — computed contributor reliability scores.
--
-- ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   COLLABORATION tables (findings/challenges/alternatives/endorsements/evidence
--     claims) — researcher+ may READ + INSERT (contribute); curator/admin may
--     UPDATE/DELETE; admin all.
--   GOVERNED/COMPUTED tables (investigations/consensus snapshots/consensus reviews/
--     contributor scores/evidence reviews) — researcher+ READ; curator/admin WRITE;
--     admin all. The CONSENSUS WORKER uses the service_role key (bypasses RLS).
--
-- This migration is ADD-ONLY. It does NOT edit migrations 0001-0023.
-- CONVENTIONS (match 0001-0023): snake_case; gen_random_uuid() PKs; created_at
-- default now(); CHECK-guarded enums; the shared set_updated_at() trigger on
-- mutable tables; APPEND-ONLY tables carry no trigger.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

create table if not exists public.hsin_investigations (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  title       text,
  question    text,
  state       text check (state in ('DRAFT','ACTIVE','UNDER_REVIEW','CONSENSUS_FORMING','PUBLISHED','ARCHIVED')) default 'DRAFT',
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.hsin_investigations is
  'HSIN Phase 20: the collaborative investigation unit (lifecycle state machine).';

create table if not exists public.hsin_findings (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid references public.hsin_investigations(id) on delete cascade,
  contributor_id   uuid references public.users(id) on delete set null,
  position         text,
  summary          text,
  confidence       numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_refs    jsonb,
  endorsements     int default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz default now()
);
comment on table public.hsin_findings is
  'HSIN Phase 20: findings submitted to an investigation (a position + its support).';

create table if not exists public.hsin_challenges (
  id                uuid primary key default gen_random_uuid(),
  investigation_id  uuid references public.hsin_investigations(id) on delete cascade,
  target_finding_id uuid references public.hsin_findings(id) on delete cascade,
  contributor_id    uuid references public.users(id) on delete set null,
  reason            text,
  status            text check (status in ('open','upheld','rejected')) default 'open',
  resolved_by       uuid references public.users(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz default now()
);
comment on table public.hsin_challenges is
  'HSIN Phase 20: challenges against findings (open/upheld/rejected); resolved, never erased.';

create table if not exists public.hsin_alternative_narratives (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid references public.hsin_investigations(id) on delete cascade,
  contributor_id   uuid references public.users(id) on delete set null,
  title            text,
  summary          text,
  position         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz default now()
);
comment on table public.hsin_alternative_narratives is
  'HSIN Phase 20: competing alternative narratives proposed for an investigation.';

create table if not exists public.hsin_endorsements (
  id             uuid primary key default gen_random_uuid(),
  finding_id     uuid references public.hsin_findings(id) on delete cascade,
  contributor_id uuid references public.users(id) on delete set null,
  withdrawn      boolean default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz default now(),
  unique (finding_id, contributor_id)
);
comment on table public.hsin_endorsements is
  'HSIN Phase 20: finding endorsements (withdrawable, flagged — never deleted).';

create table if not exists public.hsin_evidence_claims (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid references public.hsin_investigations(id) on delete cascade,
  contributor_id   uuid references public.users(id) on delete set null,
  claim            text,
  source_ref       text,
  source_quality   numeric check (source_quality is null or (source_quality >= 0 and source_quality <= 1)),
  support_count    int default 0,
  challenge_count  int default 0,
  reviews_approved int default 0,
  reviews_rejected int default 0,
  strength         numeric,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz default now()
);
comment on table public.hsin_evidence_claims is
  'HSIN Phase 20: evidence claims under debate (support/challenge/review tallies + explainable strength).';

create table if not exists public.hsin_evidence_reviews (
  id                uuid primary key default gen_random_uuid(),
  evidence_claim_id uuid references public.hsin_evidence_claims(id) on delete cascade,
  reviewer_id       uuid references public.users(id) on delete set null,
  decision          text check (decision in ('approved','rejected')),
  reason            text,
  created_at        timestamptz not null default now()
);
comment on table public.hsin_evidence_reviews is
  'HSIN Phase 20: APPEND-ONLY human evidence reviews (approved/rejected + reason).';

create table if not exists public.hsin_consensus_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  investigation_id   uuid references public.hsin_investigations(id) on delete cascade,
  consensus_position text,
  agreement_score    numeric,
  evidence_strength  numeric,
  confidence         numeric,
  positions          jsonb,
  dissent_positions  jsonb,
  confidence_distribution jsonb,
  sample_count       int default 0,
  contributor_count  int default 0,
  explanation        jsonb,
  limitations        jsonb,
  generated_at       timestamptz,
  created_at         timestamptz not null default now()
);
comment on table public.hsin_consensus_snapshots is
  'HSIN Phase 20: APPEND-ONLY computed consensus snapshots (weighted candidate + dissent + confidence + explanation).';

create table if not exists public.hsin_consensus_reviews (
  id                 uuid primary key default gen_random_uuid(),
  investigation_id   uuid references public.hsin_investigations(id) on delete cascade,
  snapshot_id        uuid references public.hsin_consensus_snapshots(id) on delete set null,
  reviewer_id        uuid references public.users(id) on delete set null,
  decision           text check (decision in ('approved','rejected','escalated','archived')),
  reason             text,
  consensus_position text,
  agreement_score    numeric,
  resulting_state    text,
  created_at         timestamptz not null default now()
);
comment on table public.hsin_consensus_reviews is
  'HSIN Phase 20: APPEND-ONLY governance decisions over a forming consensus (approved/rejected/escalated/archived).';

create table if not exists public.hsin_contributor_scores (
  id                 uuid primary key default gen_random_uuid(),
  contributor_id     uuid references public.users(id) on delete cascade,
  accuracy           numeric,
  trust              numeric check (trust is null or (trust >= 0 and trust <= 100)),
  review_quality     numeric,
  consensus_alignment numeric,
  evidence_quality   numeric,
  overall            numeric,
  explanation        jsonb,
  limitations        jsonb,
  computed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz default now(),
  unique (contributor_id)
);
comment on table public.hsin_contributor_scores is
  'HSIN Phase 20: computed contributor reliability scores (accuracy/trust/review/alignment/evidence + explanation).';

-- =============================================================================
-- B. INDEXES
-- =============================================================================
create index if not exists idx_hsin_investigations_state      on public.hsin_investigations(state);
create index if not exists idx_hsin_investigations_slug       on public.hsin_investigations(slug);
create index if not exists idx_hsin_findings_investigation     on public.hsin_findings(investigation_id);
create index if not exists idx_hsin_findings_contributor       on public.hsin_findings(contributor_id);
create index if not exists idx_hsin_challenges_investigation   on public.hsin_challenges(investigation_id);
create index if not exists idx_hsin_challenges_target          on public.hsin_challenges(target_finding_id);
create index if not exists idx_hsin_challenges_status          on public.hsin_challenges(status);
create index if not exists idx_hsin_alt_narratives_investigation on public.hsin_alternative_narratives(investigation_id);
create index if not exists idx_hsin_endorsements_finding       on public.hsin_endorsements(finding_id);
create index if not exists idx_hsin_evidence_claims_investigation on public.hsin_evidence_claims(investigation_id);
create index if not exists idx_hsin_evidence_reviews_claim     on public.hsin_evidence_reviews(evidence_claim_id);
create index if not exists idx_hsin_consensus_snapshots_investigation on public.hsin_consensus_snapshots(investigation_id);
create index if not exists idx_hsin_consensus_snapshots_created on public.hsin_consensus_snapshots(created_at);
create index if not exists idx_hsin_consensus_reviews_investigation on public.hsin_consensus_reviews(investigation_id);
create index if not exists idx_hsin_contributor_scores_contributor on public.hsin_contributor_scores(contributor_id);
create index if not exists idx_hsin_contributor_scores_overall on public.hsin_contributor_scores(overall);

-- =============================================================================
-- C. UPDATED_AT TRIGGERS — on the mutable tables. APPEND-ONLY tables
-- (evidence_reviews, consensus_snapshots, consensus_reviews) carry no trigger.
-- =============================================================================
do $$
declare
  t text;
  mutable text[] := array[
    'hsin_investigations','hsin_findings','hsin_challenges','hsin_alternative_narratives',
    'hsin_endorsements','hsin_evidence_claims','hsin_contributor_scores'];
begin
  foreach t in array mutable loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format('create trigger trg_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =============================================================================
-- D. ENABLE RLS
-- =============================================================================
do $$
declare
  t text;
  all_tables text[] := array[
    'hsin_investigations','hsin_findings','hsin_challenges','hsin_alternative_narratives',
    'hsin_endorsements','hsin_evidence_claims','hsin_evidence_reviews',
    'hsin_consensus_snapshots','hsin_consensus_reviews','hsin_contributor_scores'];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- =============================================================================
-- E. POLICIES
--   COLLAB tables: researcher+ READ + INSERT; curator/admin UPD/DEL; admin all.
--   GOVERNED tables: researcher+ READ; curator/admin INS/UPD/DEL; admin all.
-- =============================================================================
do $$
declare
  t text;
  collab text[] := array[
    'hsin_findings','hsin_challenges','hsin_alternative_narratives',
    'hsin_endorsements','hsin_evidence_claims'];
  governed text[] := array[
    'hsin_investigations','hsin_evidence_reviews','hsin_consensus_snapshots',
    'hsin_consensus_reviews','hsin_contributor_scores'];
begin
  -- COLLAB: researcher+ insert.
  foreach t in array collab loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_research_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_curator_del', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('create policy %I on public.%I for select using (public.is_researcher_or_above())', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.is_researcher_or_above())', t || '_research_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin())', t || '_curator_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_curator_or_admin())', t || '_curator_del', t);
  end loop;
  -- GOVERNED: curator+ write.
  foreach t in array governed loop
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
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS. The Phase-20 CONSENSUS WORKER uses
-- it to recompute consensus snapshots + contributor scores, detect disputes, and
-- queue governance review. It NEVER auto-approves, auto-publishes, or
-- auto-consensus — every acceptance is a human governance decision.
-- =============================================================================

-- =============================================================================
-- End of 0024_collective_intelligence.sql
-- =============================================================================
