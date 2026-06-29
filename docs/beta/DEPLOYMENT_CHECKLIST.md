# HSI Production Deployment Checklist (Milestones 86–90)

Operator-facing, evidence-based checklist for promoting HSI to the public beta in
production. Every item maps to a real surface in the repository — nothing here is
aspirational. Run top-to-bottom; gate Stage 1 of the
[`ROLLOUT_PLAN.md`](./ROLLOUT_PLAN.md) on the **Required** sections passing.

> Verify live status from `/dashboard/platform-audit`, `/dashboard/security`,
> `/dashboard/launch`, and `/dashboard/beta-launch` after deploy — those compute
> the same checks this list describes.

---

## 1. Environment variables (Required)

Validated by `lib/env/validate-env.ts` (`validateStartupEnv`) and surfaced in
`/dashboard/security` + auth diagnostics. **Required** keys block startup health;
**optional** keys degrade a feature gracefully when absent.

### Required (app will warn / not function until set)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (https, not the local placeholder).
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (not `anon-placeholder-*`).
- [ ] `NEXT_PUBLIC_APP_URL` — canonical app origin (used for links/SEO/canonicals).

### Recommended for full production behavior
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — **server-only.** Enables: intake persistence
      (beta/demo forms), `ensureCurrentAppUser` self-repair, cron jobs, live DB
      health probe. Without it, intake degrades to **validate-only** (forms still
      succeed but nothing is stored) and cron endpoints return 503.
- [ ] `CRON_SECRET` — authorizes the scheduled cron endpoints (`isCronAuthorized`).
      Without it the cron routes fail closed (401).

### Optional — transactional email (Resend, Milestone 87)
- [ ] `RESEND_API_KEY` — **server-only**, enables outbound email.
- [ ] `RESEND_FROM` — verified sender (e.g. `Human Signal Index <noreply@humansignalindex.org>`).
- [ ] `BETA_NOTIFY_EMAIL` — inbox that receives new beta-application + demo notices.
- [ ] `DEMO_NOTIFY_EMAIL` — optional; demo notices fall back to `BETA_NOTIFY_EMAIL`.

> With Resend unset, `sendEmail` returns `{ ok:false, skipped:true }` and the forms
> still succeed — email is strictly best-effort.

### Secret-exposure guard (Required)
- [ ] No server secret is exposed via a `NEXT_PUBLIC_*` name. `validateStartupEnv`
      flags any `NEXT_PUBLIC_*SERVICE_ROLE*/SECRET/PRIVATE/API_KEY`. Confirm
      `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` are **not** public.

---

## 2. Database migrations (Required)

- [ ] Apply migrations through `0059_beta_demo_intake.sql` (adds `beta_applications`
      + `demo_requests`). Idempotent — safe to re-run.
- [ ] Confirm RLS is **on** for both new tables with admin-only policies and **no
      public insert** policy (inserts are service-role only). Verify in
      `/dashboard/platform-audit` → "Database migrations" = PASS.
- [ ] `public.is_admin()` helper exists (referenced by the new policies; created in
      earlier migrations).

---

## 3. Beta / demo intake backend (Milestone 86)

- [ ] `/api/beta/apply` and `/api/demo/request` persist to Supabase and send email
      (was a placeholder before this milestone). Verify a test submission appears in
      `/dashboard/beta-launch/intake`.
- [ ] Duplicate submissions from the same email within 24h are collapsed (dedup
      window in `lib/beta-intake/persistence.ts`).
- [ ] Beta signup pause works: toggle `betaSignupOpen` in Edge Config → `/api/beta/apply`
      returns `423 BETA_CLOSED`.
- [ ] Admin queue `/dashboard/beta-launch/intake` is admin-gated (middleware via
      `PROTECTED_ROUTES` `/dashboard/beta-launch` + page self-gate).

---

## 4. Scheduled jobs (Milestone 88)

Declared in `apps/web/vercel.json` `crons`; all are `CRON_SECRET`-gated,
service-role, and fail closed:
- [ ] `/api/cron/source-capture` — `*/30 * * * *` (source capture).
- [ ] `/api/cron/source-monitoring` — `15 * * * *` (hourly telemetry classification).
- [ ] `/api/cron/agents` — `*/15 * * * *` (run due agents).
- [ ] `/api/cron/uptime` — `*/10 * * * *` (uptime probes + incidents).
- [ ] `CRON_SECRET` is set so Vercel's scheduler is authorized (otherwise 401).
- [ ] Cron frequency requires a Vercel **Pro** plan (sub-daily schedules). Confirm plan.

---

## 5. Operational monitoring (Milestone 89)

- [ ] `/dashboard/platform-audit` shows the new **Transactional email**, **Beta/demo
      admin notifications**, **Scheduled jobs**, and **Cron authorization secret**
      indicators (`checkOperationalServices`). Unconfigured email = NOT_CONFIGURED
      (not a failure); scheduled jobs without `CRON_SECRET` = WARNING.
- [ ] **Conversion form backend wired** = PASS once a sink (service-role and/or
      Resend) is configured.
- [ ] `/dashboard/launch` overall = READY; live DB probe + infra subsystem probes green.

---

## 6. Security & hardening (Required — verify, no code change expected)

- [ ] CSP + security headers present (`apps/web/next.config.*`); report-only vs
      enforced as intended for the stage.
- [ ] Rate limiting active on public POST endpoints.
- [ ] Service-role client (`getServiceClient` / `createServiceRoleClient`) is
      imported only in server modules — never in client bundles.
- [ ] No PII (applicant name/email) is logged. Intake routes log scope strings only.

---

## 7. Backup & recovery (Required — operational)

- [ ] Supabase **PITR / backups** enabled; restore drill documented (see
      [`RC2_PLANNING.md`](./RC2_PLANNING.md) → Infrastructure).
- [ ] Supabase Auth **SMTP + email templates** configured for verification/recovery
      (separate from Resend, which is transactional product email).

---

## 8. Pre-promotion gates (Required)

- [ ] `pnpm --filter @hsi/web build` succeeds.
- [ ] `npx tsc --noEmit` clean (run from `apps/web`).
- [ ] `npx tsx --test "lib/**/*.test.ts"` green (run from `apps/web`).
- [ ] Smoke test: submit one beta application + one demo request against production;
      confirm row in `/dashboard/beta-launch/intake` and (if Resend configured) the
      acknowledgement + admin-notice emails arrive.

---

## Rollback

If a Stage gate fails after promotion, follow the rollback in
[`OPERATOR_RUNBOOK.md`](./OPERATOR_RUNBOOK.md): pause beta signup via Edge Config
(`betaSignupOpen=false`), redeploy the previous build, and triage via
`/dashboard/launch/issues`. The intake tables are additive — a rollback of app code
does not require a DB rollback.
