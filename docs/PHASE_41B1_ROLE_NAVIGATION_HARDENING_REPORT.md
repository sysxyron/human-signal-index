# Phase 41B.1 — Role Experience & Navigation Hardening

**Status:** implemented (extends 41B; navigation/presentation only — no RBAC/RLS/middleware changes)

## Goal

Make the dashboard navigation role-aware so users only see areas they can use. No dead menus, no permission traps, no "Could not load organization" pages reached from the sidebar. Enforcement (middleware + RLS) is unchanged — hidden menus are UX only.

## 1. Role matrix

| Role | Sidebar scope (groups they can see) |
| --- | --- |
| **viewer** | Operations (Mission Control, Source Registry [read], Submit a Signal), Contributor (Missions, Badges, Leaderboard, Authority), Launch & Beta (Beta Tester, Tester Onboarding), Account (My Profile, Apply for a Role). Org group only if a member. |
| **researcher** | + Intelligence, Forecasting, Collective, Trust & Outcomes, WorldForge, Signal Intake, Evidence Vault, Investigations, My Work, Public Reports. |
| **reviewer** | + Review Queue, Submission Queue, Beta Issues Queue, Operations Center, Governance, Publishing Review, Executive read surfaces. |
| **curator** | + Publishing, Retractions, Exec Governance. |
| **admin** | Everything, incl. Administration + System. |

## 2. Navigation matrix (key gates)

Gating lives in `packages/ui/src/nav-roles.ts` → `NAV_VISIBILITY` + `canSeeRoute`/`filterNavGroups`. A route absent from `NAV_VISIBILITY` is visible to all signed-in roles; restricted routes list the roles that see them (admin always).

| Area | Routes | Visible to |
| --- | --- | --- |
| Intelligence (D) | rhetoric-classifier, risk-scoring, traceability-engine, alerts, public-reports | researcher+ |
| Forecasting (E) | forecasts, scenarios, warnings | researcher+ |
| Collective (F) | consensus, debates, contributors | researcher+ |
| Trust & Outcomes (G) | outcomes, trust, calibration | researcher+ |
| WorldForge (H) | worldforge + simulation + all worldforge/* | researcher+ |
| Beta issues queue (C) | launch/issues | reviewer+ |
| Submission queue (41B) | signal-submission | reviewer+ |
| Viewer additions | /dashboard/sources (read), /submit-a-signal, /dashboard/apply-role | all signed-in |

## 3. Visibility rules

- **Role-based** (above) via `NAV_VISIBILITY`.
- **Membership-based (B):** organization pages (`/dashboard/org`, members, leaderboard, analytics, health, settings, branding, billing) are shown **only to org members**. Non-members see only **Create Organization** (when self-service is enabled). Implemented as `ORG_MEMBER_ROUTES` + `filterNavGroups(groups, role, { orgMember, selfServeOrg })`; the dashboard layout computes `orgMember = getUserOrganizations().length > 0`.
- **Empty-state (N):** inaccessible items are hidden from nav; the existing permission pages remain only as a backstop for users who type a URL directly.

## 4. Role advancement model (J/K)

Display-only ladder shown on `/dashboard/apply-role` and as a sidebar role chip:

```
Viewer → Contributor → Researcher → Reviewer → Curator → Admin
```

"Earn trust and apply for advanced roles." Badges/XP may unlock **eligibility**, but never auto-grant researcher/reviewer/curator/admin — those require approval (K). Public signup (I) has **no role selection**; new users are server-assigned `viewer` (unchanged).

## 5. Approval workflow (L)

Reuses the existing audited `role_applications` workflow (`lib/contributor/applications.ts`), now surfaced to users via `/dashboard/apply-role`:

- Any signed-in user **applies** for a path (contributor / researcher / reviewer / organization) with a rationale → `applyForRoleAction` inserts a `pending` row (RLS: own only; `requested_role` never admin).
- Users see their applications + can **withdraw**.
- Admins review at `/dashboard/admin/applications`; on approval the role is assigned via existing IAM (`assignRole`, never admin, never self-assign) and the decision is audited to `security_audit_events`.

Stored: applicant, requested role/path, rationale, status, reviewer, decision timestamp + notes.

## 6. Role visibility indicators (M)

- Sidebar footer shows a **Role: {role}** chip linking to `/dashboard/apply-role`.
- `/dashboard/apply-role` shows the current role + the full ladder with the current step highlighted.

## 7. Security review

- **No RBAC/IAM/middleware/auth/user_roles changes.** Navigation gating is presentation only; every route is still protected by middleware + RLS. Hidden ≠ secured.
- **No service-role key in client code.** The apply path uses the existing server actions (cookie RLS client); approvals are admin-gated + audited.
- **No new permissions granted by nav.** Org gating is membership-derived from `getUserOrganizations()` (read-only).
- Public signup remains viewer-only; advancement is approval-gated.

## 8. Verification results

- **Typecheck (`apps/web`):** clean (exit 0).
- **Nav tests (`packages/ui/tests/nav-roles.test.ts`):** 23/23 pass (viewer/researcher/reviewer/curator/admin visibility + org-membership gating + role-ladder helpers). Existing `role-tasks.test.ts` still passes.
- **Full suite + build:** see the verification run (all green; sidebar routes + `/dashboard/apply-role` registered).
- **Role visibility audit:** see §2 matrix; viewer no longer sees Intelligence/Forecasting/Collective/Trust/WorldForge/Org/Beta-queue/Submission-queue/Admin/System.

## 9. Remaining gaps

- A viewer who *is* an org member will still see org pages (correct), so §A's "viewer = no org group" holds only for the common no-membership case — membership, not role, drives org visibility by design.
- "Report an Issue" is the Beta Tester hub (`/dashboard/tester`), not a separate route, to avoid a duplicate page.
- `selfServeOrg` defaults to enabled; wire it to a real feature flag if org creation should be gated.
- Source Registry for viewers points to the RLS-read-only `/dashboard/sources`; the old placeholder `/dashboard/source-registry` was removed from the sidebar.
- Pre-existing repo-wide `next lint` breakage (ESLint 9 vs Next 14.2.5) is unrelated; typecheck + tests are the gates.
