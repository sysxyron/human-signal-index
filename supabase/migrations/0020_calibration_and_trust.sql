-- =============================================================================
-- Human Signal Index — 0020_calibration_and_trust.sql
-- WorldForge / HSI (Phase 16) — Calibration & Trust Engine.
--
-- Phase 16 sits on top of the decision-intelligence (Phase 13, migration 0017)
-- and outcome-tracking (Phase 15, migration 0019) layers. Where Phase 15 records
-- WHAT HAPPENED (the outcome of each recommendation, calibrated per-intervention
-- confidence, alerts, governance), Phase 16 asks HOW WELL CALIBRATED and HOW
-- TRUSTWORTHY the system's own confidence is:
--
--   * hsin_calibration_snapshots — point-in-time calibration of predicted
--       confidence vs observed success for a scope/kind (ECE/MCE/overconfidence
--       index/Brier + the reliability curve as jsonb bins);
--   * hsin_reliability_curves     — the per-bin reliability-diagram rows behind a
--       snapshot (predicted-confidence band vs observed success rate);
--   * hsin_brier_scores           — standalone Brier scores per scope/kind with a
--       calibration-quality label, interpretation, and decomposition;
--   * hsin_confidence_drift       — detected drift between a prior and current ECE
--       (overconfidence / underconfidence / degradation / improvement / stable);
--   * hsin_source_trust           — the SourceTrust model: a 0..100 trust score +
--       band for a monitored source (unique per source);
--   * hsin_narrative_trust        — trust for a tracked narrative (unique per narrative);
--   * hsin_decision_trust         — trust for a decision run (unique per run);
--   * hsin_forecast_trust         — trust for a narrative forecast (forecast_kind).
--
-- It also EXTENDS the Phase-15 hsin_decision_alerts.alert_type CHECK to add four
-- Phase-16 alert types (calibration_drift, trust_collapse, confidence_instability,
-- forecast_miscalibration) while keeping all six existing ones.
--
-- ---------------------------------------------------------------------------
-- NAMING — the `hsin_` PREFIX (consistent with Phases 7-15 / migrations 0011-0019).
-- ---------------------------------------------------------------------------
-- Every Phase-16 table uses the `hsin_` prefix and references the Phase-7 source
-- table public.hsin_sources(id) (0011), the Phase-8 narrative table
-- public.hsin_narratives(id) (0012), and the Phase-13 run table
-- public.hsin_decision_runs(id) (0017).
-- ---------------------------------------------------------------------------
--
-- This migration is ADD-ONLY (plus the one ALTER to extend an existing CHECK on
-- hsin_decision_alerts). It does NOT edit migrations 0001-0019, drop existing
-- policies/roles/helpers, or touch any other existing table/RLS.
--
-- CONVENTIONS (match 0001-0019):
--   - snake_case identifiers; `create table if not exists`.
--   - uuid pk default gen_random_uuid(); created_at timestamptz not null default now().
--   - FKs to public.hsin_sources(id) / public.hsin_narratives(id) /
--     public.hsin_decision_runs(id): on delete cascade where the trust row has no
--     meaning without its entity (source/narrative/decision trust), on delete set
--     null where the row stands on its own (forecast trust keeps a soft narrative link).
--   - created_by / overridden_by uuid references public.users(id) on delete set null.
--   - enum-style text columns guarded by CHECK constraints; numeric ranges by CHECK.
--   - The shared public.set_updated_at() trigger (from 0003) is attached to the 4
--     mutable, edited-in-place TRUST tables (source/narrative/decision/forecast trust).
--     The append-only calibration tables carry no updated_at trigger.
--   - RLS via the existing SECURITY DEFINER role helpers:
--       public.is_admin(), public.is_researcher_or_above() (0002 + 0010),
--       public.is_curator_or_admin() (0010).
--
-- ROLE / ACCESS MODEL (re-uses the 5-role ladder from 0010):
--   viewer < researcher < reviewer < curator < admin
--   All 8 tables are part of the SHARED decision-intelligence graph.
--   READ: per spec, researcher / reviewer / curator / admin may read calibration &
--     trust — guarded by public.is_researcher_or_above() on SELECT.
--   WRITE: per spec, only admin / curator may produce or modify calibration & trust
--     (calibration snapshots/curves/brier/drift are computed by curator+/worker;
--     trust overrides are an admin/curator action) — guarded by
--     public.is_curator_or_admin() on INSERT/UPDATE/DELETE.
--   admin has full control everywhere (public.is_admin()).
--   The background CALIBRATION / ALERT WORKER uses the Supabase service_role key,
--   which BYPASSES RLS entirely — it computes calibration snapshots & reliability
--   curves, scores Brier, detects drift, recomputes trust, and raises the four new
--   alert types without needing these policies. The policies below govern only
--   user-facing (per-request, cookie-backed) access.
-- =============================================================================

-- =============================================================================
-- A. EXTEND hsin_decision_alerts.alert_type (Phase 15, migration 0019)
-- Add the 4 new Phase-16 alert types while keeping all 6 existing ones. The
-- Phase-15 CHECK was declared INLINE/unnamed, so Postgres auto-named it
-- `hsin_decision_alerts_alert_type_check`. We drop that conventional name (if
-- exists) and re-add it as an explicitly-named constraint carrying the full set.
-- =============================================================================
alter table public.hsin_decision_alerts
  drop constraint if exists hsin_decision_alerts_alert_type_check;

alter table public.hsin_decision_alerts
  add constraint hsin_decision_alerts_alert_type_check check (alert_type in (
    -- existing Phase-15 alert types
    'recommendation_failed','confidence_drift','narrative_spike',
    'forecast_miss','resurgence','security_anomaly',
    -- new Phase-16 alert types
    'calibration_drift','trust_collapse','confidence_instability','forecast_miscalibration'));

-- =============================================================================
-- B. TABLES
-- =============================================================================

-- ---------- hsin_calibration_snapshots ----------------------------------------
-- A point-in-time calibration of predicted confidence vs observed success for a
-- scope/kind. expected_calibration_error (ECE) / max_calibration_error (MCE) /
-- overconfidence_index / brier_score summarise calibration; curve carries the
-- reliability-diagram bins (jsonb). created_by is the producer (worker rows are
-- null under the service role).
create table if not exists public.hsin_calibration_snapshots (
  id                         uuid primary key default gen_random_uuid(),
  scope                      text,
  kind                       text,
  sample_count               int,
  expected_calibration_error numeric,
  max_calibration_error      numeric,
  overconfidence_index       numeric,
  brier_score                numeric,
  curve                      jsonb,   -- reliability-diagram bins
  generated_at               timestamptz,
  created_by                 uuid references public.users(id) on delete set null,
  created_at                 timestamptz not null default now()
);
comment on table public.hsin_calibration_snapshots is
  'HSIN Phase 16: point-in-time calibration of predicted confidence vs observed success for a scope/kind (ECE/MCE/overconfidence/Brier + reliability curve bins).';

-- ---------- hsin_reliability_curves -------------------------------------------
-- The per-bin reliability-diagram rows behind a calibration snapshot. Each row is
-- a predicted-confidence band [bin_lower, bin_upper) with the count of samples,
-- the mean predicted confidence, the observed success rate, and the per-bin
-- calibration error.
create table if not exists public.hsin_reliability_curves (
  id                      uuid primary key default gen_random_uuid(),
  calibration_snapshot_id uuid references public.hsin_calibration_snapshots(id) on delete cascade,
  bin_lower               numeric,
  bin_upper               numeric,
  count                   int,
  mean_confidence         numeric,
  observed_success        numeric,
  calibration_error       numeric,
  created_at              timestamptz not null default now()
);
comment on table public.hsin_reliability_curves is
  'HSIN Phase 16: per-bin reliability-diagram rows behind a calibration snapshot (band/count/mean_confidence/observed_success/calibration_error).';

-- ---------- hsin_brier_scores -------------------------------------------------
-- A standalone Brier score per scope/kind. calibration_quality is the labelled
-- bucket (excellent/good/fair/poor/insufficient_data); interpretation is the
-- human-readable summary; decomposition carries the reliability/resolution/
-- uncertainty decomposition (jsonb).
create table if not exists public.hsin_brier_scores (
  id                  uuid primary key default gen_random_uuid(),
  scope               text,
  kind                text,
  score               numeric,
  sample_count        int,
  calibration_quality text,
  interpretation      text,
  decomposition       jsonb,
  created_at          timestamptz not null default now()
);
comment on table public.hsin_brier_scores is
  'HSIN Phase 16: standalone Brier score per scope/kind (score/calibration_quality/interpretation/decomposition).';

-- ---------- hsin_confidence_drift ---------------------------------------------
-- A detected drift between a prior and current ECE. drift_kind classifies the
-- shift; magnitude is its size; current_ece / prior_ece bracket the change;
-- recommendation / explanation carry the guidance and rationale.
create table if not exists public.hsin_confidence_drift (
  id             uuid primary key default gen_random_uuid(),
  scope          text,
  drift_kind     text check (drift_kind in (
                   'overconfidence','underconfidence','degradation','improvement','stable')),
  magnitude      numeric,
  current_ece    numeric,
  prior_ece      numeric,
  recommendation text,
  explanation    text,
  detected_at    timestamptz,
  created_at     timestamptz not null default now()
);
comment on table public.hsin_confidence_drift is
  'HSIN Phase 16: detected drift between a prior and current ECE (drift_kind/magnitude/current_ece/prior_ece/recommendation).';

-- ---------- hsin_source_trust -------------------------------------------------
-- The SourceTrust model: a 0..100 trust_score + low/medium/high band for a
-- monitored source. unique(source_id) keeps one trust row per source (idempotent
-- upsert by the worker). See COMMON TRUST COLUMNS below.
create table if not exists public.hsin_source_trust (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid references public.hsin_sources(id) on delete cascade,
  trust_score       numeric check (trust_score >= 0 and trust_score <= 100),
  confidence        numeric check (confidence >= 0 and confidence <= 1),
  evidence_count    int default 0,
  calibration_score numeric,
  band              text check (band in ('low','medium','high')),
  explanation       jsonb,
  limitations       jsonb,
  overridden        boolean default false,
  override_reason   text,
  overridden_by     uuid references public.users(id) on delete set null,
  last_updated      timestamptz default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz default now(),
  unique (source_id)
);
comment on table public.hsin_source_trust is
  'HSIN Phase 16: SourceTrust — 0..100 trust score + band for a monitored source (unique per source).';

-- ---------- hsin_narrative_trust ----------------------------------------------
-- Trust for a tracked narrative. unique(narrative_id) keeps one trust row per
-- narrative. See COMMON TRUST COLUMNS below.
create table if not exists public.hsin_narrative_trust (
  id                uuid primary key default gen_random_uuid(),
  narrative_id      uuid references public.hsin_narratives(id) on delete cascade,
  trust_score       numeric check (trust_score >= 0 and trust_score <= 100),
  confidence        numeric check (confidence >= 0 and confidence <= 1),
  evidence_count    int default 0,
  calibration_score numeric,
  band              text check (band in ('low','medium','high')),
  explanation       jsonb,
  limitations       jsonb,
  overridden        boolean default false,
  override_reason   text,
  overridden_by     uuid references public.users(id) on delete set null,
  last_updated      timestamptz default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz default now(),
  unique (narrative_id)
);
comment on table public.hsin_narrative_trust is
  'HSIN Phase 16: trust — 0..100 trust score + band for a tracked narrative (unique per narrative).';

-- ---------- hsin_decision_trust -----------------------------------------------
-- Trust for a Phase-13 decision run. unique(decision_run_id) keeps one trust row
-- per run. See COMMON TRUST COLUMNS below.
create table if not exists public.hsin_decision_trust (
  id                uuid primary key default gen_random_uuid(),
  decision_run_id   uuid references public.hsin_decision_runs(id) on delete cascade,
  trust_score       numeric check (trust_score >= 0 and trust_score <= 100),
  confidence        numeric check (confidence >= 0 and confidence <= 1),
  evidence_count    int default 0,
  calibration_score numeric,
  band              text check (band in ('low','medium','high')),
  explanation       jsonb,
  limitations       jsonb,
  overridden        boolean default false,
  override_reason   text,
  overridden_by     uuid references public.users(id) on delete set null,
  last_updated      timestamptz default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz default now(),
  unique (decision_run_id)
);
comment on table public.hsin_decision_trust is
  'HSIN Phase 16: trust — 0..100 trust score + band for a decision run (unique per run).';

-- ---------- hsin_forecast_trust -----------------------------------------------
-- Trust for a narrative forecast. narrative_id is a SOFT link (on delete set null)
-- — a forecast-trust row keeps context if its narrative is removed; forecast_kind
-- labels the forecast variety. See COMMON TRUST COLUMNS below.
create table if not exists public.hsin_forecast_trust (
  id                uuid primary key default gen_random_uuid(),
  narrative_id      uuid references public.hsin_narratives(id) on delete set null,
  forecast_kind     text,
  trust_score       numeric check (trust_score >= 0 and trust_score <= 100),
  confidence        numeric check (confidence >= 0 and confidence <= 1),
  evidence_count    int default 0,
  calibration_score numeric,
  band              text check (band in ('low','medium','high')),
  explanation       jsonb,
  limitations       jsonb,
  overridden        boolean default false,
  override_reason   text,
  overridden_by     uuid references public.users(id) on delete set null,
  last_updated      timestamptz default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz default now()
);
comment on table public.hsin_forecast_trust is
  'HSIN Phase 16: trust — 0..100 trust score + band for a narrative forecast (forecast_kind; soft narrative link).';

-- =============================================================================
-- C. INDEXES — foreign keys + common filter columns
-- =============================================================================
create index if not exists idx_hsin_calibration_snapshots_scope        on public.hsin_calibration_snapshots(scope);
create index if not exists idx_hsin_calibration_snapshots_kind         on public.hsin_calibration_snapshots(kind);
create index if not exists idx_hsin_calibration_snapshots_generated_at on public.hsin_calibration_snapshots(generated_at);

create index if not exists idx_hsin_reliability_curves_snapshot_id on public.hsin_reliability_curves(calibration_snapshot_id);

create index if not exists idx_hsin_brier_scores_scope      on public.hsin_brier_scores(scope);
create index if not exists idx_hsin_brier_scores_kind       on public.hsin_brier_scores(kind);
create index if not exists idx_hsin_brier_scores_created_at on public.hsin_brier_scores(created_at);

create index if not exists idx_hsin_confidence_drift_scope      on public.hsin_confidence_drift(scope);
create index if not exists idx_hsin_confidence_drift_drift_kind on public.hsin_confidence_drift(drift_kind);
create index if not exists idx_hsin_confidence_drift_created_at on public.hsin_confidence_drift(created_at);

create index if not exists idx_hsin_source_trust_source_id   on public.hsin_source_trust(source_id);
create index if not exists idx_hsin_source_trust_trust_score on public.hsin_source_trust(trust_score);
create index if not exists idx_hsin_source_trust_band        on public.hsin_source_trust(band);

create index if not exists idx_hsin_narrative_trust_narrative_id on public.hsin_narrative_trust(narrative_id);
create index if not exists idx_hsin_narrative_trust_trust_score  on public.hsin_narrative_trust(trust_score);
create index if not exists idx_hsin_narrative_trust_band         on public.hsin_narrative_trust(band);

create index if not exists idx_hsin_decision_trust_decision_run_id on public.hsin_decision_trust(decision_run_id);
create index if not exists idx_hsin_decision_trust_trust_score     on public.hsin_decision_trust(trust_score);
create index if not exists idx_hsin_decision_trust_band            on public.hsin_decision_trust(band);

create index if not exists idx_hsin_forecast_trust_narrative_id on public.hsin_forecast_trust(narrative_id);
create index if not exists idx_hsin_forecast_trust_trust_score  on public.hsin_forecast_trust(trust_score);
create index if not exists idx_hsin_forecast_trust_band         on public.hsin_forecast_trust(band);

-- =============================================================================
-- D. UPDATED_AT TRIGGERS — only on the 4 mutable, edited-in-place TRUST tables.
-- Re-uses public.set_updated_at() from 0003. Drop-then-create for idempotency.
-- The append-only calibration tables (hsin_calibration_snapshots,
-- hsin_reliability_curves, hsin_brier_scores, hsin_confidence_drift) carry no
-- updated_at column, so no trigger is attached to them.
-- =============================================================================
drop trigger if exists trg_set_updated_at on public.hsin_source_trust;
create trigger trg_set_updated_at before update on public.hsin_source_trust
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_narrative_trust;
create trigger trg_set_updated_at before update on public.hsin_narrative_trust
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_decision_trust;
create trigger trg_set_updated_at before update on public.hsin_decision_trust
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.hsin_forecast_trust;
create trigger trg_set_updated_at before update on public.hsin_forecast_trust
  for each row execute function public.set_updated_at();

-- =============================================================================
-- E. ENABLE RLS on all 8 new tables
-- =============================================================================
alter table public.hsin_calibration_snapshots enable row level security;
alter table public.hsin_reliability_curves    enable row level security;
alter table public.hsin_brier_scores          enable row level security;
alter table public.hsin_confidence_drift      enable row level security;
alter table public.hsin_source_trust          enable row level security;
alter table public.hsin_narrative_trust       enable row level security;
alter table public.hsin_decision_trust        enable row level security;
alter table public.hsin_forecast_trust        enable row level security;

-- =============================================================================
-- F. POLICIES
-- Convention (matches 0002/0010/0011-0019): permissive policies are OR-combined —
-- a row is visible/writable if ANY policy allows it. Drop-then-create for
-- idempotency. The background calibration/alert worker uses the service_role key
-- and bypasses ALL of these.
--
-- Uniform shape for all 8 tables:
--   researcher+ READ (public.is_researcher_or_above());
--   curator/admin INSERT/UPDATE/DELETE (public.is_curator_or_admin());
--   admin all (public.is_admin()).
-- =============================================================================

-- ---------- hsin_calibration_snapshots ----------------------------------------
drop policy if exists hsin_calibration_snapshots_admin_all   on public.hsin_calibration_snapshots;
drop policy if exists hsin_calibration_snapshots_read        on public.hsin_calibration_snapshots;
drop policy if exists hsin_calibration_snapshots_curator_ins on public.hsin_calibration_snapshots;
drop policy if exists hsin_calibration_snapshots_curator_upd on public.hsin_calibration_snapshots;
drop policy if exists hsin_calibration_snapshots_curator_del on public.hsin_calibration_snapshots;

create policy hsin_calibration_snapshots_admin_all on public.hsin_calibration_snapshots
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_calibration_snapshots_read on public.hsin_calibration_snapshots
  for select using (public.is_researcher_or_above());
create policy hsin_calibration_snapshots_curator_ins on public.hsin_calibration_snapshots
  for insert with check (public.is_curator_or_admin());
create policy hsin_calibration_snapshots_curator_upd on public.hsin_calibration_snapshots
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_calibration_snapshots_curator_del on public.hsin_calibration_snapshots
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_reliability_curves -------------------------------------------
drop policy if exists hsin_reliability_curves_admin_all   on public.hsin_reliability_curves;
drop policy if exists hsin_reliability_curves_read        on public.hsin_reliability_curves;
drop policy if exists hsin_reliability_curves_curator_ins on public.hsin_reliability_curves;
drop policy if exists hsin_reliability_curves_curator_upd on public.hsin_reliability_curves;
drop policy if exists hsin_reliability_curves_curator_del on public.hsin_reliability_curves;

create policy hsin_reliability_curves_admin_all on public.hsin_reliability_curves
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_reliability_curves_read on public.hsin_reliability_curves
  for select using (public.is_researcher_or_above());
create policy hsin_reliability_curves_curator_ins on public.hsin_reliability_curves
  for insert with check (public.is_curator_or_admin());
create policy hsin_reliability_curves_curator_upd on public.hsin_reliability_curves
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_reliability_curves_curator_del on public.hsin_reliability_curves
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_brier_scores -------------------------------------------------
drop policy if exists hsin_brier_scores_admin_all   on public.hsin_brier_scores;
drop policy if exists hsin_brier_scores_read        on public.hsin_brier_scores;
drop policy if exists hsin_brier_scores_curator_ins on public.hsin_brier_scores;
drop policy if exists hsin_brier_scores_curator_upd on public.hsin_brier_scores;
drop policy if exists hsin_brier_scores_curator_del on public.hsin_brier_scores;

create policy hsin_brier_scores_admin_all on public.hsin_brier_scores
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_brier_scores_read on public.hsin_brier_scores
  for select using (public.is_researcher_or_above());
create policy hsin_brier_scores_curator_ins on public.hsin_brier_scores
  for insert with check (public.is_curator_or_admin());
create policy hsin_brier_scores_curator_upd on public.hsin_brier_scores
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_brier_scores_curator_del on public.hsin_brier_scores
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_confidence_drift ---------------------------------------------
drop policy if exists hsin_confidence_drift_admin_all   on public.hsin_confidence_drift;
drop policy if exists hsin_confidence_drift_read        on public.hsin_confidence_drift;
drop policy if exists hsin_confidence_drift_curator_ins on public.hsin_confidence_drift;
drop policy if exists hsin_confidence_drift_curator_upd on public.hsin_confidence_drift;
drop policy if exists hsin_confidence_drift_curator_del on public.hsin_confidence_drift;

create policy hsin_confidence_drift_admin_all on public.hsin_confidence_drift
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_confidence_drift_read on public.hsin_confidence_drift
  for select using (public.is_researcher_or_above());
create policy hsin_confidence_drift_curator_ins on public.hsin_confidence_drift
  for insert with check (public.is_curator_or_admin());
create policy hsin_confidence_drift_curator_upd on public.hsin_confidence_drift
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_confidence_drift_curator_del on public.hsin_confidence_drift
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_source_trust -------------------------------------------------
drop policy if exists hsin_source_trust_admin_all   on public.hsin_source_trust;
drop policy if exists hsin_source_trust_read        on public.hsin_source_trust;
drop policy if exists hsin_source_trust_curator_ins on public.hsin_source_trust;
drop policy if exists hsin_source_trust_curator_upd on public.hsin_source_trust;
drop policy if exists hsin_source_trust_curator_del on public.hsin_source_trust;

create policy hsin_source_trust_admin_all on public.hsin_source_trust
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_source_trust_read on public.hsin_source_trust
  for select using (public.is_researcher_or_above());
create policy hsin_source_trust_curator_ins on public.hsin_source_trust
  for insert with check (public.is_curator_or_admin());
create policy hsin_source_trust_curator_upd on public.hsin_source_trust
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_source_trust_curator_del on public.hsin_source_trust
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_narrative_trust ----------------------------------------------
drop policy if exists hsin_narrative_trust_admin_all   on public.hsin_narrative_trust;
drop policy if exists hsin_narrative_trust_read        on public.hsin_narrative_trust;
drop policy if exists hsin_narrative_trust_curator_ins on public.hsin_narrative_trust;
drop policy if exists hsin_narrative_trust_curator_upd on public.hsin_narrative_trust;
drop policy if exists hsin_narrative_trust_curator_del on public.hsin_narrative_trust;

create policy hsin_narrative_trust_admin_all on public.hsin_narrative_trust
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_narrative_trust_read on public.hsin_narrative_trust
  for select using (public.is_researcher_or_above());
create policy hsin_narrative_trust_curator_ins on public.hsin_narrative_trust
  for insert with check (public.is_curator_or_admin());
create policy hsin_narrative_trust_curator_upd on public.hsin_narrative_trust
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_narrative_trust_curator_del on public.hsin_narrative_trust
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_decision_trust -----------------------------------------------
drop policy if exists hsin_decision_trust_admin_all   on public.hsin_decision_trust;
drop policy if exists hsin_decision_trust_read        on public.hsin_decision_trust;
drop policy if exists hsin_decision_trust_curator_ins on public.hsin_decision_trust;
drop policy if exists hsin_decision_trust_curator_upd on public.hsin_decision_trust;
drop policy if exists hsin_decision_trust_curator_del on public.hsin_decision_trust;

create policy hsin_decision_trust_admin_all on public.hsin_decision_trust
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_decision_trust_read on public.hsin_decision_trust
  for select using (public.is_researcher_or_above());
create policy hsin_decision_trust_curator_ins on public.hsin_decision_trust
  for insert with check (public.is_curator_or_admin());
create policy hsin_decision_trust_curator_upd on public.hsin_decision_trust
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_decision_trust_curator_del on public.hsin_decision_trust
  for delete using (public.is_curator_or_admin());

-- ---------- hsin_forecast_trust -----------------------------------------------
drop policy if exists hsin_forecast_trust_admin_all   on public.hsin_forecast_trust;
drop policy if exists hsin_forecast_trust_read        on public.hsin_forecast_trust;
drop policy if exists hsin_forecast_trust_curator_ins on public.hsin_forecast_trust;
drop policy if exists hsin_forecast_trust_curator_upd on public.hsin_forecast_trust;
drop policy if exists hsin_forecast_trust_curator_del on public.hsin_forecast_trust;

create policy hsin_forecast_trust_admin_all on public.hsin_forecast_trust
  for all using (public.is_admin()) with check (public.is_admin());
create policy hsin_forecast_trust_read on public.hsin_forecast_trust
  for select using (public.is_researcher_or_above());
create policy hsin_forecast_trust_curator_ins on public.hsin_forecast_trust
  for insert with check (public.is_curator_or_admin());
create policy hsin_forecast_trust_curator_upd on public.hsin_forecast_trust
  for update using (public.is_curator_or_admin()) with check (public.is_curator_or_admin());
create policy hsin_forecast_trust_curator_del on public.hsin_forecast_trust
  for delete using (public.is_curator_or_admin());

-- =============================================================================
-- NOTE ON SERVICE ROLE
-- The Supabase service_role key bypasses RLS entirely. The background
-- calibration/alert worker (computing calibration snapshots & reliability curves,
-- scoring Brier, detecting confidence drift, recomputing source/narrative/
-- decision/forecast trust, and raising the four new Phase-16 alert types) uses it.
-- User-facing reads/writes go through the per-request, cookie-backed client and
-- are authorized by the policies above. NEVER expose service_role to clients.
-- =============================================================================

-- =============================================================================
-- End of 0020_calibration_and_trust.sql
-- =============================================================================
