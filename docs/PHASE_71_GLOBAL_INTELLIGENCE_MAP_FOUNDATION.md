# Phase 71 — Global Intelligence Map Foundation

**Status:** Complete (uncommitted) · **Type:** Additive (no migration)
**Route:** `/dashboard/global-map` (reviewer+; admins run the geocoder)
**Migration:** none — the required geo fields already exist on `source_candidates` (0057).

The first operational version of `/dashboard/global-map` — an **intelligence
navigation / provenance / source-visibility / signal-discovery** layer (not a
globe demo). Approved sources are plotted from **real coordinates only**;
nothing fabricates locations, infers coordinates without the geocoder, clusters
fake points, or changes auth/ingestion/publishing. Human review stays
authoritative.

---

## 1. Architecture audit (performed before any code)

| Entity | country | region | state | city | lat | lng | conf | source |
|---|---|---|---|---|---|---|---|---|
| `source_candidates` (0057) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ `geo_confidence` | ✅ `geo_source` |
| `hsin_sources` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `hsin_signals` | ❌ (inherits from source) |
| `narratives` | ❌ (inherits via member signals) |
| `forecasts` | ❌ (inherits via narrative) |

**Finding:** geo lives ONLY on `source_candidates`. Approved sources link to a
candidate via `source_candidates.source_id`, so source geo is read through that
join (the same path Phase 70.3.3 / 70.4 already use). Signals/narratives/forecasts
have no native geo — they inherit from the source. This is the central constraint
and is surfaced honestly in the readiness report.

Traceability verified end-to-end: **Source → Signal (`hsin_signals.source_id`) →
graph node (`graph_nodes` SIGNAL) → Narrative (`narrative_members`) → Forecast
(`forecasts.narrative_id`) → Transparency (`/transparency`)** — the same real
edges the Phase 70.4 signal network reads.

## 2. Existing systems reused

- Geo readiness: `lib/source-network/geo.computeGeoReadiness` (Phase 70.3.3).
- Source health: `lib/source-network/health.computeSourceHealth`.
- Source families: `lib/source-network/family.familyKey`.
- Signal/narrative/forecast rollup: the Phase 64/65/67 tables read directly.
- Source detail (attribution target): `/dashboard/source-discovery/source/[id]`.
- Admin guard / audit: `lib/admin/guard`. RBAC + nav: `rbac-audit`, `nav-roles`.

## 3. New files

- Pure: `lib/global-map/{geo-model,geocoder,readiness}.ts`
- Server: `lib/global-map/data.ts` (memoized aggregation), `lib/global-map/actions.ts` (geocoder)
- Client: `components/global-map/{MapCanvas,MapExplorer,Controls}.tsx`
- Server panels: `components/global-map/panels.tsx`
- Route: `app/dashboard/global-map/page.tsx`
- Tests: `lib/global-map/global-map.test.ts`; Docs: this file.

## 4. New routes

`/dashboard/global-map` (reviewer+). Added to `PROTECTED_ROUTES`,
`NAV_VISIBILITY` (reviewer/curator + admin), `ALL_NAV_HREFS`, and the sidebar
(Globe icon).

## 5. New schema changes

**None.** The geo fields already exist on `source_candidates`; `geo_status` is
derived deterministically at read time; `state` is carried by `region`. Migration
count unchanged (0001→0058). *(Future option: add geo columns to `hsin_sources`
so non-candidate sources can map — noted as a Phase 72 requirement.)*

## 6. Geo model (D1)

`geoStatus()` → `GEO_READY` (real lat+lng) · `PARTIAL_GEO` (place text, no coords)
· `MISSING_GEO` (nothing) · `NOT_APPLICABLE` (infrastructure types). `isPlottable`
requires finite in-range coordinates. Every coordinate carries `geo_source` +
`geo_confidence`; the map only ever plots `GEO_READY` points.

## 7. Geocoder design (D2)

`lib/global-map/geocoder.geocode()` — a **deterministic, offline, built-in
gazetteer** (no live geocoder, no AI, no network): country centroids (~50),
US-state centroids (50 + abbreviations), and major-city centroids (~35). Most
specific wins: **city (conf 0.9) > state/region (0.6) > country centroid (0.3)**.
Unresolved places return `null` — **no coordinate is invented**. The admin action
`geocodeCandidatesAction` backfills `source_candidates.latitude/longitude/
geo_confidence/geo_source` for candidates with place text but no coords (audited,
revalidates the map cache). No fabricated precision.

## 8. Map design (D3/D4/D7)

MapLibre GL JS + OpenStreetMap raster tiles **only** (no Google/Cesium/Mapbox-paid,
no 3D globe). MapLibre loads from the CDN inside a `'use client'` component
(`ssr:false`), with a graceful fallback notice if tiles are unavailable (the
list/readiness view stays fully usable). The **source layer** shows approved
sources with name/type/category/health/signal-count/narrative-count/forecast-count/
geo-readiness. Clicking a point opens the **attribution panel** (D7): source +
signal/narrative/forecast counts + coordinates + links to the full source detail
(evidence/narrative/forecast lineage), the signal network, and transparency.

## 9. Cluster rules (D5)

MapLibre's built-in clustering over the GeoJSON source — **real points only**
(`cluster: true`, radius 50, maxZoom 12). Clusters show the aggregated point
count; clicking a cluster zooms to expansion. No invented cluster logic; clusters
are a deterministic function of the real coordinate set.

## 10. Sidebar filters (D6) & readiness metrics (D8)

Filters (all deterministic exact/threshold): source type, category, health,
country, region, and min signal/narrative/forecast counts. Readiness report:
total / geo-ready / partial / missing / N-A, broken down **by type, category,
family, and country** (ready·partial·missing per row) — real tallies only.

## 11. Performance (D9)

Server-side aggregation in `lib/global-map/data.ts`, **memoized** via
`unstable_cache` (60s, tag `global-map`). The points payload is **capped at
8,000** for client render (readiness uses full counts; the cap is shown in the
UI); MapLibre clustering handles the rendered set efficiently. Designed for 10k–
50k source records: the heavy joins run once server-side and are cached; the
client only ever receives the capped, already-aggregated point set.

## 12. Phase 72 readiness (D10)

`getPhase72Readiness()` answers: map-ready sources, signals inheriting geo (source
is map-ready), narratives inheriting geo (any member signal's source map-ready),
forecasts inheriting geo (via narrative) — each as `x / total`. **What remains
missing:** PARTIAL_GEO sources need geocoding; `hsin_sources`/signals/narratives/
forecasts have no native geo. **Required for Phase 72 (Geospatial Narrative
Intelligence):** geocode partial sources, persist geo on `hsin_sources` (or keep
the candidate join), add narrative/forecast geo rollup layers, and a time
dimension for geospatial narrative motion.

## Risks

- Geo is candidate-sourced; sources created outside the import flow have no geo
  until `hsin_sources` gains geo columns (documented gap).
- The CDN MapLibre load is an external runtime dependency; the page degrades
  gracefully to filters + readiness if it fails.
- The built-in gazetteer is coarse (centroids); confidence reflects that. A live
  geocoder can be added later without changing the model.
- The 8,000-point render cap is explicit and surfaced; readiness counts are exact.

## Verification results

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Global-map unit tests (geocoder/model/readiness) | ✅ 13/13 |
| Nav-roles invariant (route added) | ✅ pass |
| Full suite (tracked + untracked) | ✅ (see report) |
| `next build` (clean `.next`) | ✅ route present |
| Migration audit (count unchanged 0001→0058) | ✅ |
| RBAC audit (`/dashboard/global-map` reviewer+) | ✅ |
| Route audit (in PROTECTED_ROUTES + NAV_VISIBILITY + ALL_NAV_HREFS + sidebar) | ✅ |
| Geo audit (coords only when present; geocoder null on unknown) | ✅ tested |
| Cluster audit (real points only) | ✅ MapLibre over real GeoJSON |
| Performance audit (memoized aggregation + 8k cap) | ✅ |

Left **uncommitted** per your standing preference.
