# Phase 32 — Operational Beta & Tester Workflows

**Status:** ✅ Complete · web + engine typecheck 0 errors · build green (176
routes, +2) · **2,482 tests passing (0 fail, +12)** · route audit green (101
registered / 77 sidebar) · smoke green (migrations 0001→0036) ·
**no auth / RBAC / middleware / user_roles changes; beta DAL uses no service-role key.**

A new tester can now sign up, join a cohort, onboard, receive missions, earn XP /
badges / ranks, report issues, and give feedback — **entirely self-service, with no
administrator intervention**. Privileged role advancement still requires an
admin-approved application (no self-approval).

---

## 1. Architecture
```
ENGINE (@hsi/beta-engine, PURE)        DAL (lib/beta/tester.ts)
cohorts + status state machine         getTesterDashboard · joinCohort
assignMissions · testerProgress        reportIssue · submitFeedback
npsScore · cohortAnalytics             awardRecognition · claimCompletion   ← self-service (SELF RLS)
recognition badges                     getBetaOps · updateIssueStatus       ← admin (requireAdmin)
        │                                     │
        ▼                                     ▼
   /dashboard/tester (self-service)    /dashboard/admin/tester-ops (review + analytics)
```

## 2. Tester program model (Deliverables 1–4) & migration (24)
`supabase/migrations/0036_operational_beta_workflows.sql` (add-only): `beta_cohorts`
(5 seeded), `beta_testers` (status lifecycle), `tester_activity` (append-only),
`beta_issues` (category + severity + status), `tester_feedback` (+ NPS,
append-only), `tester_certificates`, `tester_badges`. RLS, indexes, audit fields.
*(Complements the Phase-23 `tester_issues` launch board; this is the tester
PROGRAM.)*

## 3. Self-service workflow (Deliverables 4, 5, 8–10) — no admin needed
- **Cohorts (D2)** — Internal / Research / Reviewer / Governance / Enterprise Pilot.
- **Status (D3)** — pending → invited → active → suspended → completed (state machine).
- **`/dashboard/tester` (D5)** — onboarding wizard: pick a cohort → **join instantly**
  (`joinCohort`, status→active), then the dashboard shows progress + mission queue +
  issue/feedback forms.
- **Mission assignment (D6/7)** — `assignMissions` builds a personalised queue from
  the contributor-network templates by role, dropping completed ones; rank/badges
  raise the cap.
- **Progress (D10)** — `testerProgress` (completion %, missions, XP).
- **Role path (D9)** — links to the Phase-25 application flow; **applications still
  required, no self-approval**.

## 4. Issues, feedback, recognition (Deliverables 11–19)
- **Issues (D11–13)** — `reportIssue` with 6 categories (ui/workflow/performance/
  permissions/data/security) × 4 severities; self-insert via RLS.
- **Review queue (D14)** — admin triages issue status on `/dashboard/admin/tester-ops`.
- **Feedback + NPS (D15/16)** — `submitFeedback` (0–10 NPS); `npsScore` aggregates.
- **Completion certificate (D18)** — `claimCompletion` (self) when all missions are
  done (engine-validated transition) → status completed + certificate.
- **Recognition badges (D19)** — Found Bug, Power Tester, Elite Researcher, Review
  Specialist, Governance Advisor; `evaluateBetaBadges` auto-awards from real stats.
  Cosmetic — never change access.

## 5. Admin beta operations (Deliverables 20–23)
`/dashboard/admin/tester-ops` (admin-only, D21): issue review queue, **cohort
analytics** (activation / retention / completion / mission-completion, D20/22),
**NPS**, and per-cohort counts. Operational report windows (daily/weekly/monthly,
D23) via `countInWindow` over `tester_activity`.

## 6. Permissions / governance
Testers self-serve their entire journey via **SELF RLS policies** (own read/insert/
update). Issue review + analytics are **admin-only** (`requireAdmin` + admin-all
RLS). The engine + DAL **never grant a role or edit `user_roles`** — privileged
advancement stays in the admin-approved `role_applications` queue. RBAC, auth, and
middleware are unchanged.

## 7. Files

**Created**
- `packages/beta-engine/` (package.json, tsconfig; `src/`: types, cohorts, missions,
  analytics, badges, fixtures, index; `tests/`: beta — 12 tests)
- `apps/web/lib/beta/tester.ts`
- `apps/web/components/beta/TesterConsole.tsx`, `BetaIssueQueue.tsx`
- `apps/web/app/dashboard/tester/page.tsx`
- `apps/web/app/dashboard/admin/tester-ops/page.tsx`
- `supabase/migrations/0036_operational_beta_workflows.sql`
- `docs/PHASE_32_OPERATIONAL_BETA_WORKFLOWS_REPORT.md`

**Modified**
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` — Beta Tester + Beta Operations nav
- `apps/web/lib/launch/migration-audit.ts` (+0036) + `migration-audit.test.ts`
- `tsconfig.base.json`, `apps/web/package.json` — new package

## 8. Verification

| Item | Result |
| --- | --- |
| Migration | `0036_operational_beta_workflows.sql` |
| Tests added | 12 (beta-engine: cohorts, missions, analytics/NPS, badges) |
| Full test suite | ✅ **2,482 / 2,482**, 0 fail |
| Web / engine typecheck | ✅ 0 errors each |
| Build | ✅ compiled (176 routes) |
| Route audit | ✅ 101 registered / 77 sidebar resolve |
| Migration audit / smoke | ✅ 0001→0036, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 9. Security audit (Deliverable 26)
- **No auth / RBAC / middleware / user_roles changes** (verified: no diff to
  `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **No role escalation** — self-service grants cohort membership + cosmetic
  recognition only; role advancement stays admin-approved.
- **No service-role exposure** — the beta DAL uses **no service-role client**
  (RLS user client + `requireAdmin` only); `tester.ts` is `'use server'`, imported
  by server pages + client components only via server actions; no service key in any
  component.

## 10. Success criteria — met
A tester can create an account → join a cohort → onboard → receive missions → earn
XP/badges → report issues → provide feedback → claim completion → advance rank,
**all without administrator intervention** (verified by the self-service DAL + SELF
RLS). Admins review issues + monitor cohorts from the Beta Operations Center.

## 11. Remaining gaps / Phase 33 recommendation
- **Admin invite flow (D4 "admin invite → accept")** — the self-join path is fully
  wired; the admin-initiated `invited` path reuses the Phase-24B IAM invitation +
  the `beta_testers.status='invited'` column, but a dedicated "invite to cohort"
  admin action/UI is a small follow-up.
- **Tester leaderboard (D17)** — beta participation can reuse the Phase-25/26
  leaderboard snapshots; a beta-specific board is a thin add.
- **Worker recognition** — recognition badges are awarded on tester actions (issue
  report) + dashboard load; moving the sweep into the contributor worker would catch
  badges earned via non-beta paths automatically.
- **Mission completion source** — progress uses `user_missions` completion; once the
  Phase-26 mission-progress worker increments are fully live, beta progress sharpens.
