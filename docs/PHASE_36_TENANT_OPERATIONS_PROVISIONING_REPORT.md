# Phase 36 — Tenant-Aware Operations & Organization Provisioning

**Status:** ✅ Complete · web + worker + engine typecheck 0 errors · build green
(191 routes, +6) · **2,520 tests passing (0 fail, +5)** · route audit green (114
registered / 87 sidebar) · smoke green (migrations 0001→0040) ·
**no RBAC / IAM / middleware / auth / user_roles changes; service role server-only.**

Completes the Phase-35 org architecture: writes are org-scoped, the worker computes
per organization, orgs self-provision, invitations work, and analytics/health are
tenant-aware — with platform-admin oversight retained.

---

## 1. What was built
- **Org stamping (A)** — `getCurrentOrganizationId()` threads the caller's org into
  new records: signal create stamps `hsin_signals.organization_id`; the contribution
  recorder stamps `contribution_events.organization_id`. (Helper is the standard for
  remaining create paths.)
- **Org-aware DAL (B)** — `getCurrentOrganization()` / `getCurrentOrganizationId()`
  (wrap `requireOrganization`); all new org-scoped reads/writes use them.
- **Org-aware worker (C)** — `runOrgSnapshots()` recomputes org-scoped leaderboards
  from org-stamped `user_contribution_stats` and writes per-org
  `leaderboard_snapshots` (tenant-isolated). NEVER writes `user_roles`.
- **Org leaderboard (D)** — `/dashboard/org/leaderboard` (contributors/reviewers/
  researchers/authorities/impact), org-scoped only.
- **Org creation (E)** — `/dashboard/org/create`: create org → assign creator as
  owner → audit → auto-switch workspace (server-only service-role provisioning).
- **Invitations (F) + acceptance (G)** — `organization_invitations` (token + role +
  expiry); `/org/invite/[token]` validates (token + email + expiry) and joins via a
  server-only, token-gated service-role action that assigns ORG membership + audits.
- **Org analytics (H)** — `/dashboard/org/analytics` (members/investigations/
  publications/outcomes/avg trust/avg authority).
- **Org health (I)** — `/dashboard/org/health` (active contributors, review +
  publication throughput, governance activity, worker freshness).
- **Admin oversight (J)** — `/dashboard/admin/organizations` extended with
  investigations alongside members/publications/status (read-only).

## 2. Migration summary
`supabase/migrations/0040_tenant_operations_provisioning.sql` (add-only):
`organization_invitations` (+RLS: org-admin/platform-admin manage, invitee reads
own via `auth.jwt()->>'email'`); and a DO-loop adding `organization_id` + default
backfill + index + **RESTRICTIVE** isolation policy to `contribution_events`,
`trust_events`, `attribution_ledger`, `outcome_events`, `user_contribution_stats`,
`leaderboard_snapshots`. Migration audit: 0001→0040 ✅.

## 3. Files

**Created**
- `apps/web/lib/org/invitations.ts` (pure) + `invitations.test.ts` (4 tests)
- `apps/web/lib/org/operations.ts` (context, create, invites, leaderboard, analytics, health)
- `apps/web/components/org/OrgCreateForm.tsx`, `InviteAccept.tsx`
- `apps/web/app/dashboard/org/{create,leaderboard,analytics,health}/page.tsx`
- `apps/web/app/org/invite/[token]/page.tsx`
- `supabase/migrations/0040_tenant_operations_provisioning.sql`
- `docs/PHASE_36_TENANT_OPERATIONS_PROVISIONING_REPORT.md`

**Modified**
- `apps/web/lib/contributor/recorder.ts` — stamp `organization_id`
- `apps/web/lib/signals/actions.ts` — stamp signal `organization_id`
- `apps/web/lib/org/organizations.ts` — admin oversight + investigations count
- `apps/worker/jobs/contributor-network-worker.ts` (+ `.test.ts`) — per-org snapshots
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts` — org nav
- `apps/web/app/dashboard/admin/organizations/page.tsx` — investigations column
- `apps/web/lib/launch/migration-audit.ts` (+0040) + `migration-audit.test.ts`

## 4. Security review (L)
- **No cross-org write leakage** — RESTRICTIVE RLS on every tenant + ops table
  (`org_id IS NULL OR is_admin() OR is_org_member(org_id)`); the pure `scopeToOrg`
  mirror is unit-tested (org1 never sees org2).
- **No privilege escalation** — `membership_role` is org-scoped; member management
  requires org-admin or platform admin; invite acceptance is token + email + expiry
  gated and assigns membership only.
- **No `user_roles` modifications** — verified (no writes in org code; the only
  reference is `loadHighestRole` reads for the platform-admin check).
- **No service-role exposure** — service role is used only inside `'use server'`
  actions (org create + invite accept, the established IAM pattern); no service
  client in any component; client components call server actions only.
- **All actions audited** — `organization_audit_log` records create / invite /
  accept / member changes (append-only).

## 5. Verification results (M)

| Item | Result |
| --- | --- |
| Migration | `0040_tenant_operations_provisioning.sql` |
| Tests added | 5 (invitation rules + per-org worker) |
| Full test suite | ✅ **2,520 / 2,520**, 0 fail |
| Web / worker / engine typecheck | ✅ 0 errors |
| Build | ✅ compiled (191 routes) |
| Route audit | ✅ 114 registered / 87 sidebar resolve |
| Migration audit / smoke | ✅ 0001→0040, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 6. Remaining gaps for Phase 37
- **Complete write-path stamping** — signals + contribution_events are stamped; the
  remaining create paths (publications, evidence, investigations-create, missions,
  badges, trust/attribution writes done by the worker) should adopt
  `getCurrentOrganizationId()` so NO new record is NULL-org. The worker (service
  role) writes are global today; per-org stamping in the worker's recompute is next.
- **Per-org full recompute** — the worker writes per-org leaderboard snapshots; a
  full per-org trust/authority/impact recompute (vs the global pass) is the next
  step now that org_id is on the source tables.
- **Analytics trendlines** — current metrics are point-in-time; time-series growth
  needs periodic org snapshots (snapshot table + worker history).
- **Email delivery** — invitations create a token + record; wiring the actual email
  (reusing Phase-24B IAM `auth.admin`/SMTP) is a follow-up (no email sent this phase).
- **Org settings/branding** — per-org CMS/branding (logo, theme) layered on the
  Phase-34 CMS scoped by org is a natural Phase-37 addition.
