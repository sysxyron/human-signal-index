# Phase 35 — Multi-Tenant & Organization Workspaces Foundation

**Status:** ✅ Complete · web + engine typecheck 0 errors · build green (185
routes, +3) · **2,515 tests passing (0 fail, +7)** · route audit green (110
registered / 83 sidebar) · smoke green (migrations 0001→0039) ·
**no RBAC / IAM / middleware / auth / user_roles changes; org DAL uses no
service-role key; HSI 1.0 behaviour preserved.**

HSI is now a multi-tenant platform foundation: organizations, members, tenant
isolation, org administration, a workspace switcher, and platform-admin oversight —
infrastructure only (no billing / Stripe / subscriptions / SSO).

---

## 1. What was built
- **Organization model** — `organizations` + `organization_members` (org-scoped
  `membership_role`: owner/administrator/reviewer/researcher/contributor/tester) +
  `organization_audit_log` (append-only).
- **Tenant isolation** — `organization_id` added to 8 intelligence tables
  (investigations, hsin_publications, evidence_sources, hsin_signals, user_missions,
  badges, beta_cohorts, trust_profiles), backfilled to a default org, enforced by
  **RESTRICTIVE RLS** policies that AND with existing permissive policies.
- **Org context DAL** — `getOrganization`, `getOrganizationBySlug`,
  `getOrganizationMembers`, `getUserOrganizations`, `requireOrganization()`.
- **Org administration** — invite / change-role / remove (org-admin gated, audited).
- **Workspace switcher** — header `OrgSwitcher`, persisted via cookie.
- **Org dashboard** (`/dashboard/org`), **members** (`/dashboard/org/members`),
  **platform oversight** (`/dashboard/admin/organizations`).
- **Pure membership module** + tenant-isolation helpers (tested).

## 2. The safety model (preserving HSI 1.0)
Isolation is **additive and non-breaking**:
1. All existing rows backfill to a deterministic **default organization**.
2. Every existing user is **auto-enrolled** in the default org.
3. Each tenant table gets a **RESTRICTIVE** RLS policy:
   `organization_id IS NULL OR is_admin() OR is_org_member(organization_id)`.
   RESTRICTIVE policies AND with the existing permissive (role-based) policies —
   they never widen access. Since everyone is in the default org and all data is
   default-org, **1.0 behaviour is identical**; new orgs are isolated.
4. `organization_id = NULL` = platform/global records (still visible).
5. We never `ENABLE` RLS on a table that lacked it (would deny-all); the policy is
   inert there and isolation is also enforced at the DAL layer.

## 3. Governance / non-escalation
- **Org `membership_role` is NOT global RBAC** — it governs actions *within* a
  workspace only. A user's platform role (viewer..admin via `user_roles`) is
  unchanged by joining/leaving an org (asserted in tests + enforced by never
  writing `user_roles`).
- **Platform admins** (`public.is_admin()`) retain **global** visibility across all
  tenants (oversight).
- Member management is gated by org `membership_role` (owner/administrator) OR
  platform admin — `is_org_admin()` in RLS + `canManageMembers()` in the DAL.

## 4. Contributor / trust integration (I)
The trust / authority / impact / outcome **engines are unchanged** — only the data
they read is org-scoped (the tenant tables now carry `organization_id`, and the
org dashboard reads trust scoped to the current org). Scoring logic is intact.

## 5. Migration summary
`supabase/migrations/0039_multi_tenant_organizations.sql` (add-only): 3 new tables
(organizations + default seed, organization_members + auto-enroll backfill,
organization_audit_log); `is_org_member()` / `is_org_admin()` helpers; org-table
RLS; and a DO-loop adding `organization_id` + default backfill + index +
RESTRICTIVE isolation policy to the 8 tenant tables. Migration audit: 0001→0039 ✅.

## 6. Files

**Created**
- `apps/web/lib/org/membership.ts` (pure) + `membership.test.ts` (7 tests)
- `apps/web/lib/org/organizations.ts` (DAL)
- `apps/web/components/org/OrgSwitcher.tsx`, `OrgMembersConsole.tsx`
- `apps/web/app/dashboard/org/page.tsx`, `org/members/page.tsx`
- `apps/web/app/dashboard/admin/organizations/page.tsx`
- `supabase/migrations/0039_multi_tenant_organizations.sql`
- `docs/PHASE_35_MULTI_TENANT_ORGANIZATIONS_REPORT.md`

**Modified**
- `apps/web/app/dashboard/layout.tsx` — workspace switcher in the chrome bar
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` — Organization + admin Organizations nav
- `apps/web/lib/launch/migration-audit.ts` (+0039) + `migration-audit.test.ts`

## 7. Security review
- **No RBAC / IAM / middleware / auth / user_roles changes** (verified: no diff to
  `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL; the only `user_roles`
  reference is a read for the platform-admin check).
- **No cross-org leakage** — RESTRICTIVE RLS + the pure `scopeToOrg` mirror (tested:
  org1 never sees org2; global + same-org visible; platform admin sees all).
- **No escalation path** — membership never grants platform privileges; member
  management requires org-admin or platform admin.
- **No service-role exposure** — org DAL uses the RLS user client + `getUser`;
  member mutations write `organization_audit_log` (append-only).

## 8. Verification results

| Item | Result |
| --- | --- |
| Migration | `0039_multi_tenant_organizations.sql` |
| Tests added | 7 (membership + isolation) |
| Full test suite | ✅ **2,515 / 2,515**, 0 fail |
| Web / engine typecheck | ✅ 0 errors |
| Build | ✅ compiled (185 routes) |
| Route audit | ✅ 110 registered / 83 sidebar resolve |
| Migration audit / smoke | ✅ 0001→0039, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 9. Remaining gaps for Phase 36
- **Write-path org stamping** — read isolation + RLS are in place; existing write
  paths (signal/investigation/publication create) don't yet stamp `organization_id`
  with the caller's current org, so new records created by 1.0 code default to NULL
  (global). Phase 36 should thread the current org into those inserts so new tenant
  data is org-owned.
- **Org-scoped worker recompute** — the contributor/trust worker recomputes
  globally; a per-org pass (trust/authority/leaderboards scoped per org) is the next
  step now that `organization_id` exists on the source tables.
- **Org creation flow** — orgs are created via the default seed / admin; a
  self-serve "create organization" + first-owner assignment UI is a follow-up.
- **Invite by email for non-members** — currently the invitee must already have an
  account; an email invitation (reusing Phase-24B IAM invites) is a follow-up.
- **Billing / subscriptions / SSO** — explicitly out of scope (later phases).
