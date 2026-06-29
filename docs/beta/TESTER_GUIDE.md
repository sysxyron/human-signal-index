# HSI Beta — Tester Guide, Checklist & Expectations

Welcome, and thank you for testing Human Signal Index. This guide is the tester's
single starting point for the beta. Every step below maps to a **real** route in
the app.

## What HSI is (and isn't)

HSI organizes public sources into reviewed, traceable findings. It does **not**
auto-publish, auto-moderate, or generate conclusions — humans review everything.
See `/how-hsi-works` and `/docs/concepts`.

## Tester expectations (ground rules)

- Use **non-sensitive, public** information only. Do not submit private or
  personal data.
- No production attacks, load/stress testing, or rate-limit probing.
- Do not share credentials. One account per tester.
- Report what you find — friction, confusion, and bugs are all useful.
- Features marked **Coming Soon** (API keys, SDKs, webhooks, authenticated API)
  are intentionally not available yet; please don't file those as bugs.

## Onboarding checklist

Work top to bottom. Each item should "just work"; if it doesn't, file a bug
(see [`FEEDBACK_AND_BUGS.md`](./FEEDBACK_AND_BUGS.md)).

- [ ] **Create account** — `/sign-up`.
- [ ] **Verify email** — open the verification link from your inbox.
- [ ] **Login** — `/sign-in`.
- [ ] **Password reset** — `/reset-password` → open the email link → set a new
      password at `/update-password` → sign in with it.
- [ ] **Complete profile** — `/dashboard/profile`.
- [ ] **Apply for Contributor** — `/dashboard/apply-role`.
- [ ] **Submit a Signal** — `/submit-a-signal`.
- [ ] **Upload evidence** — attach a public screenshot/link with your submission
      (attachments are best-effort; a missing attachment never fails the submission).
- [ ] **Explore the Global Map** — `/dashboard/global-map`.
- [ ] **Explore the Evidence Graph** — `/dashboard/evidence-graph`.
- [ ] **Explore Documentation** — `/docs`.
- [ ] **Submit Feedback** — beta feedback surface (see below).
- [ ] **Report a Bug** — Beta Issue System, `/dashboard/launch/issues`.

## Where to send feedback and bugs

- **Bugs / issues:** `/dashboard/launch/issues` (Beta Issue System) — this persists
  to the issue queue reviewed by the team.
- **Feedback / NPS:** the tester feedback surface (`/dashboard/tester-onboarding`)
  records feedback and an optional 0–10 NPS score.

Both are backed by real persistence — there is no mock backend. Severity and the
full reporting template are in [`FEEDBACK_AND_BUGS.md`](./FEEDBACK_AND_BUGS.md).

## Roles during beta

Most testers start as **viewer** and may **apply** for higher roles; role grants
remain an admin action (nothing here self-grants a role). The full per-role access
matrix is in [`../BETA_TESTER_ROLE_MATRIX.md`](../BETA_TESTER_ROLE_MATRIX.md).
