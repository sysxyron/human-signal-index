# Phase 64 — Evidence Graph

**Status:** Complete (uncommitted)
**Route:** `/dashboard/evidence-graph` (reviewer+; admins also rebuild/edit)
**Migration:** `0051_evidence_graph.sql` (additive)

A relationship layer over existing intelligence: one graph connecting sources,
signals, evidence, claims, investigations, reports, corrections, watchlists, and
(reserved) narrative/actor/event/organization entities. **Every edge is built
deterministically from a real foreign key or stored tally — no AI inference, no
fabricated edges — and carries provenance.** No existing ingestion / review /
publication / monitoring workflow is altered.

---

## Architecture

```
lib/evidence-graph/
  types.ts        PURE — node/relationship vocabulary, data shapes, bounded
                  traversal (capped depth+breadth → large graphs never crash),
                  pure node-summary aggregation
  catalog.ts      PURE — relationship/node labels + DETERMINISTIC confidence
                  (stance from tallies, FK = 1.0, structural = 0.5)
  persistence.ts  DAL  — bulk upserts (builder), paged traversal queries, counts,
                  top-connected; reviewer+ read / admin manage via RLS
  builder.ts      buildGraph() — deterministic composition from existing FKs
  service.ts      RBAC-enforcing API (reviewer+ reads, admin mutations)
  data.ts         getEvidenceGraphDashboard() — overview + executive metrics
  actions.ts      rebuildGraphAction / create/removeGraphEdgeAction (admin, audited)

app/dashboard/evidence-graph/page.tsx          reviewer+ explorer (server-paged)
components/evidence-graph/                      panels (server) + GraphControls (client)
supabase/migrations/0051_evidence_graph.sql    nodes / edges / edge_evidence / relationship_types (RLS)
```

Consumes Phase 61 (source registry), 62 (notifications), and 63 (monitoring)
outputs as graph inputs; prepares Phase 65 (Narrative Intelligence).

---

## Node model

One table (`graph_nodes`) holds all 12 node types, deduped on `(node_type,
entity_id)` so each real entity maps to exactly one node (idempotent builder):

`SOURCE · SIGNAL · EVIDENCE · CLAIM · INVESTIGATION · REPORT · CORRECTION ·
WATCHLIST · NARRATIVE · ACTOR · EVENT · ORGANIZATION`

Each node: `node_type`, `entity_id` (the real row id), `label`, `status`,
`visibility`, `metadata`, `organization_id`, audit fields. `NARRATIVE/ACTOR/EVENT/
ORGANIZATION` are **supported** for Phase 65 readiness; the auto-builder fills the
others from existing data.

---

## Edge model

`graph_edges`: `source_node_id`, `target_node_id`, `relationship_type` (FK to the
seeded `graph_relationship_types`), `confidence` (0–1, **computed or explicitly
assigned**), `provenance`, `evidence_summary`, audit fields. Deduped on
`(source, target, relationship)`. Every edge also gets a `graph_edge_evidence`
row recording the exact fact it came from.

### Relationship types (15, seeded)

`SUPPORTS · CONTRADICTS · REFERENCES · DUPLICATES · DERIVED_FROM · RELATED_TO ·
SAME_SOURCE · SAME_ACTOR · SAME_EVENT · PART_OF · PUBLISHED_AS · CORRECTED_BY ·
WATCHES · MENTIONS · INVESTIGATES`

### Deterministic edges the builder creates (no fabrication)

| Edge | Source of truth | Confidence |
|---|---|---|
| `SIGNAL --DERIVED_FROM--> SOURCE` | `hsin_signals.source_id` (FK) | 1.0 |
| `EVIDENCE --SUPPORTS/CONTRADICTS--> INVESTIGATION` | claim `support_count`/`challenge_count`/`strength` | computed share / strength |
| `EVIDENCE --RELATED_TO--> EVIDENCE` | shared `investigation_id` (star, bounded) | 0.5 (structural) |
| `REPORT --CORRECTED_BY--> CORRECTION` | `hsin_publication_versions.to_state = RETRACTED` | 1.0 |
| `WATCHLIST --WATCHES--> SOURCE` | `hsin_watchlist_sources` (FK) | 1.0 |

The full 15-type vocabulary exists for manual `createEdge()` + Phase 65; the
builder only emits edges with a real backing fact. Relationships with no existing
FK (e.g. `PUBLISHED_AS`, `MENTIONS`, `SAME_ACTOR`) are intentionally **not**
fabricated — see Known Limitations.

### Confidence (never fabricated)

- **Explicit FK** → `1.0` (a recorded fact).
- **Stance** (SUPPORTS/CONTRADICTS) → explicit `strength` if valid, else the
  majority share `max(support,challenge)/(support+challenge)`, else `0.5` neutral.
- **Structural** (shared container) → `0.5`.

All pure + unit-tested.

---

## Traversal model

`traverse()` (pure) is a **bounded BFS** over an undirected view of edges: it caps
both depth and total nodes and returns `truncated: true` when the cap is hit.
`getSubgraphDal` issues per-level edge queries with a hard node cap; `getNeighbors`
is a paged two-step (edges → nodes). Result: large graphs degrade gracefully and
never load all at once — the explorer pages server-side via `?node=…` navigation.

---

## RBAC & security

- **Reviewer+** read everything (`is_reviewer_or_above`); **admin** manages /
  rebuilds (`is_admin`). The builder runs as an admin action or service-role cron.
- Route gated three ways: middleware `PROTECTED_ROUTES` (reviewer), `nav-roles`
  visibility (reviewer+), and a page self-gate. RLS is the real boundary.
- No public/anonymous graph APIs. Organization boundary carried on nodes/edges;
  visibility flag reserved for restricted evidence. No source credentials / crawler
  secrets are ever read or exposed.

---

## Graph queries (service API)

`createNode · createEdge · removeEdge` (admin) · `getNode · getNeighbors ·
getGraphSubgraph · getConnectedEvidence · getSupportingEvidence ·
getContradictingEvidence · getNodeSummary · searchNodes` (reviewer+). Each
resolves the user, enforces the role gate, and returns `DbResult`. The **node
intelligence summary** (`getNodeSummary`) computes connected
sources/signals/evidence/reports/corrections, supporting/contradicting counts,
relationship count, and graph depth — all from real neighbors.

### Executive graph metrics (dashboard)

Total nodes, total edges, average connectivity (`edges×2/nodes`), node-type +
relationship distribution, top-connected entities, top sources, most-referenced
claims, most-corrected reports, top actors, most-connected narratives — every
number computed from real nodes/edges (empty until the first rebuild).

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Graph + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2720 / 2720** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; `/dashboard/evidence-graph` → `ƒ` |
| Migration idempotency | ✅ re-runnable (if-not-exists + drop-policy + seed on-conflict) |
| No regressions / no fabricated edges | ✅ every edge has a real FK/tally + provenance |

> Migrations `0048`–`0051` must be applied to Supabase before the graph persists
> data; the page degrades to empty until the first admin **Rebuild graph**.

---

## Known limitations

- **Builder covers FK-backed edges only.** `PUBLISHED_AS`, `MENTIONS`,
  `SAME_ACTOR`, `SAME_EVENT`, `DUPLICATES` have no existing foreign key, so they
  are not auto-created (the types exist for manual `createEdge` + future phases).
  This is deliberate — no inferred/fabricated edges.
- **No canvas/D3 visualization.** The explorer is a server-paged relationship
  inspector (search → node → neighbor navigation, filter by relationship), chosen
  for graceful degradation on large graphs. A visual canvas is future work.
- **Rebuild is on-demand/admin** (or service-role); no automatic cron is wired in
  this phase (the builder is cron-ready).
- **NARRATIVE/ACTOR/EVENT/ORGANIZATION** nodes are modeled but not yet populated.

---

## Future Narrative Intelligence integration (Phase 65)

- `NARRATIVE` nodes + narrative relationships (`MENTIONS`, `SAME_EVENT`,
  `SAME_ACTOR`, `PART_OF`) are first-class in the schema now.
- Narrative clustering inputs = the existing evidence/claim/source subgraphs;
  Phase 65 will create `NARRATIVE` nodes and link supporting/contradicting
  evidence via the same provenance-backed `createEdge` path.
- `getGraphSubgraph` + `getNodeSummary` already provide the traversal primitives a
  narrative clusterer needs; Phase 66 (Agent Automation) can call `buildGraph` /
  `createEdge` as tools, and Phase 67 (Forecast Validation) can trace forecast →
  evidence lineage through the graph.
