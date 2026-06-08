# Operations: Provider Setup & Live Capture (HSI Phase 9)

How to enable **live**, PUBLIC-ONLY capture via the Phase-9 provider adapters,
and the ethics/limits that govern it. Architecture:
[provider-adapters.md](../architecture/provider-adapters.md).

- Worker: [`apps/worker/jobs/capture-worker.ts`](../../apps/worker/jobs/capture-worker.ts).
- Config: [`apps/worker/lib/config.ts`](../../apps/worker/lib/config.ts).
- Env template: [`.env.example`](../../.env.example).

---

## Default: offline / fixture mode

Out of the box `SIGNAL_CAPTURE_MODE` is unset (`fixture`). Capture is fully
deterministic with **no network** (the `FixtureCaptureProvider`). No keys are
needed and nothing leaves the process. Keep it here until a source's public-use
terms are confirmed.

## Enable live capture

```dotenv
SIGNAL_CAPTURE_MODE=live
SIGNAL_CAPTURE_USER_AGENT=HumanSignalIndexBot/0.1   # identify your bot honestly
HSIN_PROVIDER_TIMEOUT_MS=12000                      # per-request timeout
HSIN_PROVIDER_MAX_BYTES=2000000                     # max bytes read per request
```

In live mode the worker injects a real `fetch` into `ProviderDeps` and routes each
source through `captureViaProvider(sourceType, …)`. `rss`, `website`, and
`forum`/`podcast` **public-feed** capture need no keys. Each capture records a
`ProviderRunLog` to `hsin_provider_runs`.

## YouTube (Data API v3)

```dotenv
YOUTUBE_API_KEY=...      # Google Cloud → YouTube Data API v3 key
```

- Uses the **documented API** to read PUBLIC video/channel metadata.
- **Never** scrapes the watch page. No key → `provider_not_configured` (clean skip).
- Rate limits: the Data API uses a **daily quota** (units per call). Batch and
  cache; don't poll tight loops. A `403`/quota error surfaces as `fetch_error`.

## Podcast Index

```dotenv
PODCAST_INDEX_API_KEY=...
PODCAST_INDEX_API_SECRET=...
```

- With keys + a `feedId`, queries the signed Podcast Index API
  (`Authorization = sha1(key + secret + unixSeconds)`).
- With **only a public feed URL**, falls back to the RSS provider (no keys needed).
- Without either → `provider_not_configured`.

## Rate limits & being a good citizen

- Respect each site's **robots.txt** and **terms of service**; honor documented
  API quotas.
- The conservative defaults (timeout, max-bytes, one item per website capture)
  keep per-request load low. Upstream **dedupe** (`hsin_capture_dedupes`) avoids
  re-emitting identical captures.
- Prefer a source's official **feed/API** over page fetches.
- Stagger captures via the queue/scheduler rather than fetching everything at once.

## The public-only ethics policy (binding)

- **PUBLIC information only.** `fetchPublicText` runs `assertPublicCapturePolicy`
  before any request — login/auth/paywall URLs are rejected
  (`policy_violation`), no network touched.
- **No login / session / cookie / challenge bypass.** A Cloudflare/Turnstile/
  hCaptcha page returns `blocked` and is **never** captured or solved.
- **No private forums/DMs/members-only content.** Forum capture is public feeds
  only.
- **No doxxing / harassment.** We observe public narratives, not private people.
- **Drafts only.** Captures feed the review pipeline; nothing auto-publishes.

## Interpreting outcomes

| Provider result          | Worker treatment        | Summary counter |
|--------------------------|-------------------------|-----------------|
| `ok`                     | capture → dedupe → draft| `captured`/`duplicates` |
| `blocked`                | non-fatal degraded; flag source health; never store HTML | `blocked` |
| `provider_not_configured`| clean skip              | `skipped`       |
| `timeout`/`fetch_error`/`parse_error`/`policy_violation` | failure (logged) | `failed` |

All outcomes are also recorded as a `ProviderRunLog` in `hsin_provider_runs`
(when service-role is configured) or logged offline.
