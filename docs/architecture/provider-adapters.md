# Real Provider Adapters (HSI Phase 9)

Phase 9 adds a dedicated, **public-only** capture **provider layer** that performs
real outbound fetches against documented public endpoints, with hard limits,
challenge detection, and per-attempt observability. It complements — never
replaces — the Phase-7 capture surface, and obeys the same binding ethics.

- Engine: [`@hsi/source-intelligence` providers](../../packages/source-intelligence/src/providers)
  — `captureViaProvider`, `captureRss`/`captureWebsite`/`captureYouTube`/
  `capturePodcast`/`captureForum`, `makeProviderRunLog`, the hardened
  `fetchPublicText` wrapper.
- Worker integration:
  [`apps/worker/jobs/capture-worker.ts`](../../apps/worker/jobs/capture-worker.ts)
  (live adapter + run-log emission) and
  [`apps/worker/lib/queue-store.ts`](../../apps/worker/lib/queue-store.ts)
  (`recordProviderRun` → `hsin_provider_runs`).
- Schema: migration `0013` (`hsin_provider_runs`).

---

## The five adapters

| `sourceType` | Provider              | How it captures (PUBLIC only)                                     | `method` label     |
|--------------|-----------------------|-------------------------------------------------------------------|--------------------|
| `rss`        | `captureRss`          | Fetch a public RSS/Atom feed → parse → normalized `CapturedItem[]` | `rss`              |
| `website`    | `captureWebsite`      | Fetch a public page → extract title/meta/canonical/body → 1 item   | `website`          |
| `youtube`    | `captureYouTube`      | YouTube **Data API v3** (needs `YOUTUBE_API_KEY`); NEVER scrapes    | `youtube-data-v3`  |
| `podcast`    | `capturePodcast`      | Podcast Index API (signed) **or** RSS fallback from a public feed   | `podcast-index`/`rss` |
| `forum`      | `captureForum`        | A **public** RSS/Atom feed only; delegates to `captureRss`          | `rss`              |

```
   captureViaProvider(sourceType, input, deps, creds)
                          │  route by sourceType
       ┌──────────┬───────┼─────────┬────────────┐
       ▼          ▼       ▼          ▼            ▼
     rss      website  youtube    podcast       forum
      │          │     (api key) (api/feed)  (public feed)
      └──────────┴───────┴─────────┴────────────┘
                          │
                fetchPublicText (hardened):
                  policy guard → timeout → max-bytes → user-agent
                          │
                          ▼
                ProviderResult<CapturedItem | CapturedItem[]>
                          │
                  makeProviderRunLog(...)  ──►  hsin_provider_runs
```

## Binding ethics — public only, no login bypass

Every provider enforces the HSI policy: **PUBLIC information ONLY**. Concretely:

- `fetchPublicText` calls `assertPublicCapturePolicy(url)` **before any request
  leaves the process** — a login/auth/paywall URL is rejected with
  `policy_violation`, no network touched.
- YouTube uses the **documented Data API** with an API key — it NEVER scrapes the
  watch page (which sits behind consent/interstitials). No key →
  `provider_not_configured`.
- Forum capture consumes **only** a public RSS/Atom feed the platform itself
  exposes. It NEVER logs in, holds a session/cookie, solves a challenge, or reads
  members-only boards / DMs. No public feed → `provider_not_configured`.
- No challenge is ever solved or bypassed (see "blocked" below).

## Limits — timeout, max-bytes, user-agent

The worker injects these from config
([`config.ts`](../../apps/worker/lib/config.ts)) into `ProviderDeps`:

| Knob                       | Env                        | Default     |
|----------------------------|----------------------------|-------------|
| Per-request timeout        | `HSIN_PROVIDER_TIMEOUT_MS` | `12000` ms  |
| Max response bytes read    | `HSIN_PROVIDER_MAX_BYTES`  | `2000000`   |
| Outbound User-Agent        | `SIGNAL_CAPTURE_USER_AGENT`| `HumanSignalIndexBot/0.1` |

`fetchPublicText` enforces the timeout via `AbortController` and **caps the body
by streaming/slicing**, so a hostile/huge response can never exhaust memory.

## `blocked` (Cloudflare/Turnstile) vs failure

A Cloudflare / hCaptcha / Turnstile **challenge page** is NOT real content.
`captureWebsite` recognizes challenge markers (`isChallengePage`) and returns
`reason: 'blocked'` — a **soft, recoverable** signal — instead of capturing the
challenge HTML (which would poison the corpus) or reporting a hard failure.

In the worker a `blocked` capture is treated as a **non-fatal degraded result**:
it is logged, the source's health is flagged, and **no challenge HTML is ever
stored**. It is counted separately (`blocked`) in the capture summary.

## `provider_not_configured` — clean skip

When a provider has no way to capture publicly (no API key, no public feed,
unknown `sourceType`), it declines with `provider_not_configured`. The worker
treats this as a **clean skip** (counted as `skipped`), not a failure — it just
means live capture isn't wired for that source yet.

## Provider run logs

Every attempt — success or failure — produces a `ProviderRunLog`
(`makeProviderRunLog`): `{ provider, sourceId, startedAt, finishedAt, ok, reason?,
itemCount?, bytes?, note? }`. The worker persists it via `recordProviderRun`:

- Service-role configured → INSERT into `hsin_provider_runs`.
- Offline → structured log line (no DB).

This gives a per-fetch audit trail: which provider ran, against which source, the
outcome/reason, and item/byte counters.

## robots.txt / terms-of-service caution

The adapters fetch only public, machine-readable endpoints, but operators remain
responsible for respecting each site's **robots.txt** and **terms of service**,
honoring rate limits, and not over-fetching. The conservative defaults
(timeout/max-bytes, one item per website capture, dedupe upstream) keep load low.
When in doubt, prefer the source's official feed/API over page fetches, and keep
`SIGNAL_CAPTURE_MODE=fixture` until a source's public-use terms are confirmed.

## Offline-safety

With `SIGNAL_CAPTURE_MODE` unset/`fixture` (the default) the provider layer is
never reached — capture uses the deterministic `FixtureCaptureProvider` (no
network). Even in `live` mode, `fetchPublicText` requires an **injected** fetch
(`deps.fetchImpl`); the pure package never reaches for a global fetch at import.
