# Phase 40B — Source Ingestion Pipeline Fix

**Status:** implemented
**Scope:** wire automated source ingestion end-to-end (Source → Capture → Snapshot → Diff → Capture Event → Signal → Signals UI).
**Constraints honored:** no changes to RBAC / IAM / auth / middleware / `user_roles` / billing / Stripe. No service-role key in client code. All capture writes are server-side and audited.

---

## 1. Root cause

Phase 40 shipped the Advanced Source Collection framework (validation, capture engines, migration `0044` adding `source_snapshots` / `source_diffs` / `source_capture_events`) but never connected its capture+persistence half to a runtime. The audit found:

- **No writer for the Phase-40 tables.** A repo-wide search showed nothing wrote `source_snapshots`, `source_diffs`, or `source_capture_events` — they were dead schema.
- **Worker capture jobs were placeholders.** `captureSignalsJob` / `captureWorkerJob` / `sourceMonitorJob` were registered with default injected loaders/persisters that return `[]` / `DEMO_SOURCES` / no-op. Real DB wiring existed only in tests.
- **Nothing enqueued capture work**, and the scheduler/queue were disabled-by-default with empty loaders.
- **No production trigger.** There was no `/api/cron/*` route and no Vercel cron config; the worker only ran via `pnpm dev`.

Net effect: after a source row was created, records stopped flowing. The only working path was the manual “Capture now” button (`runSourceIntake`, fixture mode), which also never touched the Phase-40 tables.

Full analysis: see the Phase-40B audit in the conversation that preceded this report.

---

## 2. What was fixed

New, decoupled, server-side modules (no RBAC/auth/billing touched):

| File | Purpose |
| --- | --- |
| `apps/web/lib/signals/source-capture-persistence.ts` | **Phase-40 DAL** — real writers/readers for the three tables: `createSourceSnapshot`, `createSourceDiff`, `createCaptureEvent`, `listCaptureEvents`, `listSourceSnapshots`, `updateSourceHealth` (+ `touchSourceChecked`, `createSignalFromCapture`, dedupe + telemetry-count helpers). |
| `apps/web/lib/signals/source-capture.ts` | **Capture orchestrator** — DB source loader, per-type routing via `@hsi/source-collectors`, capture → snapshot → diff → signal → event → health. Depends on an injected `CapturePersistence` port (testable); ships a Supabase adapter + a bounded public-only server fetch. |
| `apps/web/lib/cron/auth.ts` | Constant-time `CRON_SECRET` check (Bearer / `x-cron-secret` / `?secret`). Fail-closed. |
| `apps/web/app/api/cron/source-capture/route.ts` | **Protected cron route** — authorizes, builds the service-role client, runs the batch, returns a summary. |
| `apps/web/vercel.json` | Vercel cron schedule (`*/30 * * * *`). |

Changed (additive only):

- `packages/shared-types/src/index.ts` — added `HsinSourceSnapshotRecord`, `HsinSourceDiffRecord`, `HsinSourceCaptureEventRecord`, `SourceCaptureTelemetry`; added optional `capture` to `SourceWithStats`.
- `apps/web/lib/signals/persistence.ts` — `listSources` now attaches per-source capture telemetry (last event + snapshot/diff counts).
- `apps/web/lib/signals/view.ts` — `captureStatusDecor` + `captureExplanation` (never-silent zero-signal reason) + demo telemetry.
- `apps/web/components/signals/SourceTable.tsx` — new Capture / Snap / Diffs columns with the zero-signal explanation.

The service-role client is **reused** from `@hsi/database` (`createServiceRoleClient`) rather than introducing a new one. The DAL is intentionally decoupled from `persistence.ts` (no `next/headers` / `@/` chain) so it is unit-testable under `tsx --test`.

---

## 3. Worker flow

For each **due, monitored, active** source (`hsin_sources.monitoring_enabled = true AND status = 'active'`, due by `config.captureIntervalMinutes` vs `last_checked_at`, default 60 min):

1. **Route** by `source_type` via `@hsi/source-collectors` (`connectorForSourceType`).
2. **Guard** — unknown type → `unsupported` event; foundation type (manual/document/email/api/webhook) → `unsupported` event; missing capture URL → `needs_configuration` event. (Never silent.)
3. **Capture** via `captureForType(...)` with an injected public-only fetch (timeout + max-bytes + UA). Fetch/policy failure → `warning`/`failing` event with the error, health updated, source touched.
4. **Snapshot** — read the prior snapshot, then store a new `source_snapshots` row.
5. **Diff** — compute vs the prior snapshot; store a `source_diffs` row when a prior exists (none on the baseline).
6. **Signals**
   - Feed types (rss/news/research/government/reddit/podcast/intelligence_feed): one signal **per new entry**, deduped by per-entry content hash.
   - Watchlist/page types (watchlist/website/forum/social/archive): a signal **only when the page changed** (never on the baseline).
   - Every signal enters at status `new` with a version 1 + a `captured` event — **never auto-published**.
7. **Capture event** — always write a `source_capture_events` row (status + human reason + items + content_changed).
8. **Health** — write `hsin_source_health` and touch `last_checked_at` / `last_changed_at`.

The batch aggregates: sources checked/skipped, captures succeeded/failed, signals/snapshots/diffs created.

---

## 4. Cron route

`GET|POST /api/cron/source-capture` (runtime `nodejs`, `force-dynamic`, `maxDuration=300`).

- **Auth:** `CRON_SECRET` via `Authorization: Bearer …` (Vercel Cron), `x-cron-secret` (external), or `?secret=` (curl). Missing/wrong → `401`. Missing `SUPABASE_SERVICE_ROLE_KEY` → `503`.
- **Query flags:** `?all=true` ignores per-source intervals and captures every active source.
- **Response:**
  ```json
  {
    "ok": true,
    "runAt": "…",
    "summary": {
      "sourcesChecked": 0, "sourcesSkipped": 0,
      "capturesSucceeded": 0, "capturesFailed": 0,
      "signalsCreated": 0, "snapshotsCreated": 0, "diffsCreated": 0
    },
    "results": [ { "sourceId": "…", "status": "healthy", "signalsCreated": 1, "reason": "…" } ]
  }
  ```

---

## 5. Source telemetry (UI)

The Source Registry (`/dashboard/sources`) now shows per source: **Capture** status badge + a plain-language reason, **Snap** (snapshot count), **Diffs** (diff count), alongside the existing signal count. There is **no silent zero-signal state** — when no signal exists the row explains why:

- *baseline snapshot only* — first capture, no diff yet
- *no content change since the last capture*
- *unsupported source type* (foundation / unknown)
- *missing a valid feed/page URL* (needs configuration)
- *last capture failed: …* (fetch error / blocked)
- *no capture has run yet* — will capture on the next scheduled run

---

## 6. Source-type behavior

| Type(s) | Connector | Behavior |
| --- | --- | --- |
| rss, news, research, government, intelligence_feed, podcast | rss | Parse entries; dedupe by hash; one signal per **new** entry. |
| reddit | rss | Subreddit `.rss` → posts with author; signal per new entry. |
| watchlist, website, forum, social, archive | public_page | Baseline snapshot first; on change → diff + one signal. |
| youtube, tiktok | rss / public_page | Captured via the routed connector. |
| document, manual, email, api, webhook | — | Foundation only → `unsupported` capture event with reason. |

Invalid / unsupported / misconfigured sources always produce a capture event with a clear reason (per Deliverable D).

---

## 7. Security review

- **No service-role key in client code.** The key is read only inside the route handler / DAL (server-only). The browser bundle is unaffected; the Source form still deep-imports only client-safe `@hsi/source-collectors` submodules (validation/types), never `@hsi/source-connectors`.
- **RLS bypass is deliberate and bounded.** Cron has no user session, so it uses the service-role client; every write is **audited** (`source_capture_events`, `hsin_signal_events`, `hsin_source_health`). Signals enter `new` and are never auto-published.
- **Cron is fail-closed.** No/short/wrong secret → denied; constant-time comparison.
- **Public-only capture preserved.** `assertPublicCapturePolicy` runs inside the collectors before any fetch; the server fetch is bounded (timeout + max-bytes) and sends a clear UA.
- **Untouched:** RBAC, IAM, auth, middleware, `user_roles`, billing, Stripe. Migration `0044` is reused as-is (no schema change).

---

## 8. Verification results

- **Targeted tests:** `apps/web/lib/signals/source-capture.test.ts` — **13/13 pass** (`npx tsx --test`): RSS signals + dedupe, watchlist baseline→change, failed/unsupported/misconfigured events, due filtering, batch aggregation, Supabase loader filter, cron auth.
- **Typecheck:** `tsc --noEmit` on `apps/web` — **clean (exit 0)**.
- **Build:** see “Remaining gaps” — `next build` is blocked **only** by a pre-existing, repo-wide ESLint 9 / Next 14.2.5 incompatibility unrelated to this change (compilation/typecheck pass).
- **Migration audit:** no new migration; `0044` already defines the three tables + RLS.
- **Route audit:** new route `app/api/cron/source-capture/route.ts` exports `GET`/`POST`, `runtime='nodejs'`, `dynamic='force-dynamic'`.

---

## 9. Remaining gaps / follow-ups

- **Repo-wide lint is broken** (`next lint` / the build’s lint step throw “Invalid Options: useEslintrc/extensions/…”, an ESLint 9 vs Next 14.2.5 mismatch). Pre-existing; not addressed here. Fix by pinning ESLint 8 or migrating to flat config. Typecheck + tests are the gates used for this phase.
- **`apps/worker` jobs remain offline scaffolding.** The production trigger is now the Vercel cron route (the deployed runtime). The orchestrator is framework-agnostic and can be reused from the worker later; the placeholder worker jobs were left untouched to keep this change contained.
- **Per-entry feed signals have no category/confidence** (set null). A future pass can run `classifySignal` for richer categorization.
- **Narrative-drift + alert generation** from Phase-40 diffs are not yet wired (the Phase-7 `runSourceIntake` path still owns drift). Could be unified later.
- **Robots.txt** is consulted by policy helpers but the server fetch does not yet fetch/honor `robots.txt` per-request.

---

## Deployment & scheduling

See `docs/deployment/source-capture-cron.md`.
