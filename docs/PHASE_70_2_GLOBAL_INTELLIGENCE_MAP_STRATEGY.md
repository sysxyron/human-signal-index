# Phase 70.2 — Global Intelligence Map / World Forge Strategy Audit

**Status:** Complete (audit-only; no features built) · **Type:** Strategy
**Code change:** one clarifying navigation comment only.

This phase answers one question with evidence: **should HSI build a geospatial
intelligence layer, and what should happen to World Forge?**

---

## 1. World Forge audit

**What exists now (evidence from the codebase):**
- **19 routes** under `/dashboard/worldforge/*`: overview, simulations, scenario
  sandbox, timelines, dependency-graph, counterfactuals, provenance, universe
  forge, and a research workspace (`research/[id]/{evidence,evidence-graph,
  consensus,agents,provenance}`, `research/new`, `from-signal`,
  `evidence-intelligence`).
- A full lib (`lib/worldforge/`: persistence, research-persistence,
  evidence-persistence, evidence-cache-store, confidence, worlds, mappers, views)
  and ~10 components (DependencyGraphFlow, ImpactChainCascade, TimelineTrack,
  ProvenancePanel, ParameterSlider, …).
- Migration `0005_worldforge.sql`: `worlds`, `simulations`, `simulation_versions`,
  `scenarios`, `counterfactuals`, `world_timelines`, `simulation_provenance`.

**What it actually is:** a **simulation / scenario / counterfactual research
engine** — hypothetical *world-modeling* ("Universe Forge", parameter sliders,
counterfactual diffs, impact-chain cascades). The `Globe2` icon + "World" name use
a *world-building* metaphor, **not** a geographic map.

**Functional?** Yes — it is a real, wired subsystem (researcher+; force-dynamic;
provenance-backed; integrated with the evidence layer).

**Overlap with existing HSI features?**
- vs **Evidence Graph (64):** partial visual overlap (both show connectivity) but
  distinct purpose — graph = real relationships; WorldForge dependency-graph =
  hypothetical simulation dependencies. Not redundant.
- vs a **geospatial map:** **none** — WorldForge has no coordinates, no map, no
  tiles. The platform has **zero** geospatial infrastructure (verified: no
  Cesium/mapbox/leaflet/maplibre/deck.gl installed; no lat/lng/geo columns in any
  of the 56 migrations; `globe.tsx` is a decorative SVG hero, not a map).

**Confusion risk?** Moderate — the name "World" + globe icon can read as "world
map." As HSI introduces a real geospatial layer, the two could be conflated.

**Decision: KEEP World Forge** (functional + distinct), **do not remove or merge.**
Optionally **RENAME later** (e.g. "Scenario Lab" / "Simulation Studio") to free the
"world/global map" mental namespace — flagged as a future UX decision, **not done
now**. The new geospatial layer is named distinctly (see §4) to avoid collision.

---

## 2. Market concept analysis

Adapt concepts into HSI's **evidence-first** model (never clone tools). Each point
on an HSI map must resolve: **Map Point → Signal → Evidence → Source → Narrative →
Forecast → Outcome → Transparency Record.**

| Concept | Verdict | Rationale (HSI fit) |
|---|---|---|
| Global base map (2D tiles) | **High value now** | the canvas; cheap via OSM/MapLibre |
| Geo-indexed **signals** | **High value now** | HSI's core unit; already has source/text to locate |
| Geo-indexed **sources** | **High value now** | source origin = trust + coverage map; reuses Phase 61 |
| Live **incident** layers | **High value now** | natural fit if incidents carry a real location + provenance |
| Geo-indexed **evidence** | **High value later** | powerful but needs evidence geotagging discipline |
| **Narrative spread** maps | **High value later** | Phase 65 + geo = "where is this narrative active" (differentiator) |
| **Forecast regions** | **High value later** | Phase 67 + regions = "where/when" accountability |
| Cyber threat geolocation (AbuseIPDB/Feodo-style) | **High value later** | strong, but **aggregate/region only** (abuse + accuracy risk) |
| Day-night / earthquakes / cables / weather overlays | **Low value** | context candy; not evidence-bearing; add only if cheap/free |
| **Aviation** (ADS-B / OpenSky) layer | **Low value (now)** | API cost + maintenance; not core to HSI's thesis |
| **Maritime / naval** layer | **Low value (now)** | same — cost/licensing without clear HSI payoff |
| Google-Maps-style consumer tiling/Street View | **Remove / avoid** | licensing + cost + wrong positioning |
| 3D Cesium globe as the *primary* UI | **Remove / avoid (first)** | WebGL complexity, ion costs; 2D first, 3D only if validated |

---

## 3. HSI-native geospatial model (architecture — design only)

A single additive, provenance-required geo index over existing intelligence — **no
new intelligence, no fabricated locations.**

```
geo_points (proposed, additive)
  id, entity_type (SIGNAL|SOURCE|EVIDENCE|NARRATIVE|FORECAST|REPORT|INCIDENT|CYBER_INDICATOR),
  entity_id (FK-by-id to the real entity),
  lat, lng,
  precision (exact | city | region | country),      -- coarse-grain sensitive points
  provenance (REQUIRED — how the coordinate was obtained),
  geocode_method (source_field | structured_metadata | manual | gazetteer),
  confidence, organization_id, created_at
  RLS: published/aggregate public-safe; reviewer+ for internal
```

Principles:
- **Every point requires provenance** + a `geocode_method`. A coordinate guessed
  by a model is **not** allowed; only locations present in source data, structured
  metadata, or an explicit gazetteer match (method recorded) are placed.
- **Unlocated entities are simply not on the map** (no fabricated dots).
- **Layers = filters** over `geo_points` by `entity_type`, composed with the
  existing engines (Phase 61 source reliability, 64 graph, 65 narratives, 67
  forecasts, 68 transparency). Clicking a point opens the full HSI chain
  (signal→evidence→source→narrative→forecast→outcome→transparency).
- **Reads:** server-side bbox + cluster queries (no client-side full-dataset
  loads); cached like every other intelligence layer.
- **Privacy/abuse:** sensitive categories (cyber indicators, vulnerable
  populations) are stored/displayed at `region` precision only; no PII; cyber
  infra shown aggregated, never as actionable target coordinates.

This is the differentiator: **a map where every point is auditable evidence**, not
a feed of unverifiable dots.

---

## 4. Recommended naming

| Candidate | Assessment |
|---|---|
| World Forge | ❌ taken (simulation engine); causes the confusion this audit flags |
| **Global Intelligence Map** | ✅ **recommended** — clear, trusted, enterprise-legible, commercially strong |
| Global Signal Map | ⚠️ on-brand but undersells evidence/narrative/forecast (signals only) |
| Geospatial Intelligence | ⚠️ accurate but generic/technical; weak brand |
| World Intelligence Layer | ⚠️ vague |
| EarthOps | ⚠️ catchy but gimmicky; lowers trust positioning |
| Signal Globe | ⚠️ brandable but narrow + collides with the decorative globe |
| HSI Global View | ✅ good public/marketing alias |

**Recommendation:** product/section name **"Global Intelligence Map"**, route
`/dashboard/global-map` (and a public `/global-map` later), with **"HSI Global
View"** as the marketing tagline. Distinct from World Forge — no namespace clash.

---

## 5. Build / remove decision

| Subject | Decision | Why |
|---|---|---|
| **World Forge** | **KEEP** (rename optional, later) | functional, distinct (simulation, not map); removing destroys real capability |
| **Geospatial layer** | **EXPAND LATER → BUILD NEXT (Phase 71 foundation)** | high value + strong differentiator, but must be evidence-first and staged to avoid the empty-map trap |
| **3D Cesium / aviation / maritime / Google tiles** | **AVOID (now)** | cost, complexity, licensing, low HSI fit |

---

## 6. Value analysis

- **User value:** "where is this happening?" — the most intuitive entry point into
  the entire intelligence chain.
- **Analyst value:** spatial correlation of signals/sources/narratives/forecasts
  that tables can't show; coverage gaps become visible geographically.
- **Enterprise value:** a global situational-awareness board is the single most
  demoable, RFP-checkbox feature for gov/enterprise evaluation.
- **Marketplace value:** geo-scoped products ("Sahel narrative map", "regional
  forecast pack") + map previews increase product appeal and price.
- **Transparency value:** a public, provenance-backed map is the strongest possible
  "we don't fabricate" statement — every dot is auditable.
- **Investor/acquirer value:** a defensible, evidence-first geospatial intelligence
  layer is a category signal (competes conceptually with Palantir-class situational
  tools) and a clear moat vs. generic dashboards.

---

## 7. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| **Empty-map problem** | High | launch only with a dense, real layer (geo-tagged signals/sources); show honest "N located of M" + non-map fallback |
| **Fake-intelligence appearance** | High | every point links to evidence + provenance; unlocated items omitted; never geocode-by-guess |
| **WebGL / performance** | Medium | 2D MapLibre + clustering + server bbox queries; defer 3D |
| **Data licensing** | Medium | OSM/MapLibre (open); avoid Google/Cesium-ion paid tiers |
| **Geolocation privacy** | High | region-precision for sensitive categories; no PII; coarse-grain by policy |
| **Cyber-threat abuse** | High | aggregate/region only; never actionable target coordinates |
| **Aviation/maritime API cost** | Medium | exclude from foundation; revisit only with a paying use-case |
| **Overbuilding before beta feedback** | High | ship the foundation + one layer; gather feedback before 72/73 |

---

## 8. Recommended roadmap

| Phase | Builds |
|---|---|
| **70.2 Audit** (this) | strategy, naming, architecture, decision (no code) |
| **71 Global Intelligence Map — Foundation** | `geo_points` migration (additive, provenance-required); MapLibre 2D base map (OSM tiles); ONE real layer = geo-tagged **signals + sources** with server bbox/cluster reads; click-through to the existing HSI chain; honest "located vs unlocated" counts. Reviewer+ internal; published-only public later. **No 3D, no paid feeds, no fabricated points.** |
| **72 Geospatial Narrative Intelligence** | narrative spread + forecast-region + evidence layers (reuse Phase 65/67/64); time slider; coverage-gap heat. |
| **73 Global Intelligence Operations Center** | multi-layer ops board (OSIRIS-style toggleable layers), incident overlays, live monitoring tie-in (Phase 63), alerts on geo events; optional 3D + selective external feeds *only if validated by 71/72 feedback*. |

---

## 9. No-code verification

This phase added **only** a clarifying navigation comment (WorldForge ≠ map). No
new features, no migration, no workflow change. Verification confirms no
regression: typecheck clean · full suite **2764/2764 pass** · `next build` compiles.

---

## Final strategic recommendation

> **Should HSI build a geospatial intelligence layer? — YES.**

- **What it should be called:** **"Global Intelligence Map"** (route
  `/dashboard/global-map`; public tagline "HSI Global View"). Keep **World Forge**
  as the (distinct) simulation engine; consider renaming it later to remove
  residual "world map" confusion.
- **What Phase 71 should build first:** the **foundation only** — an additive,
  provenance-required `geo_points` index; a 2D MapLibre/OSM base map; and **one
  dense, real layer** (geo-tagged signals + sources) with server-side clustering
  and full click-through into the existing evidence→narrative→forecast→transparency
  chain. Every point auditable; unlocated items omitted.
- **What to avoid:** 3D Cesium as the first UI, paid aviation/maritime/Google
  feeds, fabricated or model-guessed coordinates, exposing actionable cyber/target
  locations, and overbuilding (layers 72/73) before beta feedback on the foundation.

The geospatial layer is HSI's highest-leverage next differentiator **because** of
the evidence-first model — but only if built staged, provenance-backed, and
honest about coverage. Build the foundation in Phase 71; let real usage decide 72/73.
