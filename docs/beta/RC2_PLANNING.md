# HSI RC2 Planning

Prioritized list of work to take HSI from RC1 (certified ready for public beta) to
RC2 / GA. **Every item is grounded in repository evidence** observed during the
RC1 audits — nothing here is speculative. Beta-reported issues should be added to
the appropriate bucket as they arrive.

## Release Blockers

- **None at RC1.** RC1 is certified ready for public beta (see
  [`../HSI_1_0_CERTIFICATION.md`](../HSI_1_0_CERTIFICATION.md)). New S0/S1 issues
  filed during the beta (see [`FEEDBACK_AND_BUGS.md`](./FEEDBACK_AND_BUGS.md)) land here.

## High Priority

- **Production `SUPABASE_SERVICE_ROLE_KEY`.** Operational, not code: confirm it is
  set so `ensureCurrentAppUser` can repair a missing `public.users` row rather than
  degrading to the "account setup" message — and so beta/demo intake **persists**
  (without it, intake degrades to validate-only). See
  [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md).

## Resolved (Milestones 86–90)

- **Beta/demo intake is wired.** `/api/beta/apply` and `/api/demo/request` now
  persist to `beta_applications` / `demo_requests` (migration `0059`, service-role,
  dedup-by-email) and send acknowledgement + admin-notice email via Resend
  (best-effort; forms still succeed when unconfigured). Admin queue at
  `/dashboard/beta-launch/intake`. Requires `SUPABASE_SERVICE_ROLE_KEY` (persist)
  and `RESEND_API_KEY`/`RESEND_FROM`/`BETA_NOTIFY_EMAIL` (email).
- **Cron coverage expanded.** `source-monitoring`, `agents`, and `uptime` are now
  scheduled in `vercel.json` alongside `source-capture` (all `CRON_SECRET`-gated).

## Medium Priority

- **N+1 in `listOrganizationsAction`** (`apps/web/lib/org/organizations.ts`):
  per-org sequential `count` queries (members/publications/investigations). Fine at
  current scale; batch or aggregate before large org counts.
- **Cron plan tier:** the four scheduled jobs in `vercel.json` use sub-daily
  schedules, which require a Vercel **Pro** plan. Confirm the plan, or move the
  finer-grained jobs to an external scheduler on Hobby.

## Low Priority

- **No automated accessibility gate** (axe/Lighthouse) in CI. Manual review shows
  good coverage (`aria-*` in shared UI; labeled icon controls); add an automated
  check for ongoing assurance.
- **Build warning:** longstanding `lib/billing/stripe.ts` — *"Critical dependency:
  the request of a dependency is an expression."* Non-blocking; investigate/silence.

## Future Enhancements

- **Public authenticated API** — API keys, SDKs, webhooks, and authenticated/write
  endpoints are documented as **Coming Soon** (`/docs/api`). Building these requires
  schema (API key storage) and is out of scope for a no-migration phase.

## Infrastructure

- Verify Supabase **PITR/backups** before Stage 1; document the restore drill.
- Configure Supabase Auth **SMTP + email templates** for verification/recovery.
- If background cron beyond source-capture is needed, provision an external scheduler.

## Technical Debt

- **Read routing not implemented:** `TODO(read-routing)` / `TODO(read-models)` —
  all reads currently use PRIMARY (`lib/hsi/read-routing.ts`,
  `lib/hsi/public-read-models.ts`). Acceptable for beta; revisit at scale.
- **Error-mapper adoption:** the central domain mapper (`lib/errors/domain-error.ts`)
  is adopted in the contributor lifecycle and org DALs. A few **elevated-user**
  surfaces (investigations, evidence reviews, notifications) still return raw
  `error.message`; adopt `toUserMessage` there for consistency (low risk; not
  contributor-facing).

## How to use this document

At each beta stage close, triage new issues into the buckets above, clear all
**Release Blockers** before advancing, and re-confirm the build/test gates. RC2 is
ready when Release Blockers and High Priority are empty and `/dashboard/launch` =
READY.
