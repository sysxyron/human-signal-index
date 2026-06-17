# Phase 49 — Trust & Transparency Center

`/trust` is now a public **Trust & Transparency Center** that lets anyone
independently evaluate how trustworthy HSI is — answering "why should I trust this
platform?" — without any access to internal systems. The page keeps its existing
principles/commitments narrative and adds live, data-backed trust sections plus a
public `GET /api/public/trust` endpoint.

**Untouched:** RBAC, IAM, auth, middleware, billing, Stripe, compliance, review
workflow, existing permissions, and the existing intelligence pages. Read-only
trust layer only. No schema/RLS changes.

---

## Architecture & data sources

```
public-intelligence.ts   → getPublicIntelligenceBundle()  (metrics, activityBar, activityFeed)
                         → getSignalLibraryData()          (published cases → scorecard inputs)
source-intelligence.ts   → getSourceIntelligence()         (coverage, reliability, validation)
operations-intelligence  → getOperationsIntelligence()     (review pipeline, review ops)
trust-intelligence.ts    → getPublicCorrections()          (retraction → public correction log)  [NEW read]
        ▼ getTrustData()  (Promise.all over the 5 cached sources — no duplicate queries)
app/(marketing)/trust/page.tsx  (SERVER, ISR 120s) + GET /api/public/trust (rate-limited)
  • Trust overview          Part 1
  • Transparency scorecard  Part 2   • Review pipeline        Part 3
  • Traceability explainer  Part 5 (interactive client island)
  • Corrections center      Part 4   • Source accountability  Part 6
  • Decision explainability Part 7   • Platform health        Part 8
  • Audit timeline          Part 9
  + existing principles / commitments / report-a-problem (preserved)
```

`getTrustData()` composes the **already-cached** Phase 43–47 getters and adds a
single new cached read for the correction log (`hsin_publication_retractions`, with
publication titles resolved in **one** `.in('id', …)` query — no N+1). Both the page
and the API consume `getTrustData()`.

### Data sources per section
- **Overview / scorecard / health:** `metrics` (traceability, published reports),
  library published cases (evidence-linked %, traceable %), source health
  (active/total → source-verified %), review ops (today's decisions, backlog).
- **Review pipeline:** operations pipeline stage counts (real `hsin_signals`
  statuses) — `Review` relabelled "Human Review".
- **Corrections:** `hsin_publication_retractions` (date, reason→type, affected
  publication title, status, resolution). Already-public retraction data.
- **Source accountability:** source coverage by category + average reliability
  (mean source reliability score) + validation rate (% active). No identities.
- **Audit timeline:** the public activity feed merged with corrections, newest first.

---

## Trust calculations

| Metric | Calculation |
|---|---|
| Human reviewed % | 100% when any published record exists (every publication is human-reviewed; 0 when none) |
| Traceability % | average publication trust score (`metrics.traceabilityScore`) |
| Evidence Linked % | published cases with `evidenceCount > 0` ÷ published cases |
| Traceable % | published cases with a traceability score ÷ published cases |
| Version Controlled % / Corrections Logged % | 100% when published records exist (policy guarantees) |
| Source Verified % / Validation rate | active sources ÷ total sources |
| Reliability avg | mean of per-source reliability scores |
| Corrections issued | count of public retraction records |

All percentages are 0 when there is no underlying data — never fabricated.

---

## Public safety controls

- **No identities:** reviewer and retractor identities are never read or shown;
  source identities are reported only at category level (stated on the page).
- **No internal notes:** the correction log shows date / reason type / affected
  publication / status / resolution — the free-text retraction `detail` and
  `retracted_by` are deliberately not selected.
- Everything is aggregate or already-public (published findings, public
  retractions). Empty/zero states throughout (sandbox/CI without env): clean
  corrections record, empty audit timeline, zeroed metrics — no fake data.
- The API strips to `{ metrics, pipeline, corrections, health }`, is rate-limited
  (60/min/IP, shared in-memory limiter), and never 500s (degrades to a valid body).

---

## API schema — `GET /api/public/trust`

`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. **200 OK**
```jsonc
{
  "ok": true,
  "metrics": { "publishedSignals": 0, "publishedReports": 0, "humanReviewedPct": 0,
               "traceabilityPct": 0, "correctionsIssued": 0, "sourcesActive": 0 },
  "pipeline": [ { "stage": "Signal", "count": 0, "color": "#3B82F6" }, … ],
  "corrections": [ { "id", "at", "date", "type", "status", "publication", "resolution" } ],
  "health": { "signalsReviewedToday": 0, "reportsPublishedToday": 0, "avgTraceability": 0,
              "reviewBacklog": 0, "sourceActivity": 0 }
}
```
Headers: `cache-control: public, max-age=120, stale-while-revalidate=300`,
`x-ratelimit-*`. **429** with `retry-after` when rate-limited.

---

## Performance impact

- Five cached reads via `Promise.all` (shared `public-intelligence` cache tag) +
  one cached corrections read → ≤1 DB pass per cache window; no N+1. Page is ISR
  (120s); the API adds CDN cache headers.
- Server-rendered panels; the only client island is the interactive traceability
  explainer (pure UI state). No client-bundle growth from server libs (type-only
  imports). Reduced-motion safe.

---

## Files

**Added**
- `apps/web/lib/trust-intelligence.ts` — composed trust data + public corrections (cached).
- `apps/web/components/trust-center/panels.tsx` — overview, scorecard, pipeline, corrections, source accountability, decision explainability, platform health, audit timeline.
- `apps/web/components/trust-center/TraceabilityExplainer.tsx` — interactive explainer (client).
- `apps/web/app/api/public/trust/route.ts` — public trust API.
- `docs/PHASE_49_TRUST_TRANSPARENCY_CENTER.md` — this report.

**Changed**
- `apps/web/app/(marketing)/trust/page.tsx` — added the live trust center sections; existing principles/commitments/report-a-problem preserved.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**; `ƒ /trust` → 1.8 kB (115 kB first load), `ƒ /api/public/trust` registered.
