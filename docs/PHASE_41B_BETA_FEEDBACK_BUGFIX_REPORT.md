# Phase 41B — Beta Tester Feedback Bugfix Sprint

**Status:** implemented (stabilization sprint — no new product features)

## 1. Bugs fixed

| # | Report | Status |
| --- | --- | --- |
| 1 | `/public-reports` returns 404 | ✅ route created (public, renders published reports) |
| 2 | Zenodo / DOI links rejected | ✅ accepted + classified (doi.org / zenodo records+doi / arXiv / public web) |
| 3 | Admin cannot delete sources | ✅ admin-only archive (soft delete) + confirm + audit |
| 4 | Source edits don't persist (type/status) | ✅ all editable fields persist; UI refreshes |
| 5 | Submission attachment shows no state | ✅ selected-file UI, type/size validation, best-effort upload |
| 6 | Submission refreshes but creates no visible signal | ✅ real submission → DB → admin review queue |

## 2. Root causes

- **A (`/public-reports`):** the route simply did not exist.
- **B (Zenodo):** Zenodo *DOIs* (`10.5281/zenodo.*`) already matched `DOI_REGEX`, but there was no acceptance path for Zenodo/academic *URLs* at submission. Added a dedicated reference-URL classifier.
- **C (delete):** there was only researcher-level `disableSource`; no admin archive, no confirmation, and `hsin_sources.status` had a CHECK constraint with no `'archived'` value.
- **D (edit persistence):** **two** causes — (1) `updateSource` never wrote `source_type`, and the edit form had no `status` / `monitoring_enabled` controls, so those fields could never change; (2) the signals actions called `revalidatePath('/signals/sources')` etc. — **routes that don't exist** (the real pages are `/dashboard/*`), so the cache was never invalidated after a save.
- **E + F (submission/attachment):** `/submit-a-signal` was a **static marketing page with a dead `<form>`** — no action, no state, a decorative file input. Submitting did a native GET refresh and persisted nothing; the attachment had no state.

## 3. Files changed

**New**
- `supabase/migrations/0046_beta_feedback_fixes.sql` — `'archived'` status + `signal_submissions` table (+ RLS/indexes).
- `apps/web/lib/signals/reference-url.ts` — public/DOI/Zenodo/arXiv URL classifier (pure).
- `apps/web/lib/signals/source-update.ts` — `buildSourceUpdate` field mapping incl. `source_type` (pure).
- `apps/web/lib/signals/submission-validate.ts` — submission + attachment validation (pure).
- `apps/web/lib/signals/submission-persistence.ts` — submission DAL (submit / list / triage).
- `apps/web/lib/signals/submission-actions.ts` — `'use server'` submission actions (FormData).
- `apps/web/lib/signals/beta-fixes.test.ts` — tests for B/D/E/F.
- `apps/web/components/signals/SignalSubmitForm.tsx` — functional submission form.
- `apps/web/components/signals/SubmissionStatusSelect.tsx` — reviewer triage control.
- `apps/web/app/(marketing)/public-reports/page.tsx` — public reports route.
- `apps/web/app/dashboard/signal-submission/page.tsx` — admin/reviewer review queue.

**Changed**
- `apps/web/lib/signals/persistence.ts` — `updateSource` uses `buildSourceUpdate` (writes `source_type` etc.); `listSources` hides `archived` by default; added `archiveSource` (admin + audited); re-exports `UpdateSourcePatch`.
- `apps/web/lib/signals/actions.ts` — fixed revalidate paths to `/dashboard/*`; added `archiveSourceAction`.
- `apps/web/components/signals/SourceForm.tsx` — edit mode adds Status + Monitoring controls (persisted).
- `apps/web/components/signals/SourceRowActions.tsx` — added `ArchiveSourceButton` (admin, confirm prompt).
- `apps/web/components/signals/SourceTable.tsx` — `canArchive` prop + archive button.
- `apps/web/app/dashboard/sources/page.tsx` — passes `canArchive={isAdmin(role)}`.
- `apps/web/components/signals/IntelNav.tsx` — “Submissions” link.
- `apps/web/app/(marketing)/submit-a-signal/page.tsx` — uses `SignalSubmitForm`.
- `packages/shared-types/src/index.ts` — `HsinSourceStatus` adds `'archived'`.

## 4. Signal submission flow

```
/submit-a-signal (SignalSubmitForm, client)
  → validate (observation + optional public/DOI/Zenodo URL + attachment type/size)
  → submitPublicSignalAction(FormData)               [server, audited]
  → submitPublicSignal()                              [DAL, cookie RLS client]
      → requires auth.uid() (any signed-in user incl. VIEWER)
      → INSERT signal_submissions (submitter_id = auth.uid(), status 'pending')
      → best-effort attachment upload (failure ≠ submission failure)
  → success: "Signal submitted for review."
  → admin/reviewer sees it at /dashboard/signal-submission (RLS reviewer+/admin)
      → triage status: pending → reviewing → accepted / rejected
```

A signed-out visitor is shown a clear sign-in prompt (RLS requires `auth.uid()`); no anonymous insert (avoids unauthenticated spam). Submitter identity is stored as `submitter_id` only and is not displayed publicly.

## 5. Source management flow

- **Edit:** SourceForm (researcher+) now edits name, type, URLs, risk, **status**, **monitoring** + config → `updateSourceAction` → `updateSource` (writes all fields via `buildSourceUpdate`) → `revalidatePath('/dashboard/sources')` + `router.refresh()`. Disabled→active reactivation works.
- **Archive (admin):** `ArchiveSourceButton` → confirm (“…keep existing signals and audit history.”) → `archiveSourceAction` → `archiveSource` (admin gate, status `archived`, monitoring off, `security_audit_events` row). Archived sources drop out of the default list; **no** signals/snapshots/events are deleted.

## 6. DOI / Zenodo handling

`classifyReferenceUrl()` accepts public `http(s)` links and classifies `doi.org`/`dx.doi.org` (DOI, extracts `10.x/...`), `zenodo.org` records + `/doi/` URLs (extracts the embedded DOI), `arxiv.org`, and any other public web link. It rejects non-http(s), credentialed, and auth-gated URLs. The submission form labels the reference kind. Tested for `https://doi.org/…`, `https://zenodo.org/records/…`, and `https://zenodo.org/doi/…`.

## 7. Security review

- **No RBAC/IAM/middleware/billing/Stripe/source-ingestion-cron/user_roles changes.** Viewer submission works via a new `signal_submissions` table with RLS (`auth.uid()` insert own; reviewer+/admin read+triage; submitter reads own) — not via a role change.
- **No service-role key in client code.** All writes use the cookie-backed RLS client in server actions/DAL. Archive + submission writes are server-side; archive is audited to `security_audit_events`.
- **Attachment** upload is best-effort and bounded (PNG/JPG/PDF ≤ 25MB validated before send); a missing bucket shows a clear message and never fails the submission.
- **Public-only:** the reference-URL classifier rejects credentialed/auth-gated links. Archive is a soft delete — audit history preserved.

## 8. Verification results

- **Typecheck (`apps/web`):** clean (exit 0).
- **Pure tests (`beta-fixes.test.ts`):** 6/6 pass.
- **Full suite (tracked + new):** see the verification run (all green, no regressions).
- **Build:** `next build` — `/public-reports` and `/dashboard/signal-submission` registered.
- **Migration audit:** `0046` additive (0001–0045 unchanged); reuses `is_admin()` / `is_reviewer_or_above()`.
- **Manual smoke (to run on a configured deploy):** `/public-reports` renders/empties; edit a source (type/status/monitoring persist); archive a source (drops from list, signals kept); submit a signal as a signed-in viewer; see it at `/dashboard/signal-submission` and triage it.

## 9. Remaining tester issues / follow-ups

- **Attachment storage bucket** (`signal-evidence`) is not provisioned — uploads currently show the “not configured” message and submit without the file (by design this phase). Provision the bucket + storage RLS to enable attachments.
- **Anonymous (signed-out) submission** is intentionally not enabled (RLS requires auth) to avoid spam; revisit with captcha/rate-limiting if needed.
- **Promote submission → signal:** accepted submissions are flagged but not yet auto-converted into `hsin_signals` (the `signal_id` link exists for a future promote action).
- Pre-existing repo-wide `next lint` breakage (ESLint 9 vs Next 14.2.5) is unrelated; typecheck + tests are the gates.
