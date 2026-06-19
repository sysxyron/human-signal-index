-- =============================================================================
-- HSI Phase 65 — Narrative Intelligence Engine.
--
-- A narrative is an OBSERVABLE information structure: a cluster of claims /
-- evidence / sources / actors / events that reinforce or challenge a storyline.
-- Narratives are SEEDED by a reviewer/admin (a graph node) and their membership is
-- expanded DETERMINISTICALLY over the Phase 64 evidence graph (real edges only) —
-- no LLM inference, no fabricated narratives, no truth scoring, no moderation.
-- ADDITIVE: no existing table/column/policy modified.
--
-- SECURITY (RLS): reviewer+ READ (is_reviewer_or_above); admin MANAGE (is_admin).
-- IDEMPOTENT (0048–0051 lessons): create-if-not-exists + add-column-if-not-exists
-- before dependent indexes + drop-policy-if-exists.
-- =============================================================================

-- ---- narratives -------------------------------------------------------------
create table if not exists public.narratives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  summary text,
  status text not null default 'emerging'
    check (status in ('emerging', 'active', 'dominant', 'fragmenting', 'declining', 'archived')),
  seed_node_id uuid references public.graph_nodes (id) on delete set null,
  graph_node_id uuid references public.graph_nodes (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.narratives add column if not exists slug text;
alter table public.narratives add column if not exists summary text;
alter table public.narratives add column if not exists status text not null default 'emerging';
alter table public.narratives add column if not exists seed_node_id uuid references public.graph_nodes (id) on delete set null;
alter table public.narratives add column if not exists graph_node_id uuid references public.graph_nodes (id) on delete set null;
alter table public.narratives add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.narratives add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.narratives add column if not exists created_at timestamptz not null default now();
alter table public.narratives add column if not exists updated_at timestamptz;
create index if not exists idx_narratives_status on public.narratives (status);

-- ---- members (cluster membership, each with an explainable reason) -----------
create table if not exists public.narrative_members (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.narratives (id) on delete cascade,
  node_id uuid not null references public.graph_nodes (id) on delete cascade,
  member_type text not null,
  reason text,
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  depth integer not null default 0,
  created_at timestamptz not null default now(),
  unique (narrative_id, node_id)
);
alter table public.narrative_members add column if not exists member_type text not null default 'EVIDENCE';
alter table public.narrative_members add column if not exists reason text;
alter table public.narrative_members add column if not exists confidence numeric not null default 1;
alter table public.narrative_members add column if not exists depth integer not null default 0;
alter table public.narrative_members add column if not exists created_at timestamptz not null default now();
create index if not exists idx_narrative_members_narrative on public.narrative_members (narrative_id);
create index if not exists idx_narrative_members_node on public.narrative_members (node_id);

-- ---- claims (claim/evidence members with a stance) --------------------------
create table if not exists public.narrative_claims (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.narratives (id) on delete cascade,
  node_id uuid not null references public.graph_nodes (id) on delete cascade,
  stance text not null default 'neutral' check (stance in ('supporting', 'contradicting', 'neutral')),
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  unique (narrative_id, node_id)
);
alter table public.narrative_claims add column if not exists stance text not null default 'neutral';
alter table public.narrative_claims add column if not exists confidence numeric not null default 1;
alter table public.narrative_claims add column if not exists created_at timestamptz not null default now();
create index if not exists idx_narrative_claims_narrative on public.narrative_claims (narrative_id);

-- ---- sources (source members + contribution) -------------------------------
create table if not exists public.narrative_sources (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.narratives (id) on delete cascade,
  node_id uuid not null references public.graph_nodes (id) on delete cascade,
  signal_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (narrative_id, node_id)
);
alter table public.narrative_sources add column if not exists signal_count integer not null default 0;
alter table public.narrative_sources add column if not exists created_at timestamptz not null default now();
create index if not exists idx_narrative_sources_narrative on public.narrative_sources (narrative_id);

-- ---- events (append-only timeline log) -------------------------------------
create table if not exists public.narrative_events (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.narratives (id) on delete cascade,
  event_type text not null,
  detail text,
  magnitude numeric,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.narrative_events add column if not exists detail text;
alter table public.narrative_events add column if not exists magnitude numeric;
alter table public.narrative_events add column if not exists occurred_at timestamptz not null default now();
alter table public.narrative_events add column if not exists created_at timestamptz not null default now();
create index if not exists idx_narrative_events_narrative on public.narrative_events (narrative_id, occurred_at desc);

-- ---- metrics (latest computed health metrics) ------------------------------
create table if not exists public.narrative_metrics (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.narratives (id) on delete cascade,
  member_count integer not null default 0,
  coverage numeric,
  source_diversity numeric,
  evidence_density numeric,
  claim_density numeric,
  actor_diversity numeric,
  contradiction_ratio numeric,
  stability_score numeric,
  computed_at timestamptz not null default now()
);
alter table public.narrative_metrics add column if not exists member_count integer not null default 0;
alter table public.narrative_metrics add column if not exists coverage numeric;
alter table public.narrative_metrics add column if not exists source_diversity numeric;
alter table public.narrative_metrics add column if not exists evidence_density numeric;
alter table public.narrative_metrics add column if not exists claim_density numeric;
alter table public.narrative_metrics add column if not exists actor_diversity numeric;
alter table public.narrative_metrics add column if not exists contradiction_ratio numeric;
alter table public.narrative_metrics add column if not exists stability_score numeric;
alter table public.narrative_metrics add column if not exists computed_at timestamptz not null default now();
create index if not exists idx_narrative_metrics_narrative on public.narrative_metrics (narrative_id, computed_at desc);

-- ---- snapshots (timeline series for growth/decline) ------------------------
create table if not exists public.narrative_snapshots (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.narratives (id) on delete cascade,
  member_count integer not null default 0,
  signal_count integer not null default 0,
  evidence_count integer not null default 0,
  source_count integer not null default 0,
  actor_count integer not null default 0,
  contradiction_ratio numeric,
  stability_score numeric,
  snapshot_at timestamptz not null default now()
);
alter table public.narrative_snapshots add column if not exists actor_count integer not null default 0;
alter table public.narrative_snapshots add column if not exists contradiction_ratio numeric;
alter table public.narrative_snapshots add column if not exists stability_score numeric;
alter table public.narrative_snapshots add column if not exists snapshot_at timestamptz not null default now();
create index if not exists idx_narrative_snapshots_narrative on public.narrative_snapshots (narrative_id, snapshot_at desc);

-- ---- alerts -----------------------------------------------------------------
create table if not exists public.narrative_alerts (
  id uuid primary key default gen_random_uuid(),
  narrative_id uuid not null references public.narratives (id) on delete cascade,
  alert_type text not null check (alert_type in (
    'NARRATIVE_EMERGING', 'NARRATIVE_GROWING', 'NARRATIVE_DOMINANT', 'NARRATIVE_DECLINING', 'NARRATIVE_FRAGMENTING'
  )),
  severity text not null default 'NOTICE' check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  notification_id uuid references public.notifications (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.narrative_alerts add column if not exists severity text not null default 'NOTICE';
alter table public.narrative_alerts add column if not exists reason text;
alter table public.narrative_alerts add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.narrative_alerts add column if not exists notification_id uuid references public.notifications (id) on delete set null;
alter table public.narrative_alerts add column if not exists created_at timestamptz not null default now();
create index if not exists idx_narrative_alerts_narrative on public.narrative_alerts (narrative_id, created_at desc);

-- ---- RLS --------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'narratives', 'narrative_members', 'narrative_claims', 'narrative_sources',
    'narrative_events', 'narrative_metrics', 'narrative_snapshots', 'narrative_alerts'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_read on public.%I;', t, t);
    execute format('create policy %I_read on public.%I for select using (public.is_reviewer_or_above());', t, t);
    execute format('drop policy if exists %I_admin on public.%I;', t, t);
    execute format('create policy %I_admin on public.%I for all using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;
