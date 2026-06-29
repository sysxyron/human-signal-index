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

- **Beta/demo intake is a placeholder.** `/api/beta/apply` and `/api/demo/request`
  validate and return success but do **not** persist or email (flagged
  `NOT_CONFIGURED` by the platform auditor; `TODO(backend)` in both routes).
  Decide a sink (Supabase table — *requires a migration* — or Resend/CRM webhook)
  before relying on these forms for real lead/applicant capture. Until then, the
  Tester Guide and Operator Runbook state plainly that they don't notify anyone.
- **Production `SUPABASE_SERVICE_ROLE_KEY`.** Operational, not code: confirm it is
  set so `ensureCurrentAppUser` can repair a missing `public.users` row rather than
  degrading to the "account setup" message.

## Medium Priority

- **N+1 in `listOrganizationsAction`** (`apps/web/lib/org/organizations.ts`):
  per-org sequential `count` queries (members/publications/investigations). Fine at
  current scale; batch or aggregate before large org counts.
- **Cron coverage:** only `/api/cron/source-capture` is scheduled in `vercel.json`.
  If `source-monitoring`, `agents`, or `uptime` are meant to run on a schedule, add
  them to `vercel.json` or an external scheduler.

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
