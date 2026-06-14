# Phase 25 — Contributor Intelligence Network

**Status:** ✅ Complete · web typecheck 0 errors · worker typecheck 0 errors ·
build green (161 routes, +7) · **2,373 tests passing (0 fail, +66)** · route audit
green (151 pages) · smoke test green (migrations 0001→0029) ·
**no RBAC/auth/governance/publishing regressions, no role escalation, no service-role exposure.**

HSI is now a governed contributor network: **XP = activity · Reputation = quality ·
Trust = access · Badges = achievement · Ranks = progression · Missions = purpose ·
Investigations = work · Governance = control.**

---

## 1. Core governance guarantee
Progression never grants access. The RBAC role ladder
(`viewer < researcher < reviewer < curator < admin`) is **unchanged**. No new DB
role was added — **"Contributor" is a viewer-path RANK**, not a role. Access only
changes when an **admin approves an application** and assigns a real role through
the existing IAM (`assignRole`), which can never assign `admin`. The migration
enforces this: `role_applications.requested_role` has a CHECK that **excludes
admin**, and RLS lets a user move their own application only to `withdrawn` —
never to `approved`. The worker recomputes recognition but **never writes
`public.user_roles`** and never auto-approves an application or investigation.

## 2. Purpose onboarding (Deliverables 1–3)
`/dashboard/onboarding/purpose` asks "What brings you here?" with the five paths
(Observer / Contributor / Researcher / Reviewer / Organization applicant).
Everyone stays **viewer**; non-observer paths create a `pending` `role_applications`
row. Admins review at `/dashboard/admin/applications` (added to the admin nav):
approve / reject / request-more-info, with optional role + team assignment on
approve. Every review is audited to `security_audit_events`.

## 3. XP · Reputation · Ranks · Badges · Credits (Deliverables 4–8)
The pure engine **`@hsi/contributor-network`** holds the logic (66 unit tests):
- **XP** (`xp.ts`) — append-only ledger; spec values (signal +10/+25, evidence
  +50, investigation +75/+100, review +40, publication +100, governance +75);
  corrections append an `adjustment` (never edit history).
- **Reputation** (`reputation.ts`) — five 0–100 quality scores, **independent of
  volume** (proven by test), each **explainable** (weighted factors).
- **Ranks** (`ranks.ts`) — the five spec ladders. Advancement needs XP +
  reputation + required badges; high ranks are `requiresAdminApproval` and the
  engine **caps progress below them until an admin grants the level** (tested).
- **Badges** (`badges.ts`) — the 10 spec badges with measurable thresholds;
  `evaluateBadges()` reports what's earned + the metric/value that earned it.
- **Intel Credits** (`credits.ts`) — append-only recognition ledger (**not money**
  this phase).

## 4. Missions & profile identity (Deliverables 9–11)
- `/dashboard/missions` — role-scoped weekly missions with live progress, XP +
  credit rewards, and status (`not_started`→`claimed`). Read-only; the worker
  grants rewards on claim.
- `/dashboard/profile` enhanced with **contribution identity**: rank, XP, intel
  credits, reputation, badges, activity stats, and **next-rank requirements**
  (answers "Who am I? What have I contributed? What's next? How do I advance?").
- `/dashboard/badges` — full catalog with earned/locked state.

## 5. Investigation workflow (Deliverables 12–19)
- New tables `investigations` + `investigation_events` (append-only timeline) +
  `investigation_assignments` / `investigation_reviews` /
  `investigation_governance_decisions` / `investigation_publication_readiness`.
- Lifecycle engine (`investigation.ts`): `intake → research → evidence_collection
  → review → escalated → governance → publication_ready → published → archived`,
  with rework + escalation edges; **every transition requires an actor + reason
  and emits an auditable event — no silent state changes** (tested).
- `/dashboard/investigations` enhanced with a **workflow buckets panel** (active,
  assigned, awaiting review, escalated, publication-ready). Detail at
  `/dashboard/investigations/workflow/[id]` shows summary, status, owner, team,
  the **read-only publication-readiness checklist**, the timeline, and role-aware
  actions: researchers **claim/release/submit**; reviewers **approve / return /
  request evidence / escalate** (comment required); reviewer+ record **governance
  decisions** (rationale required). Publishing stays governed by the existing
  publication workflows.
- `/dashboard/governance-queue` (reviewer+) surfaces escalated / in-governance
  investigations.

## 6. Teams & leaderboards (Deliverables 20–21)
`team_contribution_metrics` + `leaderboard_snapshots`. `/dashboard/leaderboard`
offers all five views. Rankings are **quality-weighted** — built on accepted
contributions + reputation, with rejected signals penalised, so **spam never
climbs** (proven by tests). Raw submissions are never counted.

## 7. Database (Deliverable 22)
`supabase/migrations/0029_contributor_intelligence_network.sql` — **17 tables**
(role_applications, user_xp_ledger, user_reputation_scores, user_ranks, badges,
user_badges, intel_credit_ledger, mission_templates, user_missions,
investigations, investigation_events, investigation_assignments,
investigation_reviews, investigation_governance_decisions,
investigation_publication_readiness, team_contribution_metrics,
leaderboard_snapshots). Add-only; RLS, indexes, FKs, audit fields, `set_updated_at`
triggers on mutable tables (append-only ledgers carry none). RLS model: personal
rows → owner-read + admin-all (worker writes via service role); catalog →
authenticated-read + admin-write; investigation work tables → researcher+ R/W;
decision tables → researcher+ read, reviewer+ write; leaderboards → researcher+
read. *(Note: the migration is numbered 0029 because 0028 is already the IAM
migration; the spec's "0028" name would have collided.)*

## 8. Worker (Deliverable 23)
`apps/worker/jobs/contributor-network-worker.ts` (hourly) recomputes missions,
badge eligibility, rank progress, reputation, leaderboards, and team metrics —
offline-safe (demo computation when no service-role env) and registered in the
jobs index. **No automatic privileged role promotion; never writes user_roles.**

## 9. Navigation (Deliverable 24)
Role-aware additions: a **Contributor** group (Missions / Badges / Leaderboard —
all signed-in roles), **Governance Queue** (reviewer/curator) in Workflow, and
**Applications** (admin) in Administration. Visibility is wired in
`packages/ui/src/nav-roles.ts` (`NAV_VISIBILITY` + `ALL_NAV_HREFS`); hidden menus
are UX only — RBAC still gates every route.

## 10. Files

**Added — engine** `packages/contributor-network/` (package.json, tsconfig,
`src/`: types, xp, reputation, credits, badges, ranks, missions, investigation,
leaderboard, fixtures, index; `tests/`: 9 suites, 66 tests).

**Added — web** `app/dashboard/onboarding/purpose/`, `app/dashboard/missions/`,
`app/dashboard/badges/`, `app/dashboard/leaderboard/`,
`app/dashboard/governance-queue/`, `app/dashboard/admin/applications/`,
`app/dashboard/investigations/workflow/[id]/`; `lib/contributor/` (options,
profile, applications, missions, leaderboard, governance, investigations);
`components/contributor/` (PurposeForm, ApplicationsConsole, WorkflowActions).

**Added — worker** `apps/worker/jobs/contributor-network-worker.ts`.

**Added — docs** `docs/PHASE_25_CONTRIBUTOR_INTELLIGENCE_NETWORK_REPORT.md`,
`supabase/migrations/0029_contributor_intelligence_network.sql`.

**Modified** `packages/shared-types/src/index.ts` (row + identity types);
`packages/ui/src/navigation.tsx` + `nav-roles.ts` (nav); `apps/web/lib/navigation/
routes.ts` (registry); `apps/web/lib/security/rbac-audit.ts` (governance-queue +
investigation-workflow protection); `apps/web/lib/launch/migration-audit.ts`
(+0029); `apps/web/app/dashboard/profile/page.tsx` +
`app/dashboard/investigations/page.tsx` (enhancements);
`components/admin/AdminNav.tsx`; `apps/worker/jobs/index.ts`;
`apps/web/package.json` + `apps/worker/package.json` + `tsconfig.base.json`
(new workspace package); `migration-audit.test.ts` (count 28→29).

## 11. Verification

| Gate | Result |
| --- | --- |
| Engine tests | ✅ 66 / 66 |
| Web typecheck | ✅ 0 errors |
| Worker typecheck | ✅ 0 errors |
| `pnpm --filter web build` | ✅ 161 routes (+7 Phase-25) |
| Full test suite | ✅ **2,373 / 2,373**, 0 fail (+66) |
| Route audit | ✅ 151 pages, every registered + sidebar route resolves |
| Smoke test | ✅ migrations 0001→0029, 90 routes, 66 sidebar links (0 fail) |
| RBAC audit | ✅ new restricted routes gated; ladder unchanged |
| `pnpm --filter web lint` | ⚠️ pre-existing ESLint-v9 flat-config incompatibility (not a gate; tsc/build/tests are) |

**Governance checks:** no RBAC/auth/middleware regressions · no role escalation
without admin approval (DB CHECK + RLS enforced) · publishing/governance engines
unchanged · service-role used only server-side in the worker · no spam reward
(quality-weighted boards).

## 12. Remaining risks / follow-ups (Phase 26)
- **Aggregate contribution feeds.** XP/reputation/badge inputs (accepted signals,
  verified sources, reviews, reports per user) are not yet wired from the signal /
  review / publishing subsystems into the ledgers. The engine, schema, worker, and
  UI are ready; Phase 26 should connect the producers (emit XP/credit ledger rows
  and refresh `user_reputation_scores` / `team_contribution_metrics` from real
  events) — currently the worker recomputes from whatever is present and the
  profile/leaderboard show labeled demo data offline.
- **Mission progress tracking.** `user_missions.progress` needs incrementing as
  users do work, and reward grant on claim should write the XP/credit ledgers.
- **Investigation ↔ Phase-20 unification.** The Phase-25 workflow `investigations`
  table is intentionally separate from the Phase-20 collective `hsin_investigations`;
  a future phase may unify them or cross-link.
- **Intel credits → value.** Credits are recognition only; bounties/grants are out
  of scope by design.
- **Rank auto-grant.** Approval-gated rank advancement is surfaced as eligibility;
  an admin UI to grant `user_ranks.granted_level` is a small follow-up.
