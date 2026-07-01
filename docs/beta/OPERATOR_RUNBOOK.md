# HSI Beta — Operator Runbook

Production operations checklist for the beta. Every item below reflects what is
**actually** in the repository today; items that are not yet wired are called out
explicitly so operators don't assume capabilities that don't exist. See also
[`../deployment/production-beta-launch.md`](../deployment/production-beta-launch.md).

## Environment variables (source: `apps/web/lib/env/validate-env.ts`)

**Required** (app degrades/warns without these):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

**Optional** (features degrade gracefully when absent):
- `SUPABASE_SERVICE_ROLE_KEY` — **strongly recommended in production.** Without it,
  server-side identity repair (`ensureCurrentAppUser`) cannot create a missing
  `public.users` row and instead returns the friendly "account setup" message;
  org creation and admin invitations also require it.
- `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `PODCAST_INDEX_API_KEY` — provider keys for
  ingestion/enrichment; absent → those providers are skipped.
- `RESEND_API_KEY`, `RESEND_FROM`, `BETA_NOTIFY_EMAIL` — transactional email for the
  beta/demo intake forms (applicant ack + admin notice). Absent → the forms still
  persist and return success, but no email is sent (best-effort).
- `CRON_SECRET` — **required for scheduled work to run.** Cron routes fail closed
  (401) without it; Vercel Cron sends it as `Authorization: Bearer` only when set.

A masked env view is available to admins at `/dashboard/security`. Never expose a
server secret under a `NEXT_PUBLIC_` name (validator flags this).

## Pre-flight checklist

- [ ] **Supabase:** project reachable; migrations applied (audit at
      `/dashboard/launch`); RLS enabled.
- [ ] **Authentication:** Supabase Auth Site URL = production app URL; redirect
      allowlist includes `/update-password` and `/auth/callback`. Verification and
      recovery emails are sent by **Supabase Auth** (see Email below).
- [ ] **Storage:** the `signal-evidence` bucket exists if you want evidence
      attachments (uploads are best-effort; a missing bucket never fails a submission).
- [ ] **Edge Config / feature flags:** runtime flags resolve (`lib/hsi/edge-config`,
      `/api/system/edge-config`, `/api/system/runtime-status`).
- [ ] **Public APIs:** the four read-only endpoints respond and are rate-limited
      (`/api/public/intelligence|trust|transparency|marketplace`).
- [ ] **Source ingestion:** capture pipeline runs (see Cron).
- [ ] **Runtime health:** health endpoints return ok (see Health).
- [ ] **Debug:** confirm `/api/debug/rbac` is **not** reachable in production.

## Cron / scheduled work (source: `apps/web/vercel.json`)

- **Scheduled in `vercel.json` (all four):**
  - `GET /api/cron/source-capture` — every 30 minutes (`*/30 * * * *`).
  - `GET /api/cron/source-monitoring` — hourly at :15 (`15 * * * *`).
  - `GET /api/cron/agents` — every 15 minutes (`*/15 * * * *`).
  - `GET /api/cron/uptime` — every 10 minutes (`*/10 * * * *`).
  Vercel's scheduler invokes them via **GET**. Sub-daily schedules require a
  Vercel paid/Team plan.
- All cron routes require the cron secret (Bearer / header / query via
  `isCronAuthorized`, constant-time, fail-closed) and return a graceful 503 when
  `SUPABASE_SERVICE_ROLE_KEY` is missing.

## Health & monitoring

- **Health endpoints:** `/api/health/supabase`, `/api/health/rest`,
  `/api/health/auth`, `/api/health/storage`, `/api/system/health`.
- **Dashboards:** `/dashboard/launch` (readiness + migration audit + connectivity),
  `/dashboard/operations`, `/dashboard/security` (env, access telemetry, health),
  platform auditor (admin self-check).
- **Error reporting:** a global error boundary (`app/global-error.tsx`) plus an
  in-house observability report endpoint (`/api/observability/report`,
  `lib/infra/observability.ts`). No third-party APM is configured by repo env;
  do not claim external uptime/APM that isn't wired.
- **Logs:** server logs go through the platform host (Vercel) console; structured
  via `logError(context, error)`.

## Email

- **Transactional auth email** (verification, password recovery) is sent by
  **Supabase Auth**. Configure templates + SMTP in the Supabase dashboard.
- **Resend (beta/demo intake email) IS wired** — `/api/beta/apply` and
  `/api/demo/request` validate → **persist** (`persistBetaApplication` /
  `persistDemoRequest`) → **email best-effort** via `sendEmail`
  (`lib/email/resend.ts`): an acknowledgement to the applicant and, when
  `BETA_NOTIFY_EMAIL` is set, an admin notice. When `RESEND_API_KEY`/`RESEND_FROM`
  are absent the forms still persist and return success, but no email is sent —
  so verify the Resend env before relying on notifications.

## Rollback

1. **App:** Vercel → Deployments → promote the previous known-good production
   deployment (instant rollback). No rebuild required.
2. **Data:** Supabase Point-in-Time Recovery / backups for data regressions (verify
   PITR is enabled before Stage 1).
3. **Feature flags:** disable a problematic surface via Edge Config runtime flags
   (e.g. the global map flag) without redeploying.
4. **Comms:** pause invitations in `/dashboard/beta-launch`; record the incident as
   an S0/S1 issue.

## Go / No-Go

Go only when: build+tests green, required env present, `SUPABASE_SERVICE_ROLE_KEY`
set, health endpoints ok, PITR/backups verified, `/api/debug/rbac` 404 in prod, no
open S0/S1.
