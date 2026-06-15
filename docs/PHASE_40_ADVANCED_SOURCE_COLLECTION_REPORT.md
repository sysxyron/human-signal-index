# Phase 40 — Advanced Source Collection Framework

**Status:** ✅ Complete and verified · **Migration:** `0044_advanced_source_collection.sql` ·
**Tests:** 2599 pass (0 fail) · **Build:** green · **No RBAC/auth/middleware/billing/Stripe changes**

Phase 40 closes the source-ingestion gap found in beta: HSI now validates and
normalizes sources by type, monitors no-RSS pages via watchlist snapshots, handles
Reddit/news/research/government feeds, rejects bad inputs with clear guidance, and
derives an explicit health state so a source never silently produces zero signals.
This is the final planned build phase.

---

## 1. What was built

- **Source-capture engine `@hsi/source-collectors`** (pure, 19 tests): the full
  source-type catalog, per-type `validateSource`/`normalizeSourceInput`, capture
  engines (`captureRss`/`captureNews`/`captureResearch`/`captureGovernment`/
  `captureReddit`/`captureWatchlist`), watchlist snapshot + diff, `deriveHealth`,
  capture routing, recommended seeds, and `createSignalFromCapture`.
- **Watchlist monitoring**: fetch → extract readable text → normalize → hash →
  diff → (signal on change). Snapshots + diffs persisted (`source_snapshots`,
  `source_diffs`).
- **RSS validation**: non-feed URLs are rejected with actionable messages; a Reddit
  page suggests its `.rss`; a feed-shaped check prevents silent empty feeds.
- **Reddit source type**: subreddit name/URL → canonical `.rss`; Atom parsing
  extracts title/url/author/timestamp.
- **Podcast handling**: requires a podcast RSS feed; Spotify URLs are rejected with
  the exact guidance.
- **New source types**: news, research, reddit, social, government, watchlist,
  email, api, webhook, archive, intelligence_feed — existing 8 still work.
- **Source health**: healthy / warning / failing / disabled / unsupported /
  needs_configuration, each with a clear reason.
- **Dynamic Add/Edit form**: fields change by type with client-side validation
  before save.
- **Worker routing**: capture routes by source type (additive; existing rss/
  public_page targets unchanged).
- **Admin seed action**: one-click recommended starter sources (disabled by default).

---

## 2. Source types added

| Type | Capture | Notes |
| --- | --- | --- |
| `news` | RSS | Google News / Reuters / AP RSS; publisher/headline/url/date |
| `research` | RSS | arXiv / PubMed / SSRN-like feeds; title/authors/abstract/url/date |
| `reddit` | RSS (Atom) | subreddit URL or name → `.rss`; post title/url/author/timestamp |
| `social` | public_page | public social pages (text capture) |
| `government` | RSS **or** watchlist | feed when provided, else page monitoring |
| `watchlist` | public_page | no-RSS pages: snapshot + diff + signal-on-change |
| `email` | foundation | manual/foundation, optional reference URL |
| `api` | foundation | endpoint + method + headers metadata (no polling yet) |
| `webhook` | foundation | inbound signed-payload pattern (no fetch URL) |
| `archive` | public_page | archived/historical snapshots |
| `intelligence_feed` | RSS | generic curated intelligence feeds |

Existing types (`website`, `rss`, `youtube`, `tiktok`, `podcast`, `forum`,
`document`, `manual`) are preserved.

---

## 3. Capture architecture

```
SourceForm (client) ── validateSource() ──▶ clear error + suggestion BEFORE save
        │  normalized config { captureUrl, connector, interval, selector, subreddit, … }
        ▼
hsin_sources (+ config jsonb)
        ▼
worker captureSignals ── resolveTargetConnector(sourceType) ──▶ rss | public_page | (skip)
        ▼
@hsi/source-collectors.captureForType(type, url, {fetchText, capturedAt})
   rss/news/research/government/reddit → parse feed/Atom → CapturedItem[]
   watchlist/website/social/archive    → extract readable text → snapshot
        ▼
createSignalFromCapture() → signal draft (status 'new') + source_snapshots/source_diffs
        ▼
deriveHealth() → source_capture_events (state + reason; explains zero-signal cases)
```

The engine is PURE — fetching is injected (`FetchText`), so every collector is
unit-tested offline. It reuses `@hsi/source-connectors` for RSS/Atom parsing,
hashing, URL normalization, and the **public-only capture policy** (never bypasses
logins / private communities). It deep-imports those submodules (not the barrel) so
Playwright/`node:crypto` never enter the web/client bundle.

---

## 4. Watchlist behavior

For public pages with no feed: fetch HTML → `extractReadableText` (strip scripts/
styles/tags, decode entities) → `normalizeContent` (deterministic whitespace) →
SHA-256 `contentHash`. `diffSnapshots(previous, next)` reports `changed`, hash
delta, and `addedChars`/`removedChars`. A new snapshot with no prior → changed; an
identical page → unchanged (no signal); a changed page → a `source_diffs` row and a
signal. Capture interval + optional content selector are stored in `config`.

---

## 5. RSS validation behavior

`validateSource` rejects, with actionable messages:
- A non-feed URL for an RSS type → "This does not look like an RSS/Atom feed…".
- A Reddit page under an RSS type → suggests `…/.rss` or the `reddit` type.
- A Spotify URL under `podcast` → "Spotify pages are not podcast RSS feeds. Add the
  podcast RSS feed or use manual monitoring."
- Missing required feed/page/subreddit/endpoint per type → field-specific error.

Valid input returns a `NormalizedSource` (canonical capture URL + connector +
config) the DAL persists. The form surfaces the first issue + suggestion before
submitting.

---

## 6. Reddit behavior

`reddit` accepts a subreddit name (`antinatalism`), `r/…`, a subreddit URL, or a
`.rss` URL, and normalizes to `https://www.reddit.com/r/<sub>/.rss`. Capture parses
the Atom feed, extracting per-post **title, url, author, timestamp** (score/comments
are surfaced when present; standard `.rss` omits them). Subreddit is saved in
`config.subreddit`.

---

## 7. Podcast handling

`podcast` **requires** a podcast RSS feed URL. A Spotify show/episode/playlist URL
is rejected with the exact message above (Spotify pages are not RSS). Non-URL input
is rejected. Valid feeds capture as RSS items (`podcast_episode` signals).

---

## 8. Security review

- **No RBAC/auth/middleware/billing/Stripe/user_roles changes** — confirmed by
  `git status` (none of those paths modified).
- **No service-role key in client code** — the SourceForm + seed button are client
  UX over server actions; greps find no `service_role`/`STRIPE_SECRET` in the
  source-collection code. The seed action gates `admin` in the DAL.
- **Public-only capture preserved** — all collectors call
  `assertPublicCapturePolicy` (via `@hsi/source-connectors`); no logins / private
  communities / private individuals.
- **Auditable** — sources carry `config`; every capture writes a
  `source_capture_events` row (state + reason); snapshots/diffs are retained.
- **Tenant/observatory RLS** — new tables mirror Phase-7: authenticated read,
  researcher+ insert, admin all (reuses `is_admin()`/`is_researcher_or_above()`).
- **Bundle hygiene** — web/client deep-imports avoid pulling Playwright/`node:crypto`
  into the browser bundle.

---

## 9. Verification results

| Gate | Result |
| --- | --- |
| Web typecheck | ✅ 0 errors |
| Worker typecheck | ✅ 0 errors |
| `@hsi/source-collectors` typecheck | ✅ 0 errors |
| Full test suite | ✅ **2599 pass / 0 fail** (+22) |
| Production build | ✅ exit 0; `/dashboard/sources` emitted |
| Route audit | ✅ passed (189 pages) |
| Migration audit | ✅ contiguous 0001→0044 |
| Source-capture smoke (offline fixtures) | ✅ rss/reddit/watchlist capture + signal draft tested |
| Validation (Spotify / non-RSS reddit / feed checks) | ✅ tested |
| No RBAC / auth / billing changes | ✅ confirmed via git status + grep |

Test coverage (Deliverable Q): source-type validation, invalid-RSS rejection,
Spotify-podcast rejection, Reddit RSS normalization, watchlist hashing, snapshot
diffing, source-health messages, capture routing, and signal creation from capture.

---

## 10. Recommended starter sources

Seeded via the admin "Seed starter sources" button (all **disabled by default** —
opt each in):

1. **Google News RSS — Artificial Intelligence** (`news`)
2. **Google News RSS — Population Decline** (`news`)
3. **arXiv RSS — Computer Science: AI** (`research`)
4. **Reddit RSS — r/antinatalism** (`reddit`)
5. **Watchlist — proextinction.com** (`watchlist`, no RSS → snapshot/diff)

---

## Next (post-build pause)

Per the phase brief, feature development now pauses to focus on **beta testing,
customer discovery, source tuning, user onboarding, and sales validation**. Natural
follow-ups when build resumes: live capture wiring of watchlist snapshots/diffs into
`runSourceIntake`, the inbound webhook ingestion endpoint (signed payloads), API
polling execution, and a source-health surface on the registry UI.
