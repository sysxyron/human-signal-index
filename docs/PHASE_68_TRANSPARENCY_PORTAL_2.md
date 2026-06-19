# Phase 68 — Transparency Portal 2.0

**Status:** Complete (uncommitted)
**Routes:** `/transparency` + `/transparency/{forecasts,narratives,sources,corrections,methodology}` (public) · `/api/public/transparency` (public, rate-limited)
**Migration:** none — this is a **read-only transparency layer** over existing data.

A public-facing portal that lets any visitor understand where information came
from, how evidence was evaluated, which narratives emerged, which forecasts were
correct (and which failed), which sources are reliable, and how trust is earned —
**everything computed from real data, explainable and traceable, no black boxes,
no AI-generated trust scores, no hidden calculations.**

This phase modifies **no** ingestion / review / publication / evidence / narrative
/ forecast / monitoring / notification / agent workflow. It only reads.

---

## Architecture

```
lib/transparency/
  types.ts   PURE — public-safe payload shapes
  data.ts    SERVER — 5 cached services, reuse Phase 61/65/67, no N+1
               getTransparencyOverview · getForecastTransparency ·
               getNarrativeTransparency · getSourceTransparency · getCorrectionTransparency

app/(marketing)/transparency/page.tsx              Overview (Deliverable 1)
app/(marketing)/transparency/forecasts/page.tsx    Forecast accountability (D2)
app/(marketing)/transparency/narratives/page.tsx   Narrative evolution (D3)
app/(marketing)/transparency/sources/page.tsx      Source trust (D4)
app/(marketing)/transparency/corrections/page.tsx  Correction ledger (D5)
app/(marketing)/transparency/methodology/page.tsx  Trust methodology (D6, static)
app/api/public/transparency/route.ts               Public trust API (D7, rate-limited)
components/transparency/panels.tsx                 public-safe presentational
```

All services read via **`readPublicClient()`** (service-role → anon → null) and
select **only** aggregate / published / resolved fields. They REUSE the existing
intelligence layers — Phase 61 `getSourceReliability`, Phase 65 narrative DALs,
Phase 67 forecast DALs + `performanceMetrics` — with **no duplicate logic and no
new engines**. Cached with `unstable_cache` (300s), no N+1.

---

## Data lineage

Each public surface traces back to a recorded source of truth:

| Surface | Source of truth (reused) |
|---|---|
| Overview totals | counts over `hsin_signals` (approved/published), `hsin_evidence_claims`, `narratives`, `forecasts`, `forecast_outcomes`, `hsin_publications` (PUBLISHED), `hsin_publication_versions` (RETRACTED) + Phase 61 source health |
| Forecasts | Phase 67 `forecasts` / `forecast_scores` / `forecast_snapshots` / `forecast_calibration` (evaluated against recorded outcomes) |
| Narratives | Phase 65 `narratives` + latest `narrative_snapshots` / `narrative_metrics` |
| Sources | Phase 61 `getSourceReliability` (capture telemetry) + Phase 63 monitoring |
| Corrections | `hsin_publication_versions` (reasoned transitions) joined to world-readable publications |

Forecasts surface their links (narrative / evidence-graph / source / outcome) so a
visitor can follow the chain.

---

## Trust model

Trust is presented as **track record + process**, never an opaque rating:
- **Source reliability** — explainable health score (success ×0.6 + parse ×0.2 +
  recency ×0.2 − failure penalty), bands shown.
- **Evidence** — deterministic, provenance-backed graph edges (no inference).
- **Narratives** — coverage / source diversity / evidence density / contradiction
  / stability, all computed.
- The **methodology** page states every formula, the data used, and the limits.

## Forecast accountability model

Forecasts are recorded before outcomes, then evaluated deterministically (Brier
for probabilities; exact match otherwise). The portal shows correct vs incorrect,
the **calibration curve** (stated confidence vs actual accuracy per band), the
accuracy trend, and the resolution timeline — including failures. Unresolved /
expired forecasts are labeled, never counted as correct.

## Source accountability model

Per-source health, collection success %, failure/blocked/stale counts, most-
reliable / most-fragile lists, and the reliability-tier distribution — observed
from capture telemetry. HSI observes and reports; it never bypasses protections,
and this phase changes no crawler / scheduling / scraping behavior.

---

## Security model

- **Public, read-only.** Pages live in the `(marketing)` group (no auth gate);
  the API is anonymous-safe and **rate-limited** (`rateLimit`, 60/min/client) with
  cache headers; both degrade gracefully (never 500, never throw).
- **Public-safety contract enforced in code:** only aggregate / published /
  resolved data is selected. **No** PII, reviewer/creator identities, internal
  notes, unpublished content, draft/cancelled forecasts, private evidence, or
  internal alerts ever flow to the portal. Service-role reads are server-side only;
  the key never reaches the client.
- No auth bypass, no reviewer/admin-only data, no internal dashboards exposed.

---

## Success criteria — a public visitor can answer

| Question | Where |
|---|---|
| Where did this information come from? | Overview + Sources |
| What evidence supports it? | Forecasts (links) + methodology (Evidence Graph) |
| How trustworthy is the source? | Sources |
| What narrative does it belong to? | Narratives |
| What forecasts were made? Were they right? | Forecasts |
| What corrections happened later? | Corrections |

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Full suite (tracked + untracked) | ✅ **2752 / 2752** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; all 6 pages + `/api/public/transparency` → `ƒ` |
| No migration / no workflow changes | ✅ read-only layer only |
| No regressions / no fabricated scores / no internal data exposed | ✅ public-safe by construction |

> Note: the former static `/transparency` marketing page's commitments are now the
> richer `/transparency/methodology` page; `/transparency` is the live portal.

---

## Future marketplace integration

- The portal already exposes attributable, scored, calibrated forecasts and
  reliability metrics — the credibility substrate a forecast/intelligence
  **marketplace** needs (buyers can see a provider's real track record).
- `/api/public/transparency` is the read API a marketplace front-end or partners
  would consume; per-source / per-agent calibration (data already supports it) is
  the natural next extension.
- Everything is immutable + auditable, so marketplace claims ("X% accurate") are
  independently verifiable against this portal.
