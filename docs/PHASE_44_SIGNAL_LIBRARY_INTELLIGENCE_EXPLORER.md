# Phase 44 — Signal Library Intelligence Explorer

The Signal Library is no longer a static demo table. It is now the primary public
**exploration surface** for Human Signal Index: live search, faceted filters with
counts, intelligence cards, a detail drawer with an evidence timeline, a category
heatmap, and trend analytics — all read-only, public-safe, and powered by the same
cached data layer as the live homepage.

**Untouched:** RBAC, IAM, auth, middleware, CMS, billing, Stripe, compliance, role
approval. Public read-only experience only. No schema/RLS changes.

---

## Architecture

```
hsin_publications (PUBLISHED / ARCHIVED / RETRACTED, RLS-safe)
        │  (+ hsin_signals.created_at for the signals-over-time series)
        ▼
lib/public-intelligence.ts → getSignalLibraryData()           [cached, server-only]
   • reuses readClient() (service-role → anon → null), category mapping, caching
   • one bounded read (≤300) → derives cards + facets + heatmap + trends in-memory
        ▼
app/(marketing)/signal-library/page.tsx  (server, ISR revalidate 120s)
   • <TrendAnalytics trends={…}/>           (server-rendered LineChart islands)
   • <SignalExplorer data={…}/>             (client island)
        ├─ debounced search + facet rail (category / risk / status, with counts)
        ├─ clickable category heatmap (drives the category filter)
        ├─ intelligence-card grid + client pagination ("Load more")
        └─ <SignalDetailDrawer/> → summary, facts, publication history,
                                    evidence timeline (Signal→…→Publication)
```

- **Part 8 (API reuse):** the explorer is built on the **same** `lib/public-intelligence.ts`
  module that backs the homepage and `/api/public/intelligence` — same read client,
  same `public-intelligence-mapping.ts` (category→bucket/risk/tone/color, risk tiers),
  same `unstable_cache` tag (`public-intelligence`). No duplicate query infrastructure.

### Parts delivered
1. **Intelligence search** — debounced (200 ms) keyword search across title,
   summary, category, and status; all tokens must match. Instant (in-memory).
2. **Facet filters** — Category (6 buckets), Risk (Critical/High/Moderate/Low),
   Status (Published/Archived), each with a live **count** beside it; multi-select.
3. **Signal cards** — intelligence cards (category tag, risk badge, traceability
   badge, title, summary, evidence·sources footer, date) — `@hsi/ui SignalCard`.
4. **Detail drawer** — slide-over with summary, category, risk, evidence linked,
   sources, traceability, human-review status, and publication history.
5. **Evidence timeline** — read-only Signal → Evidence → Analysis → Human Review →
   Publication, annotated with the signal's real values.
6. **Category heatmap** — six buckets, intensity by real count, clickable to filter.
7. **Trend analytics** — signals over time, average risk over time, publications
   over time (real monthly series; "Not enough data yet" when sparse). No fake data.

---

## Query strategy

- **One bounded query** for the card dataset: `hsin_publications` `select(...)`
  `in('state', ['PUBLISHED','ARCHIVED','RETRACTED'])` `order(published_at desc)`
  `limit(300)`. All facet counts, the heatmap, the risk/publications trends, and
  search are derived **in memory** from that single result — **no N+1**, no
  per-keystroke or per-facet DB calls.
- **One extra query** for the signals-over-time series (`hsin_signals.created_at`,
  `limit 2000`, grouped by month); falls back to the publications series if
  unavailable (anon RLS / no service role).
- **Caching:** `getSignalLibraryData()` is wrapped in `unstable_cache`
  (`revalidate: 120`, tag `public-intelligence`); the page is ISR (`revalidate = 120`).
  Search/facet/pagination are client-side over the already-fetched, cached dataset.
- **Read client:** service-role (RLS-bypassed, server-only) when configured, else
  anon (published-only via RLS), else graceful empty. The service key never reaches
  the client; client components receive plain serialized props (type-only imports).

---

## Public safety review

- Only **published/archived publications** (already public via RLS) are shown.
  Fields exposed: title, summary, category bucket, derived risk tier, publication
  date, evidence/source **counts**, traceability score, review status. **No** raw
  signal content, source names/URLs, reviewer identities, notes, or PII.
- Risk level is a **derived presentational** value from the category bucket
  (Extremism=Critical … Other=Low) — consistent with Phase 43; not sensitive.
- The heatmap and trends are **aggregate counts** only.
- Status facet maps `PUBLISHED → Published`, `ARCHIVED`/`RETRACTED → Archived`
  (RETRACTED was already public via the existing `/intelligence` portal).
- Empty/zero everywhere when there is no public data (sandbox/CI without env):
  cards show **"No public signals published yet."**, trends show "Not enough data
  yet." No fabricated records.

---

## Performance impact

- New code is **read-only + cached**; the page is ISR. A burst of visitors collapses
  to ≤1 DB pass per 120 s (shared cache tag with the homepage bundle).
- Counts/series are computed once in memory; client-side search/facet/paginate is
  O(n) over ≤300 items — instant, no network.
- Card grid paginates (12 per page, "Load more") to bound DOM size; the drawer
  mounts only when open (`AnimatePresence`).
- No client-bundle bloat from the server lib (type-only imports). All animations
  (drawer slide, timeline pulse) respect `prefers-reduced-motion`.

---

## Screenshots

Not capturable in this environment (no browser runner). Verify on a preview deploy
at `/signal-library`: trend cards row, the filter rail + category heatmap, the
intelligence-card grid, and the detail drawer with the evidence timeline. Mobile:
the layout collapses to a single column (filter rail above results, heatmap 3-col).

---

## Files

**Added**
- `apps/web/components/signal-library/SignalExplorer.tsx` — search + facets + heatmap + cards + pagination.
- `apps/web/components/signal-library/SignalDetailDrawer.tsx` — detail drawer + evidence timeline.
- `apps/web/components/signal-library/TrendAnalytics.tsx` — three real trend charts.
- `docs/PHASE_44_SIGNAL_LIBRARY_INTELLIGENCE_EXPLORER.md` — this report.

**Changed**
- `apps/web/lib/public-intelligence.ts` — added `getSignalLibraryData()` (+ library types) reusing the cached read client.
- `apps/web/lib/public-intelligence-mapping.ts` — added risk tiers (`riskTier`, `colorForRiskTier`, `RISK_TIERS`).
- `apps/web/lib/public-intelligence.test.ts` — +2 risk-tier tests.
- `apps/web/app/(marketing)/signal-library/page.tsx` — live server page (was static demo).

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail** (+2 new).
- `next build`: **exit 0, "Compiled successfully"**; `/signal-library` → 4.53 kB (152 kB first load), server-rendered on demand with the cached data layer.
