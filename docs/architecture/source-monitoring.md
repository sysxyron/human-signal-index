# Source Monitoring

> How HSIN captures, hashes, versions, and tracks the health of **public** sources.

## Provider architecture

`@hsi/source-intelligence` routes a source to a capture provider by its `source_type`:

| Source type | Provider | Network? |
|-------------|----------|----------|
| `website`, `forum`, `youtube`, `tiktok` | `websiteProvider` (public-page fetch) | live-gated |
| `rss`, `podcast` | `rssProvider` (`parseRssFeed`) | live-gated |
| `document` | `documentProvider` (pasted/uploaded text) | offline |
| `manual` | manual submission (no capture) | offline |

Providers are **pluggable and gated**: each exposes `enabled()` and never throws —
failures surface in the `CaptureResult`. Offline runs inject a `FixtureCaptureProvider`
that serves canned docs by URL, so the entire flow runs deterministically with **no
network**.

### Public-only capture (binding)

Capture is restricted to PUBLIC surfaces. The engine's capture policy
(`assertPublicCapturePolicy`) guards every capture; we never authenticate, never bypass
paywalls, never enter private communities. The web pipeline only attempts **live**
capture when `SIGNAL_CAPTURE_MODE=live` **and** the source has a usable URL — otherwise
it runs the fixture provider. See `apps/web/lib/signals/config.ts`.

## Hashing, versioning & change detection

* **Hashing**: every capture produces a stable `content_hash` (sha-256 hex, or a labeled
  `fnv1a-` fallback). It de-dupes signals and powers fast change detection.
* **Versioning**: `persistSignalFromDraft` writes `hsin_signal_versions` (an immutable
  `snapshot_json` at `version_number`). Re-observing the same `content_hash` appends a
  **new version** + a `source_changed` event rather than duplicating the signal.
* **Change detection** (`detectChange`): compares a prior capture to the new one:
  * `null` prior → `new`
  * identical hash/text → `none`
  * similarity `< 0.6` → `major` (raises a `source_changed` alert)
  * otherwise → `modified`

## Source health

Each capture writes a `hsin_source_health` row (status, response time, last
success/failure, failure count). The DAL surfaces the **latest** observation per source
in `SourceWithStats.health` and aggregates the latest-per-source status in
`IntelligenceOverview.sourceHealthSummary`. Failed captures record a `status='error'`
health row and a `failed` capture job; successes record `status='ok'`.

## Capture jobs (provenance)

Every `runSourceIntake` opens a `hsin_capture_jobs` row (`running`), then closes it
`success` or `failed` with `started_at`/`finished_at`/`error_message`. The signal detail
view surfaces a source's recent capture jobs as provenance.

## Worker jobs & scheduling

The worker has **no internal scheduler**; an external scheduler (Vercel Cron or system
cron, guarded by `CRON_SECRET`) invokes each job. Every job has an **injected** loader /
persister (default no-ops) so it runs DB-free offline, and uses the fixture engine unless
live is configured.

| Job (`name`) | Cadence (`schedule`) | What it does |
|--------------|----------------------|--------------|
| `sourceMonitor` | `0 6 * * *` (daily) | Capture non-RSS sources; detect change; classify + alert. Honors per-source `cadence` (hourly/daily). |
| `rssMonitor` | `0 * * * *` (hourly) | Fetch + `parseRssFeed`; `diffRssFeeds`; draft signals for new items. |
| `signalClassifier` | `*/15 * * * *` | Classify unclassified signals (deterministic lexicon). |
| `driftDetector` | `0 */6 * * *` | Compare snapshots; `detectNarrativeDrift`; persist drift + alerts. |
| `alertGenerator` | `*/10 * * * *` | Scan recent signals against watchlists; persist explainable alerts. |

> **Service role**: server-side monitoring jobs may use the Supabase `service_role` key
> (which bypasses RLS) for polling/capture/fan-out. User-facing writes always go through
> the per-request, cookie-backed client and are authorized by RLS (`created_by` /
> `reviewer_id = auth.uid()` + role predicates). Never expose `service_role` to clients.
