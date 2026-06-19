-- =============================================================================
-- HSI Phase 64 — Evidence Graph.
--
-- A relationship layer OVER existing intelligence: one graph holding typed nodes
-- (source/signal/evidence/claim/investigation/report/correction/watchlist/
-- narrative/actor/event/organization) and provenance-backed edges between them.
-- ADDITIVE — no existing table/column/policy is modified; ingestion, review,
-- publication, and monitoring workflows are untouched. Edges are built
-- DETERMINISTICALLY from existing foreign keys (no AI inference, no fabrication);
-- every edge carries provenance.
--
-- SECURITY MODEL (RLS): reviewer+ READ (is_reviewer_or_above); admins MANAGE
-- (is_admin). The graph builder runs as an admin action or the service-role cron.
-- No public/anonymous access.
--
-- IDEMPOTENT (0048–0050 lessons): create-if-not-exists + add-column-if-not-exists
-- before dependent indexes + drop-policy-if-exists + seed on-conflict-do-nothing.
-- =============================================================================

-- ---- relationship type catalog (seeded reference) ---------------------------
create table if not exists public.graph_relationship_types (
  type text primary key,
  label text not null,
  description text,
  directional boolean not null default true,
  category text,
  created_at timestamptz not null default now()
);

insert into public.graph_relationship_types (type, label, description, directional, category) values
  ('SUPPORTS',     'Supports',      'Source node provides supporting evidence for the target.', true,  'evidential'),
  ('CONTRADICTS',  'Contradicts',   'Source node contradicts / challenges the target.',          true,  'evidential'),
  ('REFERENCES',   'References',     'Source node references the target.',                        true,  'reference'),
  ('DUPLICATES',   'Duplicates',    'Source node duplicates the target.',                        false, 'dedup'),
  ('DERIVED_FROM', 'Derived from',  'Source node was derived from the target.',                  true,  'lineage'),
  ('RELATED_TO',   'Related to',    'Structural relatedness (e.g. shared container).',           false, 'structural'),
  ('SAME_SOURCE',  'Same source',   'Both nodes originate from the same source.',                false, 'identity'),
  ('SAME_ACTOR',   'Same actor',    'Both nodes involve the same actor.',                        false, 'identity'),
  ('SAME_EVENT',   'Same event',    'Both nodes concern the same event.',                        false, 'identity'),
  ('PART_OF',      'Part of',       'Source node is a part of the target container.',            true,  'structural'),
  ('PUBLISHED_AS', 'Published as',  'Source node was published as the target report.',           true,  'lineage'),
  ('CORRECTED_BY', 'Corrected by',  'Source node was corrected / retracted by the target.',      true,  'lineage'),
  ('WATCHES',      'Watches',       'Source node (watchlist) watches the target.',               true,  'monitoring'),
  ('MENTIONS',     'Mentions',      'Source node mentions the target.',                          true,  'reference'),
  ('INVESTIGATES', 'Investigates',  'Source node investigates the target.',                      true,  'workflow')
on conflict (type) do nothing;

-- ---- nodes ------------------------------------------------------------------
create table if not exists public.graph_nodes (
  id uuid primary key default gen_random_uuid(),
  node_type text not null check (node_type in (
    'SOURCE', 'SIGNAL', 'EVIDENCE', 'CLAIM', 'INVESTIGATION', 'REPORT',
    'CORRECTION', 'WATCHLIST', 'NARRATIVE', 'ACTOR', 'EVENT', 'ORGANIZATION'
  )),
  entity_id text not null,
  label text,
  status text,
  organization_id uuid references public.organizations (id) on delete set null,
  visibility text not null default 'internal' check (visibility in ('public', 'internal', 'restricted')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (node_type, entity_id)
);
alter table public.graph_nodes add column if not exists label text;
alter table public.graph_nodes add column if not exists status text;
alter table public.graph_nodes add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.graph_nodes add column if not exists visibility text not null default 'internal';
alter table public.graph_nodes add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.graph_nodes add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.graph_nodes add column if not exists created_at timestamptz not null default now();
alter table public.graph_nodes add column if not exists updated_at timestamptz;
create index if not exists idx_graph_nodes_type on public.graph_nodes (node_type);
create index if not exists idx_graph_nodes_entity on public.graph_nodes (node_type, entity_id);

-- ---- edges ------------------------------------------------------------------
create table if not exists public.graph_edges (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid not null references public.graph_nodes (id) on delete cascade,
  target_node_id uuid not null references public.graph_nodes (id) on delete cascade,
  relationship_type text not null references public.graph_relationship_types (type),
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  provenance text,
  evidence_summary text,
  organization_id uuid references public.organizations (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (source_node_id, target_node_id, relationship_type)
);
alter table public.graph_edges add column if not exists confidence numeric not null default 1;
alter table public.graph_edges add column if not exists provenance text;
alter table public.graph_edges add column if not exists evidence_summary text;
alter table public.graph_edges add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.graph_edges add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.graph_edges add column if not exists created_at timestamptz not null default now();
alter table public.graph_edges add column if not exists updated_at timestamptz;
create index if not exists idx_graph_edges_source on public.graph_edges (source_node_id);
create index if not exists idx_graph_edges_target on public.graph_edges (target_node_id);
create index if not exists idx_graph_edges_rel on public.graph_edges (relationship_type);

-- ---- edge provenance (every edge must justify itself) -----------------------
create table if not exists public.graph_edge_evidence (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references public.graph_edges (id) on delete cascade,
  evidence_kind text not null,
  evidence_ref text,
  note text,
  created_at timestamptz not null default now()
);
alter table public.graph_edge_evidence add column if not exists evidence_ref text;
alter table public.graph_edge_evidence add column if not exists note text;
alter table public.graph_edge_evidence add column if not exists created_at timestamptz not null default now();
create index if not exists idx_graph_edge_evidence_edge on public.graph_edge_evidence (edge_id);

-- ---- RLS --------------------------------------------------------------------
alter table public.graph_relationship_types enable row level security;
alter table public.graph_nodes enable row level security;
alter table public.graph_edges enable row level security;
alter table public.graph_edge_evidence enable row level security;

drop policy if exists graph_relationship_types_read on public.graph_relationship_types;
create policy graph_relationship_types_read on public.graph_relationship_types
  for select using (public.is_reviewer_or_above());
drop policy if exists graph_relationship_types_admin on public.graph_relationship_types;
create policy graph_relationship_types_admin on public.graph_relationship_types
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists graph_nodes_read on public.graph_nodes;
create policy graph_nodes_read on public.graph_nodes
  for select using (public.is_reviewer_or_above());
drop policy if exists graph_nodes_admin on public.graph_nodes;
create policy graph_nodes_admin on public.graph_nodes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists graph_edges_read on public.graph_edges;
create policy graph_edges_read on public.graph_edges
  for select using (public.is_reviewer_or_above());
drop policy if exists graph_edges_admin on public.graph_edges;
create policy graph_edges_admin on public.graph_edges
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists graph_edge_evidence_read on public.graph_edge_evidence;
create policy graph_edge_evidence_read on public.graph_edge_evidence
  for select using (public.is_reviewer_or_above());
drop policy if exists graph_edge_evidence_admin on public.graph_edge_evidence;
create policy graph_edge_evidence_admin on public.graph_edge_evidence
  for all using (public.is_admin()) with check (public.is_admin());
