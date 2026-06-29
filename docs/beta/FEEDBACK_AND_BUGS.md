# HSI Beta — Feedback Workflow & Bug Severity Model

This describes how feedback and bugs flow during the beta. The intake surfaces are
**real** and persist data; this document does not introduce any new backend.

## Intake surfaces (existing)

- **Bug / issue intake:** `/dashboard/launch/issues` (Beta Issue System). Persists
  to the issue queue; admins triage and update status via the Beta Launch console
  (`/dashboard/beta-launch`).
- **Tester feedback + NPS:** `/dashboard/tester-onboarding` records category,
  message, and an optional 0–10 NPS score.
- **Self-service issue reporting** (beta testers) also records to the issue store
  and can unlock recognition badges.

> No fake persistence: each surface writes to its real store. Where a write fails,
> the user sees a centralized friendly message (never raw SQL) and the detail is
> logged server-side.

## Bug report template

When filing in the Beta Issue System, include:

- **Title** — one line.
- **Severity** — S0–S4 (below).
- **Area / route** — e.g. `/dashboard/global-map`.
- **Browser / device** — e.g. Chrome 124 / macOS, Safari / iPhone.
- **Steps to reproduce** — numbered.
- **Expected behavior.**
- **Actual behavior.**
- **Screenshot / link** — public, non-sensitive only.

Triage adds: **priority**, **assigned owner**, and **status** (open → triaged →
in-progress → resolved → closed), tracked in the issue queue.

## Feature requests

File as **S4 (Enhancement)** with the problem you're trying to solve and the
expected outcome. Enhancements are collected for [`RC2_PLANNING.md`](./RC2_PLANNING.md);
they do not block the beta.

## Bug severity model (S0–S4)

| Code | Level | Definition | Examples | Beta action |
|------|-------|-----------|----------|-------------|
| **S0** | Critical | Security exposure, data loss, or outage | Auth bypass, RLS hole, service down, secret leak | Halt stage, roll back, fix immediately |
| **S1** | High | A core workflow is blocked; no workaround | Sign-in fails, signal submission fails, role application FK error | Block stage exit; hotfix |
| **S2** | Medium | Major UI or performance issue; a workaround exists | Broken layout on a key page, slow dashboard, confusing empty state | Fix before GA |
| **S3** | Low | Minor or cosmetic | Spacing, copy typo, icon alignment | Backlog |
| **S4** | Enhancement | UX improvement or feature request | "Add filter X", "clearer onboarding" | RC2 backlog |

### Mapping to the existing severity scale

The Phase-23 plan uses Critical / High / Medium / Low. Mapping:
`S0 → Critical`, `S1 → High`, `S2 → Medium`, `S3 → Low`, `S4 → (new) Enhancement`.
S0 and S1 are **release blockers**.

## SLAs (targets, not guarantees)

- **S0:** acknowledge immediately; mitigate same day.
- **S1:** acknowledge same day; fix before the stage advances.
- **S2:** triage within the stage; fix before GA.
- **S3 / S4:** backlog and review at stage close.
