# Phase 24B — Identity & Access Management (IAM)

**Status:** ✅ Complete · web + worker typecheck green · build green (125 pages,
+4 admin routes) · 2,258 tests passing (0 fail) · route audit green · smoke test
green. **A new beta tester can now be onboarded end-to-end through the HSI UI** —
no Supabase dashboard, no manual SQL.

No intelligence/simulation/forecasting/publishing/governance/security engines were
modified. Existing RBAC rules and middleware were not changed. No route was made
public; no service-role key reaches the client.

---

## 1. Architecture

```
Admin (role=admin)  →  /dashboard/admin/{users,teams,testers,access-logs}  (admin-only)
                          │  Server Actions ('use server')  →  lib/admin DAL (server-only)
                          ▼
   requireAdmin() (canonical role resolver)  ──►  every op is admin-gated + audited
                          │
        ┌─────────────────┼──────────────────────────────┐
        ▼                 ▼                               ▼
 auth.admin.invite   public.user_roles            public.team_members
 (service role,      (role assignment —            (membership — Phase 24
  server-only)        NEVER JWT/metadata)           schema, unchanged)
        │                 │                               │
        └────────► public.users.status (0028)  +  security_audit_events (audit)
```

- **Identity** comes from Supabase Auth (`auth.users`). Inviting a user calls
  `supabase.auth.admin.inviteUserByEmail()` with the **service-role client**,
  used only in `lib/admin/guard.ts → getServiceClient()` (server-only, dynamic
  import, key never exposed).
- The existing **0006 trigger** mirrors the new `auth.users` row into
  `public.users` (same id) and grants the default `viewer`. The invite action then
  sets `status='pending'` and assigns the chosen role/team.
- **Role** is decided by `public.user_roles → roles` (the Phase-22A canonical
  source) — the IAM console writes there, never the JWT or user metadata.

## 2. User lifecycle (migration 0028)

`public.users.status ∈ { pending, active, suspended, disabled }` (default
`active`; existing users unaffected). Transitions enforced in `setUserStatus`:

```
pending ──approve──► active ──suspend──► suspended ──activate──► active
   │                   │                                            
   └──disable──► disabled ◄──disable── (active / suspended) ──activate──► active
```

Every transition is admin-only and audited (`USER_APPROVED`, `USER_SUSPENDED`,
`USER_REACTIVATED`, `USER_DISABLED`).

## 3. Invite workflow

1. Admin opens **Users → Invite user** (modal: email, role, team, optional message).
2. `inviteUserAction` → `inviteUser()` (admin-gated): `auth.admin.inviteUserByEmail`
   → set `status='pending'` → assign role (`user_roles`) → assign team
   (`team_members`) → audit `USER_INVITED` + `ROLE_ASSIGNED` + `TEAM_ASSIGNED`.
3. Invitee receives the email, sets a password (`/auth/callback`), signs in, and
   sees an **AccountStatusBanner** ("pending approval") until an admin approves.
4. Admin approves → `status='active'`.

## 4. Role workflow

`assignRole(userId, role)` replaces the user's `user_roles` with the selected role
(delete + insert), validated against the 5-role ladder, audited `ROLE_ASSIGNED`.
The per-row role dropdown in the Users console calls it. RBAC + RLS continue to
read the same `user_roles → roles` source, so app and DB agree immediately.

## 5. Team workflow

On the existing `public.team_members` table (Phase 24, schema unchanged):
`addTeamMember`, `removeTeamMember`, `assignTeamLead` (demotes the current lead,
promotes the chosen member). Audited `TEAM_ASSIGNED` / `TEAM_REMOVED`.

## 6. Audit workflow

Every IAM action writes `public.security_audit_events` via
`recordSecurityAudit()` (user_id, event_type, severity, route, message, metadata).
Event types: `USER_INVITED`, `USER_APPROVED`, `USER_SUSPENDED`,
`USER_REACTIVATED`, `USER_DISABLED`, `ROLE_ASSIGNED`, `TEAM_ASSIGNED`,
`TEAM_REMOVED`. Surfaced read-only at **/dashboard/admin/access-logs**.

## 7. Security model

- **Admin-only**: every read and write in `lib/admin/*` calls `requireAdmin()`
  (canonical role resolver) before doing anything; the four pages also gate
  server-side with `isAdmin(role)`. `/dashboard/admin` is already an admin prefix
  in the RBAC map + middleware (unchanged).
- **Service-role key**: read only on the server, only in `getServiceClient()`,
  only for `auth.admin.*`. Never imported by a client component; never in a
  `NEXT_PUBLIC_` var; never returned to the browser.
- **All privileged operations** run as Server Actions (`lib/admin/actions.ts`,
  `'use server'`). No client code calls admin APIs.
- **Roles** are stored in the database (`user_roles`), never JWT/metadata.
- Invitations require `SUPABASE_SERVICE_ROLE_KEY`; absent → a clear
  `NOT_CONFIGURED` message (no insecure fallback).

## 8. Files created

**Migration:** `supabase/migrations/0028_user_status_iam.sql` (adds `users.status`
+ index; add-only).

**DAL (`apps/web/lib/admin/`):** `guard.ts`, `users.ts`, `roles.ts`, `teams.ts`,
`testers.ts`, `access-logs.ts`, `view.ts`, `actions.ts`.

**Components (`apps/web/components/admin/`):** `AdminNav.tsx`, `UsersConsole.tsx`
(table + Invite modal + status/role actions), `TeamsAdmin.tsx`, `AdminTables.tsx`
(Testers + Access Logs), `AccountStatusBanner.tsx`.

**Pages:** `app/dashboard/admin/{users,teams,testers,access-logs}/page.tsx`.

**Docs:** `docs/PHASE_24B_IAM_REPORT.md`.

## 9. Files modified

- `packages/shared-types/src/index.ts` — IAM view-models (`AdminUserRow`,
  `AdminUsersData`, `AdminTeamsData`, `AdminTestersData`, `AdminAccessLogsData`,
  `InviteStats`, `UserStatus`, …).
- `packages/ui/src/navigation.tsx` — new **Administration** sidebar group (Users,
  Teams, Testers, Access Logs) + icons.
- `apps/web/lib/navigation/routes.ts` — admin route registry entries.
- `apps/web/lib/launch/migration-audit.ts` (+ test) — register 0028.
- `apps/web/app/dashboard/layout.tsx` — render `AccountStatusBanner`.
- `apps/web/app/dashboard/launch/page.tsx` — Tester-invitation stats section.

## 10. Route inventory (new)

| Route | Access | Purpose |
| --- | --- | --- |
| `/dashboard/admin/users` | admin | User console: list, invite, approve/suspend/activate/disable, assign role |
| `/dashboard/admin/teams` | admin | Team membership + leads |
| `/dashboard/admin/testers` | admin | Read-only tester metrics + readiness |
| `/dashboard/admin/access-logs` | admin | `security_audit_events` viewer + filters |

All four are covered by the existing `/dashboard/admin` admin prefix in the RBAC
map (no RBAC change required); the route-audit confirms they resolve.

## 11. Verification results

| Gate | Result |
| --- | --- |
| `tsc` web / worker | ✅ 0 errors |
| `pnpm --filter web build` | ✅ 125 pages (+4 admin) |
| Full test suite | ✅ 2,258 / 2,258 |
| Route audit | ✅ 0 missing (83 registry + 60 sidebar) |
| Production smoke test | ✅ 0 fail (migrations 0001→0028 present) |
| Navigation visibility | ✅ Administration group renders; RBAC gates access (non-admins bounce with the AccessDeniedNotice, like Security/Settings) |
| RBAC / governance / engines | ✅ unchanged |

**Functional test coverage (logic-level):** invite → pending; approve → active;
suspend/reactivate/disable transitions are validated by `setUserStatus`’s
transition map; role assignment writes `user_roles`; team add/remove/lead write
`team_members`; all emit audit events. (Runtime browser flow requires a configured
Supabase project + service-role key; offline, every page renders a labeled demo.)

## 12. Remaining risks

- **Enforcement of `pending` is informational, not hard-blocking.** New users see
  the AccountStatusBanner and admins approve them, but the middleware was
  intentionally **not** modified (per the hard constraints), so a `pending`/
  `suspended` user is not redirected away from pages their role allows. Hard
  enforcement at the middleware layer is a clean, additive follow-up (a status
  gate alongside the role gate) and is the recommended next step if pending users
  must be blocked outright.
- **Invitations require the service-role key** on the server; without it the Users
  console shows a clear NOT_CONFIGURED message rather than failing silently.
- `auth.admin.listUsers` is used to surface "last login"; for very large user
  bases this should paginate (currently `perPage: 1000`).
- Tester activity counts read `created_by`/`reviewer_id` best-effort; if a table
  is absent the count degrades to 0 (no crash).
