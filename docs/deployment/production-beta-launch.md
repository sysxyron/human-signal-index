# HSI Production Beta Launch — Deployment Guide (Phase 23)

How to deploy the Human Signal Index for an external beta while preserving every
Phase 1–22A governance guarantee.

## Infrastructure

- **Web** (`apps/web`) — Next.js 14 App Router. Deploy to Vercel or Cloudflare
  Pages/Workers. Middleware (`apps/web/middleware.ts`) runs on the edge and gates
  `/dashboard`.
- **Worker** (`apps/worker`) — background jobs (capture, classify, temporal,
  causal, forecast, executive, …) on cron. Deploy as a long-running Node service
  (Railway / Fly / a container) with the service-role key.
- **Database + Auth + Storage** — Supabase project.

## Environment variables

| Key | Where | Required | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | web + worker | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | ✅ | Public anon key (RLS-enforced) |
| `NEXT_PUBLIC_APP_URL` | web | ✅ | Canonical site URL (links/redirects) |
| `SUPABASE_SERVICE_ROLE_KEY` | worker only | ⚠️ | Workers/cron writes. **NEVER** expose to the browser / `NEXT_PUBLIC_`. |
| `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `PODCAST_INDEX_API_KEY` | worker | optional | Degrade gracefully when absent |

The Launch Center and `/dashboard/security` show the live required/optional env
status (masked). `validateStartupEnv` flags any server secret exposed via a
`NEXT_PUBLIC_` name.

## Supabase

1. Create the project; copy URL + anon + service-role keys.
2. Apply migrations **0001 → 0026** in order:
   `supabase db push` (or `supabase migration up`).
3. Verify: `supabase migration list` — or the Launch Center / Security migration
   panel (0001→0026 all "applied").
4. Seed roles + assign an admin:
   ```sql
   insert into public.roles (name) values ('viewer'),('researcher'),('reviewer'),('curator'),('admin')
     on conflict (name) do nothing;
   insert into public.user_roles (user_id, role_id)
     select u.id, r.id from public.users u, public.roles r
     where u.email = 'research@amenxlabs.com' and r.name = 'admin';
   ```
5. RLS is enabled on every table; the helper functions (`is_admin()`,
   `current_app_role()`, …) read `user_roles → roles`. Do not disable RLS.

## Cloudflare

- Put the web app behind Cloudflare. Ensure the auth routes (`/auth/*`,
  `/sign-in`, `/sign-up`) are **not** challenged (the app detects Cloudflare
  challenge pages and surfaces a readable error, but a challenge on the auth POST
  blocks sign-in). Allowlist the Supabase auth callback.
- See `docs/deployment/cloudflare-supabase-auth.md`.

## Authentication

- Supabase Auth (email + password). `public.users.id == auth.uid()` (mirrored by
  migration 0006). Roles come from `user_roles`, never the JWT.
- Middleware: anonymous → `/sign-in` for protected routes; insufficient role →
  `/dashboard?denied=` (visible notice). WorldForge reads are public.

## Storage

- Buckets created by migration 0004. The Launch Center storage probe reports
  health; uploads degrade (not fatal) if storage is unreachable.

## Workers

- Deploy `apps/worker` with `SUPABASE_SERVICE_ROLE_KEY`. Without it, jobs run
  **offline** (fixtures + logs, no writes) — safe but inert. Confirm the worker
  log shows each job registered.

## Cron jobs

- The worker registers jobs on cron schedules (e.g. executive worker hourly
  `0 * * * *`, forecast `*/30 * * * *`). Use the worker's scheduler or an external
  cron trigger. All jobs are fault-isolated, retry-safe, offline-safe, and
  **never** auto-publish / auto-approve / auto-act / auto-govern.

## Backups

- Enable Supabase Point-in-Time Recovery (or daily backups) before inviting
  testers. Export `public.users` + `user_roles` before any role migration.

## Rollback procedure

1. **App:** redeploy the previous build (Vercel/Cloudflare keep prior deployments
   — promote the last green one).
2. **Database:** migrations are **add-only**; to roll back a bad migration, restore
   from PITR/backup to just before it, or write a compensating migration. Never
   edit an applied migration in place.
3. **Roles:** revert a bad role assignment with a `delete from public.user_roles …`.
4. Re-run `pnpm tsx scripts/production-smoke-test.ts` (with `SMOKE_BASE_URL`) to
   confirm the rolled-back state is healthy.

## Tester invitations

1. Create the tester's Supabase auth user (invite email or admin-create).
2. Assign a role via `user_roles` (see the Role Matrix).
3. Send them the Tester Onboarding link (`/dashboard/tester-onboarding`) and the
   Beta Test Execution Plan.

## Launch checklist

- [ ] Migrations 0001→0026 applied (Launch Center / `supabase migration list`)
- [ ] Required env present; no secret exposed via `NEXT_PUBLIC_`
- [ ] Admin assigned + verified (`/api/debug/rbac` in a staging build, or Launch
      Center role panel)
- [ ] `pnpm test` green · `pnpm --filter web build` green
- [ ] `pnpm tsx scripts/production-smoke-test.ts` PASS (set `SMOKE_BASE_URL` for
      live checks)
- [ ] Launch Center recommendation = **READY**
- [ ] Backups / PITR enabled
- [ ] Cloudflare auth routes allowlisted
- [ ] `/api/debug/rbac` confirmed 404 in production
- [ ] Tester accounts created + roles assigned + onboarding sent
