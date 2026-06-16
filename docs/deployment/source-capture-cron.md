# Source Capture — scheduling & deployment

The Phase-40B ingestion pipeline runs via a protected cron route:

```
GET|POST /api/cron/source-capture
```

It captures all **due, monitored, active** sources and returns a JSON summary
(`sourcesChecked`, `capturesSucceeded`, `signalsCreated`, `snapshotsCreated`,
`diffsCreated`, …). It is server-only and never auto-publishes.

## Required environment (production / preview)

| Var | Purpose |
| --- | --- |
| `CRON_SECRET` | Authorizes the cron route (min 8 chars). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role writes (RLS-bypassing, server-only). |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | Project URL. |

> Local dev does **not** need cron configured — the route simply isn’t invoked.
> You can still trigger it manually (below) once env is set.

## Option A — Vercel Cron (recommended)

`apps/web/vercel.json` already declares the schedule:

```json
{ "crons": [ { "path": "/api/cron/source-capture", "schedule": "*/30 * * * *" } ] }
```

Vercel invokes the path on schedule (via `GET`) and automatically sends
`Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set on the project.
Set `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` in the Vercel project env, then
deploy. Adjust the cron expression as needed (every 30 min by default).

## Option B — External scheduler (cron / GitHub Actions / systemd timer)

Call the endpoint on your own schedule with the secret in a header:

```bash
curl -fsS -X POST "https://app.humansignalindex.org/api/cron/source-capture" \
  -H "x-cron-secret: $CRON_SECRET"
```

Example crontab (every 30 minutes):

```
*/30 * * * * curl -fsS -X POST "https://app.humansignalindex.org/api/cron/source-capture" -H "x-cron-secret: $CRON_SECRET" >/dev/null 2>&1
```

## Option C — Manual trigger (curl)

```bash
# Bearer (same shape Vercel uses)
curl -fsS "https://app.humansignalindex.org/api/cron/source-capture" \
  -H "Authorization: Bearer $CRON_SECRET"

# Or via query param
curl -fsS "https://app.humansignalindex.org/api/cron/source-capture?secret=$CRON_SECRET"

# Force-capture every active source, ignoring per-source intervals:
curl -fsS "https://app.humansignalindex.org/api/cron/source-capture?secret=$CRON_SECRET&all=true"
```

## Per-source cadence

Each source’s `config.captureIntervalMinutes` controls how often it is due
(default 60 min when unset; the Add-source form defaults watchlists to 720).
A brand-new source has no `last_checked_at`, so it is due on the next run.

## Responses

- `200` — summary JSON (see above).
- `401` — missing/invalid `CRON_SECRET`.
- `503` — `SUPABASE_SERVICE_ROLE_KEY` not configured.
- `500` — unexpected error (the batch itself is defensive per-source).
