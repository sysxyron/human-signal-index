-- =============================================================================
-- Human Signal Index — 0032_operational_trust_wiring.sql
-- WorldForge / HSI (Phase 28) — Operational Trust Wiring.
--
-- Phase 27 computed trust/authority but several inputs used placeholders. Phase 28
-- wires REAL operational outcomes (review-vs-governance agreement, governance
-- effectiveness, publication quality, investigation completion + impact) into the
-- trust graph. This migration adds the storage those real scores need:
--
--   * trust_profiles.impact_score / governance_effectiveness — new score columns.
--   * trust_events  — five new operational event types added to the CHECK.
--   * team_effectiveness — per-team acceptance / completion / impact rollups.
--   * leaderboard_snapshots.view — five team-domain leaderboard views added.
--
-- GOVERNANCE (hard constraints): nothing here changes auth, middleware, RBAC,
-- user_roles, IAM, or the invitation flow. The worker still NEVER writes
-- public.user_roles. All additive.
--
-- ADD-ONLY. Does NOT edit migrations 0001-0031. CONVENTIONS match 0001-0031.
-- =============================================================================

-- =============================================================================
-- A. trust_profiles — new real-score columns (default neutral 50).
-- =============================================================================
alter table public.trust_profiles
  add column if not exists impact_score integer not null default 50 check (impact_score between 0 and 100),
  add column if not exists governance_effectiveness integer not null default 50 check (governance_effectiveness between 0 and 100);
comment on column public.trust_profiles.impact_score is 'HSI Phase 28: investigation impact (outcomes produced).';
comment on column public.trust_profiles.governance_effectiveness is 'HSI Phase 28: governance decisions confirmed by later outcomes.';

-- =============================================================================
-- B. trust_events — extend the event-type CHECK with five operational events.
-- =============================================================================
alter table public.trust_events drop constraint if exists trust_events_event_type_check;
alter table public.trust_events add constraint trust_events_event_type_check check (event_type in (
  'SIGNAL_ACCEPTED','SIGNAL_REJECTED','REVIEW_AGREEMENT','REVIEW_DISAGREEMENT',
  'PUBLICATION_APPROVED','PUBLICATION_REJECTED','INVESTIGATION_COMPLETED','INVESTIGATION_ABANDONED',
  -- Phase 28
  'INVESTIGATION_ACCEPTED','INVESTIGATION_REJECTED','GOVERNANCE_CONFIRMED',
  'PUBLICATION_HIGH_CONFIDENCE','PUBLICATION_LOW_CONFIDENCE'
));

-- =============================================================================
-- C. team_effectiveness — per-team acceptance / completion / impact (Deliverable 10).
-- =============================================================================
create table if not exists public.team_effectiveness (
  team_key            text primary key,
  effectiveness_score integer not null default 0 check (effectiveness_score between 0 and 100),
  acceptance          integer not null default 0 check (acceptance between 0 and 100),
  completion          integer not null default 0 check (completion between 0 and 100),
  impact              integer not null default 0 check (impact between 0 and 100),
  members             integer not null default 0,
  computed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz default now()
);
comment on table public.team_effectiveness is 'HSI Phase 28: per-team effectiveness (acceptance/completion/impact). Advisory; never gates access.';

-- =============================================================================
-- D. leaderboard_snapshots — add five team-domain views (Deliverable 14).
-- =============================================================================
alter table public.leaderboard_snapshots drop constraint if exists leaderboard_snapshots_view_check;
alter table public.leaderboard_snapshots add constraint leaderboard_snapshots_view_check check (view in (
  'top_contributors','top_researchers','top_reviewers','top_curators','top_teams',
  -- Phase 28 — authority-ranked team-domain boards.
  'global','research','review','governance','security'
));

-- =============================================================================
-- E. updated_at trigger (team_effectiveness).
-- =============================================================================
drop trigger if exists set_updated_at on public.team_effectiveness;
create trigger set_updated_at before update on public.team_effectiveness
  for each row execute function public.set_updated_at();

-- =============================================================================
-- F. RLS — team_effectiveness: researcher+ read; admin all; worker writes via service role.
-- =============================================================================
alter table public.team_effectiveness enable row level security;
drop policy if exists team_effectiveness_admin_all on public.team_effectiveness;
drop policy if exists team_effectiveness_read on public.team_effectiveness;
create policy team_effectiveness_admin_all on public.team_effectiveness
  for all using (public.is_admin()) with check (public.is_admin());
create policy team_effectiveness_read on public.team_effectiveness
  for select using (public.is_researcher_or_above());

-- =============================================================================
-- NOTE
-- The Phase-28 worker now derives trust inputs from REAL source tables:
--   * review accuracy   ← investigation_reviews ⋈ investigation_governance_decisions
--   * governance effect ← governance decisions vs investigation final status
--   * publication qual. ← hsin_publications (state/trust_score/evidence_count)
--   * completion/impact ← investigations (status, outcomes)
-- It reads source tables directly, so existing contributors are BACKFILLED on the
-- next run. It still NEVER writes public.user_roles.
-- =============================================================================

-- =============================================================================
-- End of 0032_operational_trust_wiring.sql
-- =============================================================================
