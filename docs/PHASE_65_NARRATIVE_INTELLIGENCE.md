# Phase 65 — Narrative Intelligence Engine

**Status:** Complete (uncommitted)
**Routes:** `/dashboard/narratives` + `/dashboard/narratives/[id]` (reviewer+; admins seed/recompute)
**Migration:** `0052_narrative_intelligence.sql` (additive)

A narrative is an **observable information structure** — a recurring cluster of
claims, evidence, sources, actors, and events that reinforce or challenge a
storyline. Phase 65 detects, clusters, tracks, and analyzes narratives. **No
moderation, no censorship, no truth scoring, no AI-generated narratives** — a
human seeds a narrative with a graph node and the engine expands membership
**deterministically over Phase 64's provenance-backed edges**. Every narrative is
evidence-backed and explainable. No existing workflow was changed.

---

## Architecture

```
lib/narrative-intelligence/
  types.ts       PURE — status/alert vocabulary, data shapes
  clustering.ts  PURE — deterministic membership expansion (BFS over the graph) + composition
  health.ts      PURE — explainable health, status, alert detection, timeline
  persistence.ts DAL  — narratives + members/claims/sources/events/metrics/snapshots/alerts
  engine.ts      createNarrative / recomputeNarrative (cluster → score → snapshot → notify)
  service.ts     RBAC-enforcing API (reviewer+ reads, admin mutations)
  data.ts        getNarrativeDashboard() — counts + executive lists + alert feed
  actions.ts     create / recompute / update (admin, audited)

app/dashboard/narratives/page.tsx + [id]/page.tsx     reviewer+ dashboard + detail
components/narratives/                                  panels (server) + controls (client)
supabase/migrations/0052_narrative_intelligence.sql    8 tables (RLS reviewer+ read / admin manage)
```

**Fully consumes Phases 61–64:** clustering walks the **Phase 64** evidence graph
(`getSubgraphDal`); health consumes **Phase 63** source-monitoring state (failing
member sources lower stability); alerts are delivered through the **Phase 62**
notification framework; source members trace back to **Phase 61** reliability.

---

## Narrative model

`narratives`: `id`, `name`, `slug`, `summary`, `status`, `seed_node_id` (the graph
node the cluster grew from), `graph_node_id` (the narrative's own NARRATIVE node in
the Phase 64 graph), audit fields.

**Status** (deterministic, from snapshot deltas + stability):
`emerging · active · dominant · fragmenting · declining · archived`.

Satellite tables: `narrative_members` (each with an explainable `reason` + `depth`),
`narrative_claims` (stance: supporting/contradicting/neutral), `narrative_sources`,
`narrative_events` (timeline log), `narrative_metrics` (latest health),
`narrative_snapshots` (timeline series), `narrative_alerts`.

---

## Clustering model (deterministic, no LLM)

`clusterFromSubgraph(seed, nodes, edges, maxDepth, maxMembers)` runs a **bounded
BFS** from the seed over the evidence graph. The edge used to first reach a node
becomes that member's **reason** (relationship + provenance); `SUPPORTS`/
`CONTRADICTS` edges set the member's **stance**. Membership is therefore expanded
only along real, provenance-backed edges — shared claims/actors/events/sources/
investigations/evidence surface as graph adjacency. **No semantic guessing, no
fabricated relationships.** Depth and member count are capped (default depth 2,
150 members) so clustering never blows up.

---

## Health model (explainable, no black box)

`computeNarrativeHealth(composition, failingSources)` returns:

| Metric | Formula |
|---|---|
| coverage | node-type categories present / 8 |
| sourceDiversity | `distinctSources/(distinctSources+5)` (saturating) |
| evidenceDensity | evidence / members |
| claimDensity | (supporting+contradicting) / members |
| actorDiversity | `distinctActors/(distinctActors+3)` |
| contradictionRatio | contradicting / (supporting+contradicting) |
| **stabilityScore** | `coverage×25 + sourceDiv×20 + evidence×15 + actorDiv×10 + (1−contradiction)×20 + size×10 − min(20, failingSources×5)` → 0–100 |

The exact weighting + the failing-source penalty are returned in `explanation` +
`factors` — no opaque score. Failing member sources (Phase 63) reduce stability.

---

## Timeline model

`buildTimeline(snapshots)` orders snapshots ascending and derives **first
appearance, peak (max members), latest activity**, and a **phase** (emerging /
growing / peak / declining / stable / insufficient) from the last delta. Each
point carries signal / evidence / source volume over time — real series, never a
fabricated trend line (`insufficient` until ≥2 snapshots).

---

## Alert model (Phase 62 integration)

`detectNarrativeAlerts(prev, cur, prevStatus, status)` (edge-triggered, computed
severities):

| Alert | Fires when |
|---|---|
| `NARRATIVE_EMERGING` | first snapshot (new narrative) |
| `NARRATIVE_GROWING` | rel. member growth ≥ 50% (WARNING if ≥100%) |
| `NARRATIVE_DECLINING` | rel. growth ≤ −30% |
| `NARRATIVE_DOMINANT` | status crosses to dominant (≥25 members + stability ≥70) |
| `NARRATIVE_FRAGMENTING` | contradiction ≥ 60% or source count halves (coverage collapse) |

Alerts persist to `narrative_alerts` and are delivered to **admins** via the
Phase 62 DAL (`SYSTEM_ALERT`, honoring recipient preferences); the notification id
is linked back to the alert.

---

## Evidence Graph integration

- Each narrative gets a `NARRATIVE` node in the Phase 64 graph (`graph_node_id`),
  populating a node type Phase 64 reserved.
- Membership is computed from the graph; `getNarrativeRelationships` derives
  narrative↔narrative relationships (overlaps / shares-sources / shares-actors)
  from **shared members** — no fabricated narrative edges.

---

## RBAC & security

Reviewer+ read (`is_reviewer_or_above`), admin manage (`is_admin`) — enforced by
RLS on all 8 tables, the middleware route gate (`/dashboard/narratives` reviewer),
nav-roles visibility, and page self-gates. Writes prefer the service-role client
(admin alert fan-out). No public/anonymous access; no truth scoring or moderation.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Narrative + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2730 / 2730** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; `/dashboard/narratives` + `/[id]` → `ƒ` |
| Migration idempotency | ✅ re-runnable (DO-block RLS loop + if-not-exists) |
| No regressions / no fabricated narratives / no AI inference | ✅ human-seeded, graph-derived, explainable |

> Migrations `0048`–`0052` must be applied to Supabase, and the Phase 64 graph
> must be built, before narratives can be seeded. Everything degrades to empty
> until then.

---

## Phase 66 readiness (Agent Automation)

- `createNarrative` / `recomputeNarrative` are clean, idempotent engine entry
  points an agent loop can call as tools — same shape as the Phase 63 monitoring
  run and Phase 64 graph rebuild.
- Narrative alerts already flow through Phase 62; an agent can subscribe to
  `NARRATIVE_EMERGING` / `_GROWING` / `_FRAGMENTING` and trigger deeper analysis.
- `ACTOR` / `EVENT` / `ORGANIZATION` member dimensions are modeled now (executive
  actor/organization-network lists are wired, empty until those graph nodes exist)
  — Phase 66 can populate them and the narrative engine will pick them up with no
  schema change.
- Deterministic, explainable, evidence-backed outputs make narratives safe inputs
  for autonomous agents (Phase 66) and forecast validation (Phase 67).

---

## Known limitations

- **Narratives are human-seeded** (by design — no auto-invented narratives). The
  machine only expands + scores membership deterministically.
- **ACTOR/EVENT/ORGANIZATION** members appear once those Phase 64 node types are
  populated (not auto-built yet); the lists/metrics are ready and compute to 0
  until then (honest, not fabricated).
- **Recompute is on-demand/admin** (cron-ready); snapshots (and thus timeline +
  growth alerts) accrue across recomputes.
- Narrative↔narrative relationships are membership-overlap based (deterministic);
  semantic relationships are out of scope (no LLM).
