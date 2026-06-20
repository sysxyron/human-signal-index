# Phase 70.3.3 — Source Network Intelligence Upgrade

**Status:** Complete (uncommitted) · **Type:** Additive (no migration; reads existing tables)
**Routes:** `/dashboard/source-discovery` (network section, reviewer+) ·
`/dashboard/source-discovery/source/[id]` (per-source detail, reviewer+)
**Migration:** none — all metrics are computed from existing tables.

Upgrades the Source Registry / Source Discovery surface from an onboarding list
into an **intelligence collection network**: which sources are healthy,
collectable, productive, influential, geo-ready, and how they cluster into
organizations. Everything is computed from **real data only**. Nothing
auto-activates, auto-publishes, crawls, or fabricates a metric or coordinate.
Human review remains required.

---

## Real tables consumed (no new schema)

| Concern | Table(s) |
|---|---|
| Registry | `hsin_sources` (status, monitoring_enabled, urls, type, risk_level) |
| Health | `source_monitoring_state` (state, last_success/failure), `source_capture_events` (status, captured_at) |
| Trust | `hsin_source_trust` (trust_score, band) |
| Yield | `hsin_signals` (source_id), `hsin_evidence_claims` (source_ref), `public_reports` (signal_id) |
| Geo / category / identity | `source_candidates` (geo cols + classification_category + identity_key, joined by source_id) |
| Relevance | `hsin_watchlists` (terms), `narratives` (name) |

Pure modules live in `lib/source-network/` (`health`, `capability`, `yield`,
`geo`, `family`, `priority`, `advice`, `types`); the server DAL `data.ts` loads
rows and feeds the pure classifiers. The DAL never throws (degrades to empty).

---

## 1. Source health model

`computeSourceHealth()` → `healthy · degraded · offline · paused · archived ·
blocked · unknown`. Order of decision:

1. lifecycle: `status=archived/disabled` → **archived**; `status=paused` or
   `monitoring_enabled=false` → **paused**.
2. access: monitoring `BLOCKED` → **blocked**; `UNREACHABLE` → **offline**.
3. live signals: latest failing event / failure newer than success → **offline**
   (no recent success, >14d or never) or **degraded** (failure after a recent
   success); stale success (>14d) or monitoring `STALE` → **degraded**;
   monitoring `HEALTHY`/`RECOVERED` or recent success → **healthy**.
4. nothing observed → **unknown** (never a fabricated "healthy").

**Examples:** active source, last success 3d ago → `healthy`. Last success 40d
ago → `degraded`. Latest event `failing`, no success on record → `offline`.
Monitoring `BLOCKED` → `blocked`. No events, no monitoring → `unknown`.

## 2. Collection capability score

`computeCollectionCapability()` → tier (`high·medium·low·manual·degraded`) + a
0–100 score + reason. Blocked/login/CAPTCHA/paywall → **degraded** (20).
Feed/API types **with** a feed/endpoint → **high** (95); without → **low** (30).
`watchlist/manual/document/archive/email` → **manual** (35). Website/social with
a feed → **high** (85); with only a URL → **medium** (60); with neither →
**low** (10). No fabricated scores — they're a function of type + present fields.

## 3. Signal yield metrics

Per source: `signals` (count from `hsin_signals.source_id`), `evidence`
(`hsin_evidence_claims.source_ref` whose domain matches the source domain),
`reports` (`public_reports` via `signal_id → source_id`), `lastSignalAt`, and a
30d-vs-30–60d **trend** (`rising·steady·declining·none`). If nothing was
observed, the summary reports **0 / "not yet observed"**.

**Limitation (honest):** narratives and forecasts key off the evidence-graph
(`graph_nodes`), not `source_id`, so there is no reliable per-source attribution
path today. Those counts are reported as **0 / not-yet-observed** rather than
guessed. Wiring source→narrative→forecast attribution is future work.

## 4. Geo readiness

`computeGeoReadiness()` → `geo_ready` (latitude+longitude present) ·
`partial_geo` (country/region/city or geo_source but no coords) · `missing_geo` ·
`not_applicable` (pure-infrastructure types: `api_foundation`, `webhook`,
`intelligence_feed`). Coordinates are only ever counted when actually present —
never invented. Geo lives on `source_candidates`; active sources inherit it via
the candidate join (most active sources are `missing_geo` today — a real gap).

## 5. Source relationship grouping (families)

`groupSourceFamilies()` clusters assets under a parent identity by deterministic
`familyKey` precedence: explicit `organization`/`org:` tag → registrable domain
root (non-platform) → platform-identity org (`youtube:@reuters` → `reuters`) →
name slug. Each member carries its **asset role** (Website / RSS / YouTube / API…).

**Example:** Reuters Website (`reuters.com`) + Reuters RSS (`reuters.com/feed`) +
Reuters YouTube (`youtube:@reuters`) → one `reuters` family of 3; CISA stays its
own family. **Grouping is presentation-only — no record is ever merged.**

## 6. Collection priority

`computeCollectionPriority()` → `critical·high·medium·low·archive` from a 0–100
score: baseline risk (×8), category (A=25…Foundation=8), high-value type
(threat/intel/gov/court/newswire/research +10), signal yield (+≤20), trust
(+≤10), watchlist/narrative relevance (+8 each), manual priority (±), with health
penalties (offline/blocked −15). Archived sources drop to `archive`. Thresholds:
≥70 critical, ≥50 high, ≥30 medium, else low. The reason lists the top drivers.

## 7. Source network dashboard

Added to `/dashboard/source-discovery`: totals (total/healthy/degraded/offline+
blocked/paused/families), health breakdown, capability breakdown, geo-readiness
breakdown, priority breakdown, **collection priority queue** (what to collect
first, with reasons), top-yield & low-yield, needs-attention & missing-feeds,
source families, and the **Phase 71 readiness report**.

## 8. Source detail view

`/dashboard/source-discovery/source/[id]`: health, collection capability,
duplicate/identity key, source family, yield metrics + trend + last signal,
geo readiness, linked signals/evidence/reports, and the **recommended next
action** (`recommendNextAction()` — advisory only).

## 9. Phase 71 readiness report

`getPhase71Readiness()` computes: geo-ready / partial / missing / N-A sources;
geo-ready / partial / missing candidates; geo-ready signals/narratives/forecasts
(currently 0 — those tables have no geo columns); highest-value map-ready
categories; and the **biggest gaps** (e.g. "hsin_sources has no geo columns —
geo lives only on candidates"; "signals/narratives/forecasts have no geo
columns; they can only inherit location from their source").

---

## Phase 71 readiness impact

The network view is exactly the input the Global Intelligence Map foundation
needs: it identifies how many sources are mappable now, which categories are most
map-ready, and the concrete schema gaps to close first (add geo columns to
`hsin_sources`, and a geocoding step for `partial_geo` place text). It also gives
the map a clean node model — one node per real source identity, grouped into
families — rather than one per URL variant.

## Risks & limitations

- **Narrative/forecast per-source attribution** is not yet wired (graph-node
  keyed) — reported as not-yet-observed, never fabricated.
- **Geo on active sources** depends on the originating candidate; sources added
  outside the candidate flow show `missing_geo` until geo columns exist on
  `hsin_sources`.
- **Monitoring linkage** (`source_monitoring_state.source_id` is free text) is
  matched by id then by name — best-effort.
- Health/capability/priority are deterministic heuristics over real fields, not
  ground truth; they explain their reasoning so reviewers can judge them.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Source-network unit tests | ✅ 28/28 |
| Full suite (tracked + untracked) | ✅ (see completion report) |
| `next build` (clean `.next`) | ✅ |
| Migration count unchanged (0001→0058) | ✅ |
| No auto-activation / publish / crawl / dark-web / workflow change | ✅ |

Left **uncommitted** per your standing preference.
