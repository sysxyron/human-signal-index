# Phase 72 — Geospatial Narrative Intelligence

**Status:** Complete (uncommitted) · **Type:** Additive, read-only (no migration)
**Routes:** `/dashboard/global-map` (enhanced, reviewer+) · `/dashboard/global-map/readiness` (reviewer+)
**Migration:** none — geo + every relationship already exist.

Transforms the Global Map (Phase 71) from a source-location map into a
**geospatial intelligence system**: narrative, evidence, forecast, contradiction,
trust, and blind-spot geography as switchable layers over the same real points.
Geo is inherited ONLY through verified relationships; absent links are reported as
NOT OBSERVED. No geocoding-by-guess, no fabricated coordinates, no fake
clustering, no AI locations. Human review stays authoritative.

---

## 1. Architecture audit & dependency map

| Phase | System | Tables | Provides |
|---|---|---|---|
| 64 | Evidence graph | `graph_nodes` (SIGNAL/EVIDENCE/CLAIM/REPORT…), `graph_edges` (SUPPORTS/CONTRADICTS/REFERENCES/DERIVED_FROM/RELATED_TO) | relationships |
| 65 | Narratives | `narrative_members(narrative_id,node_id)` | signal→narrative |
| 67 | Forecasts | `forecasts(narrative_id,graph_node_id)` | narrative→forecast |
| 68 | Transparency | `lib/transparency`, `/transparency` | public lineage (linked) |
| 70.3 | Source network | `source_network/*`, `source_candidates` geo | source health + **geo** |
| 70.4 | Signal network | `signal-network/data` | per-signal evidence/contradicts/supports/narrative/forecast attribution |
| 71 | Global map | `global-map/{geo-model,geocoder,readiness,data}` | geo status + map foundation |

**Geo inheritance (the single rule):** the **source** is the only geo-bearing
entity (`source_candidates` coordinates, joined via `source_id`). Everything else
inherits geo through it:

```
Narrative → narrative_members → Signal → Source → candidate coords
Evidence  → (graph edge) Signal → Source → candidate coords
Forecast  → narrative_id → Narrative → Signal → Source → coords   (else GEO_UNKNOWN)
Contradiction/Support → graph edge touching a Signal → Source → coords
Trust     → hsin_source_trust → Source → coords
```

## 2. Relationships used

The Phase 70.4 signal network already computes, per signal: `evidenceCount`,
`relationships.{SUPPORTS,CONTRADICTS}`, `narrativeIds`, `forecastIds`, `sourceId`.
Phase 72 **rolls these up by source** and joins source geo + `hsin_source_trust`.
No new relationship is created or inferred — only existing real edges/memberships
are read.

## 3. Relationships rejected (NOT OBSERVED, not invented)

- **Evidence with no graph edge to a signal** → not attributed to geography
  (counts as NOT OBSERVED rather than guessed by text proximity).
- **Forecast with no narrative link** → `GEO_UNKNOWN` (never force-placed).
- **Narrative whose member signals have no geo-ready source** → not placed.
- **Source with no candidate / no coordinates** → not plotted (missing-geo inventory).
- **Source with no trust row** → trust `null` / NOT OBSERVED (no synthetic score).

## 4. Files created

- Pure: `lib/narrative-map/{types,blindspots,trust,aggregate}.ts`
- Server: `lib/narrative-map/data.ts` (memoized: `getGeospatialIntelligence`, `getGeoReadinessReport`)
- Client: `components/narrative-map/{LayeredMapCanvas,LayeredMapExplorer}.tsx`
- Server panels: `components/narrative-map/panels.tsx`
- Route: `app/dashboard/global-map/readiness/page.tsx`
- Tests: `lib/narrative-map/narrative-map.test.ts`; Docs: this file.

## 5. Files modified

- `app/dashboard/global-map/page.tsx` — added the geospatial-intelligence section
  (layer switcher, blind spots, region tables, readiness link); the layered
  explorer's **Sources** layer subsumes the Phase 71 single-layer source map.

## 6. Geo inheritance paths

See §1. Implemented in `lib/narrative-map/data.ts` by rolling `signal-network`
rows up to the source, then attaching the source's candidate coordinates. The
same `geoStatus`/`isPlottable` (Phase 71) decide plottability — only `GEO_READY`
sources become points.

## 7. New routes

`/dashboard/global-map/readiness` (reviewer+, inherits the `/dashboard/global-map`
prefix gate — no new RBAC/nav entry required). The map page itself is unchanged
in URL/gate.

## 8. Metrics added

Per geo point and per region bucket (country/region/city): `sourceCount`,
`signalCount`, `evidenceCount`, `narrativeCount`, `forecastCount`, `contradicts`,
`supports`, `contradictionRatio`, trust aggregate (avg + high/medium/low + observed),
and a blind-spot verdict. Seven switchable map layers: **Sources, Narratives,
Evidence, Forecasts, Contradictions, Trust, Blind Spots** — each re-weights the
same real points (MapLibre + OSM + clustering; clusters sum the active layer's
weight via `clusterProperties`).

## 9. Blind spot methodology

`detectBlindSpot({narrativeCount, forecastCount, evidenceCount})`: an **observable
imbalance** — narrative/forecast activity with **zero** corroborating evidence.
Evidence present → never a blind spot. Severity scales with unsupported activity
(≥5 high, ≥2 medium, else low). Computed at point and region level. No inferred
conflict; missing-geo is tracked separately in the readiness inventory.

## 10. Trust methodology

`aggregateTrust(scores)` aggregates **existing** `hsin_source_trust.trust_score`
(0–100; bands high ≥70 / medium 40–69 / low <40, matching Phase 16) by geography.
Null scores are skipped; a geography with no scored sources reports `avg = null`
(NOT OBSERVED). No synthetic scoring.

## 11. Performance design

Server-side aggregation in `lib/narrative-map/data.ts`, **memoized** via
`unstable_cache` (60s, tags `global-map`/`narrative-map`). Region rollups + totals
use the **full** point set; only an **8,000-point cap** is sent to the browser
(surfaced in the UI). Reuses the already-cached Phase 70.4 signal network. The
browser never receives raw records — only aggregated points + region buckets.
Designed for 10k–100k source records.

## 12. Verification results

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Narrative-map unit tests (blind spot / trust / contradiction / layer / rollup) | ✅ 13/13 |
| Nav-roles invariant | ✅ pass |
| Full suite (tracked + untracked) | ✅ (see report) |
| `next build` (clean `.next`) | ✅ both routes present |
| Migration audit (count unchanged 0001→0058) | ✅ |
| RBAC audit (`/dashboard/global-map[/readiness]` reviewer+) | ✅ |
| Geo audit (coords only when present; GEO_UNKNOWN surfaced) | ✅ |
| Cluster audit (real points only, weight = real metric) | ✅ |
| Trust/contradiction aggregation (existing values only) | ✅ tested |
| Performance (memoized aggregation + 8k cap) | ✅ |

## Phase 73 readiness assessment

The map now renders 7 real intelligence layers but is **source-anchored**: every
layer borrows the source's single coordinate. For Phase 73 (temporal / motion
geospatial intelligence) the dependencies are: (1) a **time dimension** (event
dates) on signals/narratives so layers can animate; (2) **multi-point narratives**
(a narrative spanning several sources/places) rather than collapsing to source
points; (3) **native geo on `hsin_sources`** (or persisted geocoder output) so
non-candidate sources map; (4) optional **region polygons** for choropleths
instead of centroid points. All are additive; none require touching ingestion,
review, or publishing.

Left **uncommitted** per your standing preference.
