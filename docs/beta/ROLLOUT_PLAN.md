# HSI Phase 85 — Staged Beta Rollout Plan

Operationalizes a controlled **public** beta on top of the existing internal
validation plan in [`../BETA_TEST_EXECUTION_PLAN.md`](../BETA_TEST_EXECUTION_PLAN.md)
(Phase 23, role-based) and the role matrix in
[`../BETA_TESTER_ROLE_MATRIX.md`](../BETA_TESTER_ROLE_MATRIX.md). This document
adds **cohort-size staging** for external testers. It does not replace those docs.

> No fabricated metrics. The success criteria below are observed via real
> surfaces: `/dashboard/launch`, `/dashboard/launch/issues`, `/dashboard/beta-launch`,
> `/dashboard/security`, the platform auditor, and the health endpoints. Numbers
> are filled in by operators from live data — they are not asserted here.

## Entry gate (applies to every stage)

- `tsc --noEmit` clean, `pnpm --filter @hsi/web build` green, `lib/**` tests green.
- `/dashboard/launch` readiness reachable; no open S0/S1 issues from the prior stage.
- Required env present (see [`OPERATOR_RUNBOOK.md`](./OPERATOR_RUNBOOK.md)).
- Invitations issued via the Beta Launch console (`/dashboard/beta-launch`).

## Stage 1 — Core (5–10 testers)

- **Focus:** authentication, contributor onboarding, signal submission.
- **Walk:** sign up → verify email → sign in → password reset → complete profile →
  apply for Contributor (`/dashboard/apply-role`) → submit a signal (`/submit-a-signal`).
- **Success criteria:**
  - Zero critical (S0/S1) authentication defects.
  - Signal submissions succeed and appear in the reviewer queue.
  - Role applications persist (no FK errors — identity is created by
    `ensureCurrentAppUser()` before the write).
- **Exit gate:** no open S0/S1; ≥3 independent testers complete the core path.

## Stage 2 — Breadth (10–25 testers)

- **Focus:** organizations, Global Map, Evidence Graph, documentation.
- **Walk:** create/join an organization → invite a member → explore
  `/dashboard/global-map`, `/dashboard/evidence-graph`, and `/docs`.
- **Success criteria:** stable workflows, no blocking UI issues, positive onboarding.
- **Exit gate:** no open S0/S1; no S2 UI blocker without a documented workaround.

## Stage 3 — Collaboration & load (25–50 testers)

- **Focus:** performance under moderate concurrency, contributor collaboration,
  reviewer workflows, organization management.
- **Walk:** reviewer triages submissions (`/dashboard/review-queue`); curators
  exercise publishing; org admins manage members.
- **Success criteria:** stable under moderate load; no major workflow blockers.
- **Exit gate:** no open S0/S1; performance observations triaged (see RC2 planning).

## Stage 4 — Launch validation (50–100 testers)

- **Focus:** production readiness, scaling confidence, feedback quality.
- **Success criteria:** no release-blocking defects; RC2 candidate list closed.
- **Exit gate:** `/dashboard/launch` = READY; all S0/S1 resolved;
  [`RC2_PLANNING.md`](./RC2_PLANNING.md) blockers cleared.

## Rollback between stages

Halt invitations and roll back the deployment (Vercel instant rollback to the
previous production deployment) if any **S0** appears or two or more **S1** issues
block the stage's core path. See [`OPERATOR_RUNBOOK.md`](./OPERATOR_RUNBOOK.md#rollback).
