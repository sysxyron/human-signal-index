# Phase 52 — Forecasting & Early Warning Engine

A new read-only forecasting layer at `/dashboard/forecasting` that answers "what is
growing? what is accelerating? what is declining? what needs attention before it
becomes a problem?" — built **entirely from observed, cached platform data**.
Nothing is presented as certainty: every output is framed as **likelihood /
direction / velocity** with an **explainable confidence**. No black-box scoring, no
fabricated forecasts, no AI hallucination.

**Untouched:** RBAC, IAM, auth, middleware, Stripe, billing, compliance, existing
review/intelligence workflows. The Phase 21 forecasting workflow at
`/dashboard/forecasts` (and its `components/forecasting/*`) is left intact — this is
a separate route + `components/forecast-center/*`.

---

## Architecture & data flow

```
public-intelligence.ts   → getPublicIntelligenceBundle() / getSignalLibraryData()  (cases + publishedAt, trends, risk facets)
source-intelligence.ts   → getSourceIntelligence()        (per-source recent activity, coverage, health)
operations-intelligence  → getOperationsIntelligence()    (review ops)
alerts-intelligence.ts   → getAlertsIntelligence()        (emerging-narrative detectors)
        ▼ getForecastData()  (Promise.all over cached sources — no duplicate reads, no N+1)
app/dashboard/forecasting/page.tsx  (SERVER, force-dynamic, fully server-rendered)
  • Executive outlook        Part 8   • Early warning             Part 2
  • Trend momentum (7/30/90) Part 3
  • Risk trajectory          Part 4   • Review forecasting         Part 7
  • Narrative momentum       Part 5
  • Source forecasts         Part 6   • Forecast history (empty)   Part 10
```

---

## Forecast methodology

All momentum is computed from **real publication timestamps** (`PublicLibrarySignal.publishedAt`),
not synthesized:

- **Trend momentum (Part 3):** for each window W ∈ {7, 30, 90} days, `current` =
  count in the last W days, `prior` = count in the preceding W days. Direction =
  Increasing (>+10%), Declining (<−10%), or Stable; deltaPct shown.
- **Risk trajectory (Part 4):** per category, current risk tier (from the category's
  inherent severity) + a 30-day window direction and **velocity** (current − prior
  observed count).
- **Narrative momentum (Part 5):** fastest-growing (top 30-day deltas), most
  persistent (categories with activity across ≥2 of the 7/30/90 windows), emerging
  (reused alert detectors), dormant (had activity 30–90d ago but none in the last
  30d, with last-seen month).
- **Source forecasts (Part 6):** likely failures (failing + active-but-silent),
  likely recoveries (failing eligible), coverage gaps, coverage expansion (sources
  active in 30d), high-yield trajectory — from source activity patterns only.
- **Review forecasting (Part 7):** backlog / throughput / publication direction +
  estimated pressure. **No ETAs are fabricated.**
- **Early warnings (Part 2):** surfaced **only when indicators support them** —
  rising narratives (30d up + confidence ≥ Moderate), risk acceleration, source
  failures, publication surge, backlog acceleration, category concentration.

## Confidence model (Part 9)

Explainable, not a black box. For each forecast, `confidenceOf(current, prior)`:
- **Low** — combined sample < 4 ("small sample — interpret with caution").
- **Moderate** — sample < 12, or one window empty ("limited continuity").
- **High** — ≥12 observations across both windows ("consistent multi-period").

Every momentum/trajectory/source/review forecast carries a Low/Moderate/High badge
with its reason. Confidence is driven by **sample size, data continuity, and
multi-period consistency** — visible, never opaque.

## Early warning model

Indicators are derived flags over observed state; each is shown with its supporting
indicator text and confidence, and only rendered when its threshold is met. When
none fire, the panel states so explicitly (no manufactured warnings).

## Forecast history (Part 10)

There is no stored forecast outcome history yet, so the panel renders a **graceful
empty state** (no fabricated past forecasts or success rate). The shape is reserved
for when forecasts are recorded over time.

---

## Performance

- Five cached reads via `Promise.all` (shared `public-intelligence` cache tag) →
  ≤1 DB pass per cache window; no duplicate reads, no N+1. All momentum math is pure
  in-memory over the already-fetched cases.
- Fully server-rendered (no client islands on this page). No client-bundle growth
  from server libs.

---

## Public safety

- Observed aggregates only (counts, directions, category buckets); reuses the
  public-safe activity/emerging detectors. No PII, no reviewer/source identities,
  no internal notes. Non-deterministic framing is stated on the page.

---

## Files

**Added**
- `apps/web/lib/forecasting-intelligence.ts` — momentum/trajectory/early-warning engine + confidence model (composed, read-only).
- `apps/web/components/forecast-center/panels.tsx` — outlook, early warning, trend momentum, risk trajectory, narrative momentum, source forecasts, review forecast, forecast history.
- `apps/web/app/dashboard/forecasting/page.tsx` — Forecasting & Early Warning Center.
- `docs/PHASE_52_FORECASTING_ENGINE.md` — this report.

> New route + new components folder — the Phase 21 `/dashboard/forecasts` workflow
> and `components/forecasting/*` are untouched.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**; `ƒ /dashboard/forecasting` → 228 B (103 kB first load), fully server-rendered.
  - Note: a first build run hit Next 14's transient `/_document` `PageNotFoundError` during page-data collection (a stale `.next` artifact after many consecutive builds, unrelated to this code — compilation succeeded). A clean rebuild (`rm -rf .next`) is green.
