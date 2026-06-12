-- =============================================================================
-- Human Signal Index — 0026_executive_command_center.sql
-- WorldForge / HSI (Phase 22) — Executive Command Center & Strategic Intelligence OS.
--
-- THE COMMAND LAYER. Phase 22 creates NO new intelligence — it OPERATES the
-- intelligence built in Phases 1-21. From a UNIFIED SYSTEM STATE it persists the
-- executive snapshot, the ranked strategic priorities, the generated briefs, the
-- daily intelligence report, the executive review queue, and the human decisions.
--
--   * hsin_executive_snapshots  — the full executive snapshot (attention index +
--                                 counts + executive summary + snapshot jsonb).
--   * hsin_executive_priorities — ranked strategic priorities (score/rank/kind +
--                                 attention level + recommendation + explanation).
--   * hsin_executive_briefs     — generated briefs (daily/weekly/critical/...).
--   * hsin_executive_reviews    — the executive review queue (queued items).
--   * hsin_executive_reports    — the daily intelligence report (jsonb).
--   * hsin_executive_decisions  — HUMAN decisions (reviewer + reason required,
--                                 reversible, append-only audit trail).
--
-- ACCESS MODEL (re-uses the 5-role ladder from 0010): researcher+ READ;
-- curator/admin WRITE; admin all. The EXECUTIVE WORKER uses the service_role key
-- (bypasses RLS). GOVERNANCE: autoPublish/autoApprove/autoAct/autoGovern = false.
-- Every snapshot/priority/brief is ADVISORY; every decision is HUMAN.
--
-- This migration is ADD-ONLY. It does NOT edit migrations 0001-0025.
-- CONVENTIONS (match 0001-0025): snake_case; gen_random_uuid() PKs; created_at
-- default now(); CHECK-guarded enums; the shared set_updated_at() trigger on
-- mutable tables; APPEND-ONLY tables carry no trigger.
-- =============================================================================

-- =============================================================================
-- A. TABLES
-- =============================================================================

create table if not exists public.hsin_executive_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  attention_index    numeric check (attention_index is null or (attention_index >= 0 and attention_index <= 100)),
  attention_level    text check (attention_level is null or attention_level in ('routine','notable','elevated','urgent')),
  overall_health     text check (overall_health is null or overall_health in ('HEALTHY','DEGRADED','DOWN')),
  executive_summary  text,
  snapshot           jsonb,
  priority_count     int default 0,
  risk_count         int default 0,
  opportunity_count  int default 0,
  governance_count   int default 0,
  limitations        jsonb,
  generated_at       timestamptz,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz default now()
);
comment on table public.hsin_executive_snapshots is
  'HSIN Phase 22: the executive snapshot (attention index + counts + summary). Advisory; creates no new intelligence.';

create table if not exists public.hsin_executive_priorities (
  id              uuid primary key default gen_random_uuid(),
  snapshot_id     uuid references public.hsin_executive_snapshots(id) on delete cascade,
  ref_id          text,
  kind            text check (kind is null or kind in ('risk','opportunity','investigation','forecast','warning','governance','consensus','trust')),
  title           text,
  score           numeric check (score is null or (score >= 0 and score <= 100)),
  rank            int,
  urgency         numeric check (urgency is null or (urgency >= 0 and urgency <= 1)),
  impact          numeric check (impact is null or (impact >= 0 and impact <= 1)),
  attention_level text check (attention_level is null or attention_level in ('routine','notable','elevated','urgent')),
  recommendation  text,
  explanation     jsonb,
  limitations     jsonb,
  entity_ref      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);
comment on table public.hsin_executive_priorities is
  'HSIN Phase 22: ranked strategic priorities (score/rank + attention + recommendation). Advisory only.';

create table if not exists public.hsin_executive_briefs (
  id           uuid primary key default gen_random_uuid(),
  kind         text check (kind is null or kind in ('daily','weekly','critical','governance','forecast','operations')),
  title        text,
  headline     text,
  sections     jsonb,
  limitations  jsonb,
  generated_at timestamptz,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);
comment on table public.hsin_executive_briefs is
  'HSIN Phase 22: generated executive briefs (daily/weekly/critical/governance/forecast/operations). Never auto-sent.';

create table if not exists public.hsin_executive_reviews (
  id          uuid primary key default gen_random_uuid(),
  priority_id text,
  title       text,
  kind        text check (kind is null or kind in ('risk','opportunity','investigation','forecast','warning','governance','consensus','trust')),
  severity    text check (severity is null or severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status      text check (status in ('queued','approved','rejected','archived')) default 'queued',
  queued_at   timestamptz,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz default now()
);
comment on table public.hsin_executive_reviews is
  'HSIN Phase 22: the executive review queue. A priority enters here for HUMAN review before any action.';

create table if not exists public.hsin_executive_reports (
  id                   uuid primary key default gen_random_uuid(),
  snapshot_id          uuid references public.hsin_executive_snapshots(id) on delete set null,
  title                text,
  report_date          date,
  report               jsonb,
  top_risk_count       int default 0,
  top_opportunity_count int default 0,
  generated_at         timestamptz,
  created_by           uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz default now()
);
comment on table public.hsin_executive_reports is
  'HSIN Phase 22: the daily intelligence report (snapshot + brief + top risks/opportunities). Advisory.';

create table if not exists public.hsin_executive_decisions (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid references public.hsin_executive_reviews(id) on delete set null,
  priority_id     text,
  decision        text check (decision in ('approved','rejected','archived')),
  reviewer        text not null,
  reason          text not null,
  previous_status text,
  reversible      boolean default true,
  audit_trail     jsonb,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now()
);
comment on table public.hsin_executive_decisions is
  'HSIN Phase 22: HUMAN executive decisions (reviewer + reason required, reversible, append-only audit trail).';

-- =============================================================================
-- B. INDEXES
-- =============================================================================
create index if not exists idx_hsin_exec_snapshots_created   on public.hsin_executive_snapshots(created_at);
create index if not exists idx_hsin_exec_snapshots_level      on public.hsin_executive_snapshots(attention_level);
create index if not exists idx_hsin_exec_priorities_snapshot  on public.hsin_executive_priorities(snapshot_id);
create index if not exists idx_hsin_exec_priorities_kind      on public.hsin_executive_priorities(kind);
create index if not exists idx_hsin_exec_priorities_rank      on public.hsin_executive_priorities(rank);
create index if not exists idx_hsin_exec_briefs_kind          on public.hsin_executive_briefs(kind);
create index if not exists idx_hsin_exec_briefs_created       on public.hsin_executive_briefs(created_at);
create index if not exists idx_hsin_exec_reviews_status       on public.hsin_executive_reviews(status);
create index if not exists idx_hsin_exec_reviews_priority     on public.hsin_executive_reviews(priority_id);
create index if not exists idx_hsin_exec_reports_date         on public.hsin_executive_reports(report_date);
create index if not exists idx_hsin_exec_decisions_review     on public.hsin_executive_decisions(review_id);
create index if not exists idx_hsin_exec_decisions_decision   on public.hsin_executive_decisions(decision);

-- =============================================================================
-- C. UPDATED_AT TRIGGERS — on the mutable tables. (All Phase-22 tables are
-- mutable: snapshots/priorities/briefs/reviews/reports/decisions.)
-- =============================================================================
do $$
declare
  t text;
  mutable text[] := array[
    'hsin_executive_snapshots','hsin_executive_priorities','hsin_executive_briefs',
    'hsin_executive_reviews','hsin_executive_reports','hsin_executive_decisions'];
begin
  foreach t in array mutable loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
    execute format('create trigger trg_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =============================================================================
-- D. ENABLE RLS + E. POLICIES (researcher+ READ; curator/admin WRITE; admin all)
-- =============================================================================
do $$
declare
  t text;
  all_tables text[] := array[
    'hsin_executive_snapshots','hsin_executive_priorities','hsin_executive_briefs',
    'hsin_executive_reviews','hsin_executive_reports','hsin_executive_decisions'];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
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
-- The Supabase service_role key bypasses RLS. The Phase-22 EXECUTIVE WORKER uses
-- it to assemble the unified system state, rank priorities, generate briefs, and
-- persist the snapshot + daily report every 60 minutes. It NEVER auto-publishes,
-- auto-approves, auto-acts, or auto-governs — every priority is advisory and every
-- decision requires a human reviewer + reason and is reversible + audit-logged.
-- =============================================================================

-- =============================================================================
-- End of 0026_executive_command_center.sql
-- =============================================================================
