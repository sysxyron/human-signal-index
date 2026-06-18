# Phase 60 — Expanded Beta Launch Operations

The first true **operational** phase: an admin console at `/dashboard/beta-launch`
to run the 25–100 user expanded beta — cohorts, invites, onboarding, feedback,
health, participation, risk, executive summary, and stage tracking — composed from
the existing cached intelligence plus three new operational tables.

**Scope:** additive only. RBAC/IAM/auth/middleware unchanged; no existing
table/column/policy modified; user/contributor/reviewer/publication/source metrics
**reused, not duplicated**. Admin-only.

---

## Architecture

```
NEW tables (migration 0048):           Composed reads (existing, cached):
  beta_cohorts                           getBetaOperations()  → users/roles/health/risk/summary
  beta_cohort_members                    getReleaseReadiness()→ launch-readiness score
  beta_invites                                 │
  beta_invite_events (audit)                   ▼
  beta_feedback                          lib/beta-launch/data.ts  getBetaLaunchData(role)
        │                                      │  (Promise.all + loadBetaLaunchOps)
        ▼                                      ▼
  lib/beta-launch/persistence.ts  ──────► app/dashboard/beta-launch/page.tsx (admin self-gated)
  lib/beta-launch/actions.ts (writes)        ├ ExecutiveSummary (S9)  ├ ProgramOverview (S1)
        ▲ requireAdmin + audit               ├ LaunchStageTracker (S10) ├ BetaHealth (S6)
  client managers (Cohort/Invite/Feedback)   ├ Participation (S7) ├ RiskMonitoring (S8)
                                             ├ OnboardingFunnel (S4)
                                             ├ CohortManager (S2) ├ InviteManager (S3) ├ FeedbackManager (S5)
```

- **Reads:** `loadBetaLaunchOps` uses the service-role-preferred read client; cohort
  invite/member tallies are computed in-memory from two bounded reads (**no N+1**).
  Analytics (overview/health/risk/participation) reuse `getBetaOperations`; the
  readiness score reuses `getReleaseReadiness`.
- **Writes:** server actions gated by `requireAdmin` (the existing IAM guard), using
  the RLS admin client, audited via `recordSecurityAudit`. Feedback submission is
  allowed for **any signed-in user** (RLS owner-insert), not admin-gated.

## Data model (migration 0048 — additive)

| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| `beta_cohorts` | Cohort A/B/C… | name, code, status(active/archived), created_by | admin manage (`is_admin()`) |
| `beta_cohort_members` | Membership | cohort_id, user_id, status; unique(cohort,user) | admin manage |
| `beta_invites` | Invite tracking | email, role, cohort_id, status(pending/accepted/expired/revoked), sent/accepted/expires | admin manage |
| `beta_invite_events` | Invite audit log | invite_id, event(sent/resent/revoked/accepted/expired), actor_id | admin manage |
| `beta_feedback` | Structured feedback | user_id, category(8), title, body, status(open/reviewing/planned/completed) | admin manage + **owner insert/read** |

All tables: RLS enabled; FKs to `public.users`; indexed on status/category/cohort.
No existing schema touched.

## Screens (10 sections)

1. **Program overview** — total/active/new users + role counts + growth & participation sparklines.
2. **Cohort management** — create / archive / assign; per-cohort invited/accepted/active/retention.
3. **Invitation management** — sent/pending/accepted/expired/revoked; send/resend/revoke; audit log.
4. **Onboarding center** — funnel (account → signal → review …); tracked steps + honest "Not tracked yet" for un-instrumented ones.
5. **Beta feedback** — 8 categories, submit (any user), admin status workflow (open→reviewing→planned→completed).
6. **Beta health** — DAU/WAU/retention/churn ("—" until session analytics), signals/reviews/publications, traceability.
7. **Research participation** — aggregate role activity counts only (no ranking, no gamification).
8. **Beta risk monitoring** — low participation, review bottlenecks, coverage gaps, publication delays, traceability (reuses beta risk engine).
9. **Executive summary** — growth / participation / trust / quality / risk / readiness score → "How is the beta performing?".
10. **Launch readiness tracking** — Stage 1–4 by user count + readiness score + next milestone.

## Security model

- **Admin-only** page (self-gated `isAdmin`) + middleware enforcement
  (`PROTECTED_ROUTES` `/dashboard/beta-launch` → admin) + `NAV_VISIBILITY` admin +
  sidebar entry (Launch & Beta). Nav-visibility test asserts curator/reviewer can't
  see it; admin can.
- All writes `requireAdmin`-gated + audited; feedback submit is owner-scoped via RLS.
- No public access; no service-role key reaches the client.

## Metrics tracked

Reused (no duplication): total/active/new users, role distribution, signals/reviews/
publications, traceability, source health, risk flags, readiness score. New: per-
cohort invited/accepted/active/retention; invite status tallies + audit; feedback
status tallies; onboarding funnel (account/signal/review tracked; login/profile/
publication-view marked not-yet-instrumented).

## Beta workflow

Invite (tracked) → accept → assign to cohort → onboard (funnel) → participate
(signals/reviews) → submit feedback → admin triages feedback + monitors health/risk →
stage tracker shows progression toward the next cohort milestone.

## Operational runbook

1. **Open a cohort:** Cohort management → create "Cohort A".
2. **Invite testers:** Invitation management → send invite (email + role + cohort);
   resend/revoke as needed; every action is in the audit log.
3. **Assign accepted users:** paste user id → assign to cohort.
4. **Watch onboarding:** funnel shows where testers drop (account → first signal →
   first review).
5. **Triage feedback:** move items open → reviewing → planned → completed.
6. **Monitor health & risk:** Beta health + Risk monitoring; the executive summary
   answers "how is the beta performing?" at a glance.
7. **Advance cohort:** Launch readiness tracking shows the current stage + readiness
   score + the milestone to reach before widening.

> Invite **email delivery** integrates with the existing IAM invite system as a
> follow-up; this phase ships the operational tracker + audit (no auth changes).

---

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json` — **clean (exit 0)**.
- `tsx --test` (chunked) — **2671 / 2671 pass, 0 fail** (+1 new nav test).
- `next build` (apps/web, clean `.next`) — **exit 0, "Compiled successfully"**; `ƒ /dashboard/beta-launch` → 4.19 kB (117 kB first load).

(The repo has no `pnpm typecheck`/`pnpm test` scripts; canonical commands above.)

---

## Files

**Added**
- `supabase/migrations/0048_beta_launch.sql` — cohorts/members/invites/invite-events/feedback + RLS.
- `apps/web/lib/beta-launch/persistence.ts` — reads (no N+1) + admin writes.
- `apps/web/lib/beta-launch/actions.ts` — server actions (requireAdmin + audit; owner feedback).
- `apps/web/lib/beta-launch/data.ts` — composed read model + stage logic.
- `apps/web/components/beta-launch/{panels,CohortManager,InviteManager,FeedbackManager}.tsx`.
- `apps/web/app/dashboard/beta-launch/page.tsx` — admin console.
- `docs/PHASE_60_EXPANDED_BETA_LAUNCH.md` — this report.

**Changed (additive)**
- `lib/security/rbac-audit.ts` (+`/dashboard/beta-launch` admin gate), `packages/ui/src/nav-roles.ts` (+visibility/inventory), `packages/ui/src/navigation.tsx` (+sidebar item), `packages/ui/tests/nav-roles.test.ts` (+test).

---

## Success criteria — met

An admin can answer, without leaving the platform: **how many beta users?** (overview),
**who is active?** (active/role counts + participation), **who dropped off?** (onboarding
funnel), **where is onboarding failing?** (funnel dropoff), **what feedback is arriving?**
(feedback center), **what risks exist?** (risk monitoring), **ready for the next cohort?**
(stage tracker + readiness score).
