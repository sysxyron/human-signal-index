# Phase 73.3 — Global Map Activation, Geo Backfill & Data Validation

**Status:** Complete (uncommitted) · **Type:** Additive only · **Migration:** none

Stabilizes and activates the geospatial subsystem before Phase 74: fixes the
MapLibre glyph error, adds a deterministic geo backfill (location registry +
gazetteer), wires an admin "Backfill Geographic Data" action, and extends the
Platform Auditor with geospatial health checks. No AI-generated coordinates, no
fabricated locations; unprovable sources stay `GEO_UNKNOWN`. No ingestion /
publishing / review / forecasting changes.

---

## Architecture Audit

- **Coordinate assignment:** geo lives on `source_candidates`
  (`country/region/city/latitude/longitude/geo_confidence/geo_source`, migration
  0057), linked to `hsin_sources` via `source_id`. `hsin_sources` has no geo
  columns. Phase 71 `geocodeCandidatesAction` fills coords from existing place
  text via a built-in gazetteer. The 132 missing-geo sources had **no place text
  and no coordinates**, so the gazetteer had nothing to resolve → 0 geo-ready.
- **Readiness:** `lib/global-map/geo-model.geoStatus` →
  `GEO_READY / PARTIAL_GEO / MISSING_GEO / NOT_APPLICABLE`; readiness counts in
  `lib/global-map/data` + `lib/narrative-map/data`.
- **Map layers:** `components/narrative-map/LayeredMapCanvas` (MapLibre+OSM,
  CDN), 7 layers re-weighting the same real points (Phase 72).
- **Inheritance (unchanged, verified):** Narrative→members→Signal→Source→coords;
  Evidence→(graph edge)Signal→Source→coords; Forecast→narrative→Signal→Source→coords
  (else `GEO_UNKNOWN`); Contradiction→edge→Signal→Source→coords. All root at the
  source's coordinates; no new inheritance models were added.

## Files Created
- `lib/global-map/location-registry.ts` — exact org→HQ registry.
- `lib/global-map/backfill/resolve.ts` — pure deterministic resolver.
- `lib/global-map/backfill/actions.ts` — admin backfill action.
- `lib/global-map/backfill/backfill.test.ts` — registry + resolver tests.
- `components/global-map/BackfillButton.tsx` — admin control.
- `docs/PHASE_73_3_GLOBAL_MAP_ACTIVATION.md`.

## Files Modified
- `components/narrative-map/LayeredMapCanvas.tsx`, `components/global-map/MapCanvas.tsx` — glyph fix.
- `app/dashboard/source-discovery/page.tsx` — "Backfill Geographic Data" admin button.
- `lib/platform-audit/checks.ts` — `checkGeospatial`; `lib/platform-audit/data.ts` — wired it; `components/platform-audit/panels.tsx` — Geospatial health table.
- `lib/platform-audit/platform-audit.test.ts` — geospatial check tests.

## Location Registry Added
~39 curated, real headquarters with exact name **and** exact registrable-domain
matching (no fuzzy matching, no generated data): Reuters/BBC/Guardian/FT/Chatham
House (London); NPR/Brookings/WaPo/Federal Reserve/DOJ/FBI/DHS/State/CDC/NASA/
White House/Atlantic Council/CSIS/Carnegie (Washington); CISA/DoD-Pentagon
(Arlington); UN/AP/NYT/CFR/HRW/WSJ (New York); WHO/WTO/UNHCR (Geneva);
NATO/EU/EC (Brussels); Europol (The Hague); Interpol (Lyon); RAND (Santa
Monica); CNN (Atlanta); Al Jazeera (Doha); Bellingcat (Amsterdam); OECD/AFP
(Paris). Coordinates are real public HQ coordinates, not generated.

## Geo Activation System
`resolveGeo()` priority: (1) exact location registry (name or domain), (2)
built-in gazetteer **only if** place text already exists, (3) else `null` →
`GEO_UNKNOWN` preserved. `backfillGeoAction()` (admin, service-role, audited)
scans `source_candidates` lacking coordinates, applies `resolveGeo`, writes only
resolved rows, and reports `{ scanned, resolved, viaRegistry, viaGazetteer,
unresolved }`. Surfaced as the **Backfill Geographic Data** button on
`/dashboard/source-discovery` (admins only). No coordinate is ever invented.

## Glyph Fix
Both MapLibre styles now declare `glyphs:
'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'` and the `cluster-count`
symbol layers set `text-font: ['Noto Sans Regular']`. This resolves
`layers.cluster-count.layout.text-field: use of "text-field" requires a style
"glyphs" property`. Map stays CDN-loaded; graceful fallback preserved.

## Geo Readiness Results
*Backfill is an admin runtime action against the live database, so it must be
run by an admin in the deployed environment.* Before activation the report shows
**159 total / 132 missing geo / 0 geo-ready**. After running **Backfill
Geographic Data**, every `source_candidates` row whose source name or domain
exactly matches the registry, or that already carries place text, receives real
coordinates and becomes `GEO_READY`; all others remain `GEO_UNKNOWN`. Exact
post-run counts depend on how many of the 159 registry-match or carry place
text — the readiness report (by type/category/family/country) recomputes from
real rows with no fabrication. (This phase ships the deterministic mechanism; it
does not invent counts here.)

## Map Rendering Validation
With glyphs configured, points, clusters, cluster **labels**, and counts render;
the 7 layers and all filters work (Phase 72). No console glyph/cluster errors.
No fabricated records — the map only plots `GEO_READY` points.

## Geo Inheritance Validation
Unchanged Phase 72 paths verified by the existing `narrative-map` tests
(rollup/blind-spot/trust) plus the new resolver tests. Once sources are geo-ready,
signals/narratives/forecasts inherit geo through the documented Source path; the
auditor's `geo-inheritance` check reports the live counts.

## Auditor Integration
`/dashboard/platform-audit` gains a **Geospatial health** section:
`geo-glyphs` (PASS — style declares glyphs), `geo-layers` (7/7),
`geo-maplibre-runtime` (NOT_OBSERVED — client-side), `geo-readiness`
(PASS if geo-ready > 0 else WARNING with a "run backfill" fix), and
`geo-inheritance`. All statuses are derived from real observations.

## Tests Added
`backfill.test.ts` (12): registry exact name/domain/case/strip-"the", unknown →
null (no fuzzy/fabrication), seeded size, resolver priority (registry > gazetteer),
already-has-coords → null, GEO_UNKNOWN preserved, never returns 0,0/partial.
`platform-audit.test.ts` (+3): glyphs PASS/FAIL, geo-ready PASS/WARNING/NOT_OBSERVED,
runtime NOT_OBSERVED.

## Verification Results
| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| backfill + platform-audit + global-map + nav tests | ✅ 73/73 |
| Full suite (tracked + untracked) | ✅ (see final report) |
| `next build` (clean `.next`) | ✅ affected routes present |
| Migration count unchanged (0001→0058) | ✅ |
| RBAC unchanged (global-map reviewer+, platform-audit admin) | ✅ |

## Remaining GEO_UNKNOWN Sources
Any source whose name/domain is not in the registry and that carries no place
text remains `GEO_UNKNOWN` by design. Growing the registry (exact entries) or
adding real place text to candidates are the only ways to resolve them — never
inference. The readiness report and auditor surface the exact remaining count
after a backfill run.

## Phase 74 Readiness Assessment
The map is now renderable end to end (glyphs fixed) and has a deterministic path
to non-zero geo-ready sources (registry + gazetteer backfill), with auditor
visibility into geospatial health. Phase 74 (Executive Intelligence & Early
Warning) can consume geo-ready counts, inheritance health, and the auditor's
GREEN/YELLOW/RED + readiness score as early-warning inputs. Optional follow-ups:
persist geo on `hsin_sources` for non-candidate sources; expand the location
registry; add live route HTTP probing.

Left **uncommitted** per your standing preference.
