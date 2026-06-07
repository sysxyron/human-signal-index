# HSI Security Guide

HSI handles sensitive research evidence and must protect both that evidence and
the people studied. Security is built on **least privilege, strict RLS, an
auditable trail, and the rule that private evidence is never public unless
explicitly published**.

Related: [`THREAT-MODEL.md`](THREAT-MODEL.md) · [`PLATFORM-SECURITY-MONITOR.md`](PLATFORM-SECURITY-MONITOR.md)

---

## 1. Security goals

- Protect raw source evidence and reviewer workflows.
- Enforce role-based access control at the database (RLS) and app layers.
- Guarantee **no public access to private evidence unless it has been published**.
- Maintain an append-only audit trail and security telemetry.
- Harden ingress with Cloudflare WAF and Vercel security headers.
- Make every privileged action attributable.

## 2. Supabase Auth

- Authentication is handled by **Supabase Auth**; app `users` rows link to auth users.
- Sessions use secure, http-only cookies on `app.humansignalindex.org`.
- **MFA-ready:** TOTP enrollment should be required for `admin` and `reviewer`
  accounts before production launch.
- The `SUPABASE_SERVICE_ROLE_KEY` is used **only** server-side / in the worker and
  is never exposed to the browser.

## 3. RLS model (admin / reviewer / viewer)

Row Level Security is enabled on every table (migration `0002`). Helper predicates
(`is_admin()`, `is_reviewer_or_admin()`) drive policies.

| Class | Policy summary |
| --- | --- |
| **Admin** | Full control on all tables. |
| **Reviewer** | Read/write the working set (sources, signals, evidence, transcripts, classifications, risk_scores, reviews, alerts, ai_runs, ai_trace_passages, generated_content, public_reports, source_changes, uploaded_files, comments, captures). |
| **Viewer / anon** | Read `category_taxonomy`, `tags`, and **published** rows only of public-facing tables. |
| **Append-only (auth)** | `audit_logs`, `security_events` — insert allowed, read restricted to admin. |
| **Never public** | `evidence_items`, `transcripts`, `uploaded_files`, `captures`, `ai_runs`, `ai_trace_passages` and the `evidence`/`uploads` storage buckets. |

**No-public-private-evidence rule:** raw evidence has no public read policy.
Material becomes visible to the public *only* by being included in a published
`public_reports` row (and, for assets, by promotion into the public
`public-report-assets` bucket).

## 4. RBAC (application layer)

`packages/security` provides route/server-action guards that mirror RLS:

- `admin` — manage users, roles, taxonomy, sources, settings; everything reviewers can do.
- `reviewer` — intake, evidence, classification, scoring, traceability, review, publish.
- `viewer` — read published reports and approved public surfaces only.

Defense in depth: a request must pass **both** the app guard **and** RLS.

## 5. Signed uploads & file validation

- Uploads use **signed upload URLs** issued server-side; the browser never holds
  the service-role key.
- Enforce `UPLOAD_MAX_MB` (default **250 MB**).
- Validate MIME type and extension against an allow-list; reject executable and
  untrusted binary types.
- Store uploads in the private `uploads` bucket; never auto-publish.

## 6. Rate limiting & bot protection

- Cloudflare Turnstile (`CLOUDFLARE_TURNSTILE_SITE_KEY` /
  `..._SECRET_KEY`) on all public submission forms.
- Rate-limit intake and API routes (per-IP and per-account).
- Cron entry points require the `CRON_SECRET` bearer; reject otherwise.
- Rate-limit trips are emitted as `security_events`.

## 7. Audit logs

- `audit_logs` is append-only and admin-readable. It records policy changes,
  role assignments, review decisions, publish/unpublish, and exports.
- Each entry: actor, action, target, timestamp.
- Audit logs are part of evidence chain-of-custody and must be retained per the
  retention policy in [`../legal-ethics/DATA-HANDLING.md`](../legal-ethics/DATA-HANDLING.md).

## 8. Security headers (Cloudflare WAF-ready + Vercel)

Set on `apps/web` responses (and reinforced at Cloudflare):

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | Strict allow-list; no inline scripts where avoidable. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Minimal; disable unused features (camera, mic, geolocation). |

Recommended Cloudflare WAF rules are listed in
[`../deployment/README.md`](../deployment/README.md) §7.

## 9. Backups & export

- Enable Supabase automated backups; periodically export Postgres and Storage.
- Archive `supabase/migrations` and `seed` with each release.
- Test restores. Exports of evidence follow chain-of-custody and access controls.
- See [`../deployment/README.md`](../deployment/README.md) §12 for the procedure.

## 10. Principle of least privilege

- Grant the minimum role required; default new accounts to `viewer`.
- Service-role key restricted to server/worker.
- Rotate keys/secrets on staff changes and on any suspected exposure.
- Separate production and development Supabase projects.

## 11. Incident response basics

1. **Detect** — alert from the security monitor or a report.
2. **Triage** — classify severity; assign an incident lead.
3. **Contain** — revoke sessions/keys, disable affected accounts, block sources.
4. **Preserve** — snapshot logs and `security_events` (chain-of-custody).
5. **Eradicate & recover** — patch, restore from backup, rotate secrets.
6. **Review** — write a post-incident note in `audit_logs`/docs; update controls.

Full runbook: [`../operating-procedures/README.md`](../operating-procedures/README.md) §7.

## 12. Hardening checklist

| # | Control | Status field |
| --- | --- | --- |
| 1 | RLS enabled on all tables | ☐ |
| 2 | Service-role key server-only (not in client env) | ☐ |
| 3 | MFA required for admin + reviewer | ☐ |
| 4 | Signed upload URLs + MIME/size validation | ☐ |
| 5 | `UPLOAD_MAX_MB` enforced | ☐ |
| 6 | Turnstile on all public forms | ☐ |
| 7 | Rate limiting on intake/API | ☐ |
| 8 | `CRON_SECRET` required on worker entry points | ☐ |
| 9 | Security headers (CSP/HSTS/etc.) deployed | ☐ |
| 10 | Cloudflare WAF rules active | ☐ |
| 11 | Audit logging verified append-only + admin-read | ☐ |
| 12 | No public read on evidence/uploads buckets | ☐ |
| 13 | Automated backups enabled + restore tested | ☐ |
| 14 | Sentry + OpenTelemetry wired | ☐ |
| 15 | Default role = viewer; least privilege reviewed | ☐ |
| 16 | Secret rotation policy documented | ☐ |
