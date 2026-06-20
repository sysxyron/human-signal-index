# Phase 70.4 — Signal Network Intelligence

**Status:** Complete (uncommitted) · **Type:** Additive, read-only (no migration)
**Routes:** `/dashboard/signal-network` (reviewer+) · `/dashboard/signal-network/[id]` (reviewer+)
**Migration:** none — every metric is READ from existing tables.

Turns the linear pipeline (Source → Signal Intake → Evidence → Narrative →
Forecast) into a **network**: HSI now understands signal relationships and signal
influence, and exposes a transparency-backed lineage for every signal. Nothing
is created, inferred, or fabricated — this layer only reads the Phase 64 evidence
graph, Phase 65 narratives, and Phase 67 forecasts. Human review stays
authoritative; no auth/ingestion/publishing/collection changes.

---

## 1. Architecture audit (performed before any code)

| System | Tables | Used for |
|---|---|---|
| Signals (P11) | `hsin_signals` (status: new/reviewing/approved/rejected/needs_research/published) | the signal records |
| Evidence graph (P64) | `graph_nodes` (node_type incl. `SIGNAL`,`NARRATIVE`,`EVIDENCE`,`CLAIM`,`REPORT`; `entity_id`), `graph_edges` (`SUPPORTS/CONTRADICTS/REFERENCES/DERIVED_FROM/RELATED_TO/PUBLISHED_AS/CORRECTED_BY…`), `graph_edge_evidence` | relationships (real edges) |
| Narratives (P65) | `narrative_members(narrative_id,node_id)` → graph nodes | signal→narrative attribution |
| Forecasts (P67) | `forecasts(narrative_id, graph_node_id)` | forecast attribution |
| Source geo (P70.3) | `source_candidates(source_id, latitude, longitude)` | signal geo (inherited from source) |
| Transparency (P68) | `lib/transparency/*` + `/transparency` | public lineage surface (linked, not duplicated) |

**Key fact:** `graph_nodes (node_type='SIGNAL', entity_id = hsin_signals.id)` is the
join from a signal into the graph. All relationships and attribution route
through real foreign keys — no inference, no embeddings, no semantic guessing.

## 2. Existing systems reused

`lib/evidence-graph/*` (node/edge model + relationship catalog),
`lib/narrative-intelligence/*` (members), `lib/forecasts/*`, `lib/signals/*`,
`lib/supabase/server` (`createClient`, `getUser`, `getSessionRole`),
`lib/security/rbac-audit` (`hasRole`, `PROTECTED_ROUTES`), `packages/ui` nav. No
new tables; the DAL bulk-reads existing tables and computes in memory.

## 3. New files

- Pure: `lib/signal-network/{types,health,influence,relationships}.ts`
- Server DAL: `lib/signal-network/data.ts`
- UI: `components/signal-network/{panels,detail}.tsx`
- Routes: `app/dashboard/signal-network/page.tsx`, `app/dashboard/signal-network/[id]/page.tsx`
- Tests: `lib/signal-network/signal-network.test.ts`
- Docs: this file

## 4. New routes

`/dashboard/signal-network` (D6 list+metrics) and
`/dashboard/signal-network/[id]` (D7 detail). Both reviewer+, gated by
`PROTECTED_ROUTES` (longest-prefix covers the child), visible in nav to
reviewer/curator (+admin). No graph visualization (list + metrics only).

## 5. New metrics (D2 — real counts only)

Per signal: `evidenceCount`, `reportCount`, `narrativeCount`, `forecastCount`,
`relationshipCount` (+ per-type `SUPPORTS/CONTRADICTS/REFERENCES/DERIVED_FROM/
RELATED_TO`), `distinctConnectedNodes`. Composed (plain sums, **no weights, no AI
scoring**) into: **reach** (distinct connected nodes), **activity** (recent edge/
membership count), **supporting evidence** (SUPPORTS), **downstream usage**
(reports + forecasts + narratives). `influenceRank = downstreamUsage + reach +
evidenceCount`. Empty → "not yet observed".

## 6. Relationship rules (D3)

Relationships are **only read**, never created or inferred. `tallyRelationships`
counts an edge ONLY when its other endpoint resolves to a real `graph_nodes` row;
edges to a missing record are **dropped** (counted as `dropped`, never surfaced).
Unknown relationship types are ignored. Every relationship shown on the detail
page points to a real record (with its node type and direction).

## 7. Health rules (D1 — deterministic)

`computeSignalHealth` → `ACTIVE · DORMANT · ESCALATING · RESOLVED · CONTRADICTED
· ARCHIVED · UNKNOWN`. Order:

1. no graph node and no relationships → **UNKNOWN** (insufficient).
2. ≥1 incoming `CONTRADICTS` edge → **CONTRADICTED**.
3. ≥1 `PUBLISHED_AS` edge → **RESOLVED** (resolution recorded).
4. status archived/rejected or `CORRECTED_BY` edge → **ARCHIVED**.
5. node exists but zero relationships → **UNKNOWN**.
6. recent activity > prior → **ESCALATING**; recent activity > 0 → **ACTIVE**;
   history but none in 30d → **DORMANT**.

Never fabricates a status; insufficient data always returns UNKNOWN.

## 8. Narrative attribution rules (D4)

`signal → narrative` = `narrative_members` whose node is the signal's `SIGNAL`
node. A signal can belong to multiple narratives. Per narrative we count
`signalCount` (distinct SIGNAL members), `evidenceCount` (EVIDENCE/CLAIM members),
`forecastCount` (`forecasts.narrative_id`). Only existing memberships — no
clustering, embeddings, or semantic guessing.

## 9. Forecast attribution rules (D5)

For each forecast we resolve its narrative (`forecasts.narrative_id`) → that
narrative's signals/evidence, plus any direct `graph_node_id` link. The dashboard
answers **"why does this forecast exist?"** — narrative + signal count + evidence
count, each clickable to the narrative / signal / forecast surfaces. A signal's
detail lists every forecast attributed via its narratives.

## 10. Readiness impact on Phase 71 (D8)

`getSignalReadiness` returns real counts: signals with source lineage / narrative
/ forecast / relationship / geo attribution, and missing geo / missing narrative
/ missing evidence. **Signals have no geo columns** — geo is inherited from the
source (approved candidate coordinates). So most signals are `missing geo` until
sources are geocoded — the primary signal-layer gap for the map. The signal
network gives the map a real edge set (one node per signal, real typed edges to
narratives/evidence/forecasts) rather than an inferred one.

## 11. Risks & limitations

- **Geo** is source-inherited; signals without a geocoded source read as missing
  geo (honest, not fabricated).
- **Attribution depends on the graph being built** — if `graph_nodes`/`graph_edges`
  are sparse, many signals are `UNKNOWN`/low-influence. That reflects reality, not
  a defect; building the graph (existing Phase 64 builder) populates this layer.
- **Forecast→signal** is via the narrative link; forecasts with no narrative show
  0 attributed signals (correct).
- Health/influence are deterministic counts + thresholds, not ground truth; the
  detail view exposes the underlying records so reviewers can verify.

## 12. Verification results

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Signal-network unit tests | ✅ 15/15 |
| Nav-roles invariant (route added) | ✅ pass |
| Full suite (tracked + untracked) | ✅ (see completion report) |
| `next build` (clean `.next`) | ✅ both routes present |
| Migration audit (count unchanged 0001→0058) | ✅ |
| RBAC audit (`/dashboard/signal-network` reviewer+) | ✅ added to PROTECTED_ROUTES |
| Route audit (child inherits prefix gate) | ✅ |
| Relationship audit (edges to missing records dropped) | ✅ tested |
| Forecast attribution audit (via narrative link only) | ✅ |

Left **uncommitted** per your standing preference.
