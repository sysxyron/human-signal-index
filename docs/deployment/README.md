# HSI Deployment Guide

End-to-end deployment of Human Signal Index: GitHub → local setup → Supabase →
migrations → Vercel → Cloudflare → worker cron → admin → hardening → backups.
Commands assume Windows (PowerShell) where noted; bash equivalents are given.

Reference env vars: [`README.md`](../../README.md) §8.
Security model: [`../security/README.md`](../security/README.md).

---

## 1. GitHub setup

```bash
git init
git add .
git commit -m "Initial HSI scaffold"
git branch -M main
git remote add origin https://github.com/<org>/human-signal-index.git
git push -u origin main
```

- Create a **private** repo `human-signal-index`.
- Enable **branch protection** on `main`: require PR review, status checks, and
  linear history.
- Add a `.gitignore` that excludes `.env`, `node_modules`, build output, and the
  bundled `pnpm-win-x64.exe` if not needed in CI.
- Never commit secrets. Confirm `.env` is ignored before the first push.

## 2. Local setup

```bash
# Enable pnpm (or use the bundled pnpm-win-x64.exe on Windows)
corepack enable

pnpm install            # install all workspaces
cp .env.example .env    # PowerShell: Copy-Item .env.example .env
# Fill in .env (see README §8)

pnpm dev                # run web + worker
```

Requirements: Node 20 LTS+, pnpm 9+.

## 3. Supabase project setup

1. Create a Supabase project (choose a region close to your reviewers).
2. In **Project Settings → API**, copy the project URL and the `anon` and
   `service_role` keys.
3. In **Project Settings → Database**, copy the connection strings:
   - **Pooled** (port 6543) → `DATABASE_URL`
   - **Direct** (port 5432) → `DIRECT_URL`
4. Create **separate projects** for development and production.

## 4. Supabase environment variables

Set these (locally in `.env`, and later in Vercel + the worker host):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server/worker only
DATABASE_URL=postgresql://...:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://...:5432/postgres
```

> The service-role key must **never** be exposed to the browser or committed.

## 5. Database migrations + seed

Apply migrations **in order** `0001 → 0004`, then seed.

```bash
# Option A: Supabase CLI (recommended)
supabase link --project-ref <ref>
supabase db push                         # applies all migrations in order

# Option B: psql, explicit order
psql "$DIRECT_URL" -f supabase/migrations/0001_init.sql
psql "$DIRECT_URL" -f supabase/migrations/0002_rls_and_policies.sql
psql "$DIRECT_URL" -f supabase/migrations/0003_indexes_constraints.sql
psql "$DIRECT_URL" -f supabase/migrations/0004_storage_buckets.sql

# Seed taxonomy + neutral sample signals
pnpm seed                                # scripts/seed.ts
# or: psql "$DIRECT_URL" -f supabase/seed/seed-data.sql
```

| Migration | Effect |
| --- | --- |
| `0001_init.sql` | Creates the base tables. |
| `0002_rls_and_policies.sql` | Enables RLS + admin/reviewer/viewer policies. |
| `0003_indexes_constraints.sql` | Adds indexes/constraints and the `captures` table. |
| `0004_storage_buckets.sql` | Creates `evidence`, `uploads` (private) and `public-report-assets` (public-read) buckets + storage policies. |

Verify RLS is enabled and the evidence/uploads buckets are **not** public.

### 5a. WorldForge migrations (Phase 2)

Apply the WorldForge migration **after** `0001 → 0004`, then run its seed.

```bash
# Supabase CLI: `supabase db push` already applies 0005 in order.
# psql, explicit:
psql "$DIRECT_URL" -f supabase/migrations/0005_worldforge.sql

# WorldForge demo seed (Earth Reference + Chronid Prime, public worlds)
psql "$DIRECT_URL" -f supabase/seed/worldforge-seed.sql
```

| Migration | Effect |
| --- | --- |
| `0005_worldforge.sql` | Creates the 7 WorldForge tables (`worlds`, `simulations`, `simulation_versions`, `scenarios`, `counterfactuals`, `world_timelines`, `simulation_provenance`), their indexes, the `simulation_is_public()` helper, RLS, and `updated_at` triggers. |

The seed is idempotent (guarded `NOT EXISTS` checks) and safe to re-run. See
[`../architecture/WORLDFORGE.md`](../architecture/WORLDFORGE.md) for the schema and
[`../methodology/WORLDFORGE-SCIENCE.md`](../methodology/WORLDFORGE-SCIENCE.md) for the model.

## 6. Vercel deployment (apps/web)

1. Import the GitHub repo into Vercel.
2. **Root directory:** repo root; framework preset **Next.js**; the monorepo build
   is driven by Turborepo. Build command `pnpm build`, output handled by Next.
3. Add **all** environment variables from README §8 in
   **Project → Settings → Environment Variables** (Production + Preview):
   - Public: `NEXT_PUBLIC_*`
   - Server: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`,
     `AI_PROVIDER`, `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, `SENTRY_DSN`,
     `CLOUDFLARE_TURNSTILE_SECRET_KEY`, `CRON_SECRET`, `UPLOAD_MAX_MB`,
     `TRACEABILITY_MIN_CONFIDENCE`.
4. Deploy. Confirm the public site and dashboard render and that API routes work.

## 7. Cloudflare DNS / WAF setup

**DNS records** (proxied / orange-cloud):

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `www` | Vercel (`cname.vercel-dns.com`) |
| CNAME | `app` | Vercel |
| CNAME | `api` | Vercel |
| CNAME | `@` (apex) | Vercel apex target / redirect to `www` |

**SSL/TLS:** Full (strict). **Always Use HTTPS:** on. **HSTS:** enable with
includeSubDomains + preload.

**Recommended WAF rules:**

| Rule | Action |
| --- | --- |
| Bot Fight Mode / managed bot rules | Challenge automated traffic. |
| Rate limiting on `/api/*` and intake routes | Block/throttle above threshold per IP. |
| Block known-malicious ASNs / Tor exit if appropriate | Managed lists. |
| Challenge non-GET on public forms without Turnstile token | Managed/custom rule. |
| Geo/anomaly rules for `app.*` admin routes | Extra challenge for admin paths. |
| OWASP managed ruleset | On (tune to reduce false positives). |

## 8. Subdomain strategy

| Subdomain | Purpose | Audience |
| --- | --- | --- |
| `www.humansignalindex.org` | Public marketing + published reports + transparency pages | Public |
| `app.humansignalindex.org` | Authenticated dashboard (12 sections) + admin | Reviewers/admins |
| `api.humansignalindex.org` | API routes + cron entry points | Programs/worker |

Apex (`humansignalindex.org`) redirects to `www`. Set cookies for the dashboard
scoped to `app.` only.

## 9. Worker cron jobs

The worker (`apps/worker`) runs the pipeline jobs. Authenticate every invocation
with `CRON_SECRET` (bearer header); reject otherwise.

**Option A — Vercel Cron** (`vercel.json` schedules hitting `api.` cron routes):

```json
{
  "crons": [
    { "path": "/api/cron/poll-sources",   "schedule": "*/30 * * * *" },
    { "path": "/api/cron/capture-pages",  "schedule": "15 * * * *" },
    { "path": "/api/cron/process",        "schedule": "30 * * * *" },
    { "path": "/api/cron/source-changes", "schedule": "0 3 * * *" },
    { "path": "/api/cron/security-monitor","schedule": "*/10 * * * *" }
  ]
}
```

**Option B — External scheduler** (cron, GitHub Actions, or a managed scheduler)
calling the worker endpoints with the `CRON_SECRET` bearer.

Pipeline order: `poll-sources → capture-pages → extract → classify → score-risk →
trace-audit`; plus `source-changes` and `security-monitor` on their own cadence
(see [`../architecture/README.md`](../architecture/README.md) §6).

## 10. Admin account creation

1. Create the user in **Supabase → Authentication → Users** (or via sign-up).
2. Ensure a matching `users` row exists.
3. Grant the admin role:

```sql
insert into user_roles (user_id, role_id)
values (
  (select id from users where email = 'admin@humansignalindex.org'),
  (select id from roles where name = 'admin')
);
```

4. Enroll **MFA (TOTP)** for the admin account before going live.
5. Verify the admin can reach all 13 dashboard sections and that a fresh `viewer`
   account cannot reach private evidence.

## 11. Security hardening checklist

Run before launch (full table in [`../security/README.md`](../security/README.md) §12):

- [ ] RLS enabled on all tables; evidence/uploads buckets not public.
- [ ] Service-role key server-only.
- [ ] MFA required for admin + reviewer.
- [ ] Signed upload URLs + MIME/size validation; `UPLOAD_MAX_MB` enforced.
- [ ] Turnstile on public forms; rate limiting on `/api/*`.
- [ ] `CRON_SECRET` enforced on worker entry points.
- [ ] Security headers (CSP/HSTS/X-Frame-Options/etc.) deployed.
- [ ] Cloudflare WAF rules active.
- [ ] Audit logging append-only + admin-read verified.
- [ ] Automated backups enabled + a restore tested.
- [ ] Sentry + OpenTelemetry wired.

## 12. Backup & export process

1. Enable Supabase **automated backups** (production tier).
2. Schedule periodic logical exports:
   ```bash
   pg_dump "$DIRECT_URL" -Fc -f hsi-backup-2026-06-06.dump
   ```
3. Export Storage buckets (evidence/uploads handled under access controls;
   chain-of-custody preserved).
4. Archive `supabase/migrations` + `seed` with each release tag.
5. **Test restores** into a scratch project on a regular cadence.
6. Store backups encrypted with least-privilege access; log exports in `audit_logs`.

## 13. Adding the two design reference images

Place the source-of-truth images (do not rename):

```
docs/design/references/hsi-full-design-system-reference.png
docs/design/references/hsi-marketing-homepage-reference.png
```

After adding them, align `docs/design/README.md` and the homepage to the visuals.
See [`../design/references/README.md`](../design/references/README.md).

## 14. Updating colors / components safely

Tokens are the single source of truth — change them in one place, not ad hoc:

1. **Color / radius / spacing tokens:** edit `apps/web/tailwind.config.ts` (theme
   extension) and the token layer in `packages/ui`. Keep token **names** stable;
   change their values.
2. **Components:** edit shared components in `packages/ui/src`; consuming apps pick
   up changes automatically.
3. **Do not** hardcode hex values in feature code — reference tokens.
4. Update `docs/design/README.md` to match, and verify against the reference images.
5. Run `pnpm lint` and `pnpm build`; visually check both `www` and `app` surfaces.

> The design tokens, Tailwind config, and `packages/ui` are owned by other agents —
> coordinate changes there; this guide documents the safe procedure.
