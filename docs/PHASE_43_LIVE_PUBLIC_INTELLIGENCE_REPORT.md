# Phase 43 — Live Public Intelligence System

The homepage is no longer a marketing page with seeded numbers. It is now a live
public-intelligence surface backed by real Human Signal Index activity: computed
metrics, the latest published signals, a real activity console, a data-driven
globe, and a live platform-activity bar — all read-only, anonymous-safe, cached,
and public-safe.

**Out of scope / untouched:** RBAC, IAM, auth, middleware, CMS publishing
workflow, billing, Stripe, compliance, role approval. No schema changes, no RLS
changes. All reads only.

---

## Data sources used

All reads go through one server module, `apps/web/lib/public-intelligence.ts`,
which assembles a single cached **bundle**. Tables and the field each metric uses:

| Output | Table | Columns / filter |
|---|---|---|
| `totalSources` | `hsin_sources` | `count(*)` |
| `totalSignals` | `hsin_signals` | `count(*)` |
| `publishedReports` | `hsin_publications` | `count where state='PUBLISHED'` |
| `openReviews` | `hsin_signals` | `count where status in (new, reviewing, needs_research)` |
| `traceabilityScore` | `hsin_publications` | `avg(trust_score) where state='PUBLISHED'` (1 dp; 0 if none) |
| `activityBar.activeSignals` | `hsin_signals` | `count where status != 'rejected'` |
| `activityBar.publishedToday` | `hsin_publications` | `count where state='PUBLISHED' and published_at >= start-of-day (UTC)` |
| Latest signals | `hsin_signals` (status='published') → **fallback** `hsin_publications` (state='PUBLISHED') | `id, title, category, created_at, status`; newest first; limit 10 |
| Category activity (globe) | `hsin_signals.signal_category` (status in approved/published) → **fallback** `hsin_publications.categories[]` | tallied into 6 buckets |
| Activity feed | `hsin_publications` (REPORT PUBLISHED, EVIDENCE LINKED), `hsin_signals` (NEW SIGNAL — category only), `hsin_signal_reviews` (REVIEW COMPLETED), `hsin_sources` (SOURCE VERIFIED) | newest first; ≤8 events |

### Read client strategy
`readClient()` prefers the **service-role client** (`@hsi/database`
`createServiceRoleClient`, server-only, RLS-bypassed) so aggregate counts over
internal tables are accurate for anonymous visitors, and **falls back to the anon
server client** (`createServerClient`, published-only via RLS) when no service-role
key is configured. If neither can be built (no env — sandbox, CI, local without
keys), every read degrades to a graceful empty result. The service-role key never
leaves the server (used only inside this module and the API route; never imported
by a client component — components receive plain serialized props).

### Fallbacks (no fake data)
- **Latest signals:** real published `hsin_signals` first; if none, published
  `hsin_publications` mapped to the same shape; if still none → empty array and the
  UI renders **“No public signals published yet.”** No demo rows.
- **Globe:** category buckets from real activity; when there is no activity the
  globe uses its restrained default palette (decorative, unchanged).
- **Activity console:** only events that correspond to real rows; when there are
  none it shows a calm **“Monitoring public signals…”** idle line.

---

## Caching strategy

- The full bundle is wrapped in **`unstable_cache`** with `revalidate: 60`s and
  cache tag `public-intelligence`. The homepage and the API share this one cached
  function, so a burst of visitors collapses to at most one DB pass per 60s.
- Reads use **non-cookie** clients (`@hsi/database`), which is what makes the data
  cacheable (cookie/header access is disallowed inside `unstable_cache`).
- The API route adds an HTTP layer:
  `cache-control: public, max-age=60, stale-while-revalidate=120`.
- **No N+1:** counts use `select('id', { count: 'exact', head: true })` (no rows
  transferred); list reads are single bounded queries (`limit 10` / `limit 1000`);
  the ten reads run concurrently via `Promise.all`. Reduced-motion and all hero
  animations are unchanged (purely client-side; data is passed as props).

---

## Public safety review

The endpoint and homepage expose **only** published/aggregate data:

- **Content shown** is limited to PUBLISHED, human-reviewed material: publication
  titles (already public), and for signals only the normalized **category** — never
  raw signal titles, source names/URLs, reviewer identities, notes, or `raw_content`.
- **Counts/timestamps** of internal tables are aggregate operational signals
  (how many sources/signals/reviews, and recency) — no row content, no PII.
- **No geolocation, no user data, no personal information** in the globe — only
  aggregate category counts mapped to six public narrative buckets.
- **No internal/admin actions** in the activity feed (no governance state, no
  role/approval events); source names are deliberately omitted to avoid revealing
  monitored targets.
- The API never 500s on the public path (degrades to an empty-but-valid body) and
  strips everything except `{ metrics, latestSignals, activityFeed }`.
- **Rate limiting:** `apps/web/lib/rate-limit.ts` — a dependency-free in-memory
  fixed-window limiter (60 req/min/IP, `x-forwarded-for`-aware), returning `429`
  with `retry-after`. Best-effort (per-instance, since there is no Redis in the
  stack); appropriate for an anonymous, cached, read-only endpoint. Documented as
  such.

---

## API schema

`GET /api/public/intelligence` — `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.

**200 OK**
```jsonc
{
  "ok": true,
  "metrics": {
    "totalSources": 0, "totalSignals": 0, "publishedReports": 0,
    "openReviews": 0, "traceabilityScore": 0
  },
  "latestSignals": [
    { "id": "string", "title": "string", "risk_level": 1,
      "category": "Influence|Recruitment|Misinformation|Propaganda|Extremism|Other",
      "created_at": "ISO-8601", "status": "published" }
  ],
  "activityFeed": [
    { "id": "string",
      "kind": "NEW SIGNAL|EVIDENCE LINKED|REVIEW COMPLETED|REPORT PUBLISHED|SOURCE VERIFIED",
      "text": "string", "at": "ISO-8601" }
  ]
}
```
Headers: `cache-control: public, max-age=60, stale-while-revalidate=120`,
`x-ratelimit-limit`, `x-ratelimit-remaining`.

**429 Too Many Requests** — `{ "ok": false, "error": "Rate limit exceeded…" }`,
headers `retry-after`, `cache-control: no-store`.

The homepage reads the **same cached `getPublicIntelligenceBundle()`** directly
(server component) rather than self-fetching the API — both share one source of
truth and one cache entry.

---

## Performance impact

- Homepage route stays dynamic (`ƒ /`) as before (it already used cookies via the
  CMS read); the new data adds **one cached bundle read** (≤10 concurrent count/list
  queries, collapsed to 1 pass / 60s).
- Counts are head-only (no row payloads); list reads are bounded. No client bundle
  growth from the server lib (type-only imports in client components).
- Animations and reduced-motion behavior are preserved (data flows as props into
  the existing client visualizations).

---

## Files added / changed

**Added**
- `apps/web/lib/public-intelligence.ts` — cached server data layer (bundle + getters).
- `apps/web/lib/public-intelligence-mapping.ts` — pure category→bucket/risk/tone/color + node distribution.
- `apps/web/lib/rate-limit.ts` — in-memory fixed-window limiter.
- `apps/web/lib/public-intelligence.test.ts` — unit tests for mapping + limiter (11 tests).
- `apps/web/app/api/public/intelligence/route.ts` — public read API.
- `docs/PHASE_43_LIVE_PUBLIC_INTELLIGENCE_REPORT.md` — this report.

**Changed**
- `apps/web/app/(marketing)/page.tsx` — reads the live bundle; live hero metrics, feed, globe input, activity bar; removed demo constants.
- `apps/web/components/home/LiveSignalsFeed.tsx` — empty state + activity prop.
- `apps/web/components/home/LiveActivityPulse.tsx` — cycles real activity events; idle state.
- `apps/web/components/home/HeroNetworkGlobe.tsx` — node colors driven by category activity.
- `apps/web/components/home/PlatformActivity.tsx` — renders the live activity bar.

> **MissionControlPreview** remains an illustrative dashboard *preview* (clearly
> framed as a mock); it is not wired to live data in this phase to keep scope to
> the public metrics/feed/activity/globe surface.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2666 / 2666 pass, 0 fail** (+11 new).
- `next build`: **exit 0, "Compiled successfully"**; `ƒ /api/public/intelligence` registered as a dynamic route.
