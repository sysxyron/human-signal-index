# Phase 22A — RBAC, Middleware Authorization & Admin Access Repair

**Status:** ✅ Root cause found and fixed · build green · typecheck green ·
**2,052 tests passing (0 fail, +19 new)** · RBAC still fully enforced · no public
exposure · no redirect loops.

---

## 1. Root cause

The database stores roles in `public.user_roles → public.roles` (the chain the
task verified, and the **same** chain every DB RLS helper reads via
`public.current_app_role()`):

```
auth.users.id == public.users.id → public.user_roles.user_id → public.roles.name
```

But the **application layer** resolved the role from a column that **does not
exist**:

```ts
// middleware.ts lookupRole(), lib/supabase/server.ts getSessionRole(),
// and every DAL's local sessionRole():
const { data } = await client.from('users').select('role').eq('id', user.id).single();
return (data?.role as string | undefined) ?? 'viewer';
```

`public.users` is defined (migration `0001_init.sql`) as **`id, email, name,
created_at, updated_at`** — there is **no `role` column**. So PostgREST returned an
error for `select('role')`, the code swallowed it, and **every authenticated user
resolved to `'viewer'`**.

Consequence: the middleware role gate (`requiredRoleForRoute` + `hasRole`) saw
`research@amenxlabs.com` — a real DB **admin** — as a viewer and redirected every
role-gated route to `/dashboard?denied=…`. The DB itself was correct the whole
time; only the app's *role source* was wrong.

This is **not** a JWT-staleness bug: roles were never read from the JWT (no
`app_metadata`/`user_metadata` role claim is used). It was the app querying the
wrong table/column.

---

## 2. Authorization flow

### Before (broken)
```
research@amenxlabs.com
  → sign in → Supabase session cookie (identity OK)
  → middleware.lookupRole()
       → from('users').select('role')   ← column missing → error → 'viewer'
  → requiredRoleForRoute('/dashboard/security') = 'admin'
  → hasRole('viewer','admin') = false
  → redirect /dashboard?denied=/dashboard/security   ← admin locked out
```

### After (fixed)
```
research@amenxlabs.com
  → sign in → Supabase session cookie (identity OK)
  → middleware.lookupRole()
       → loadHighestRole(client, user.id)
           → from('user_roles').select('roles(name)').eq('user_id', id)   ← RLS-safe
           → ['admin'] → highestRole() = 'admin'
  → requiredRoleForRoute('/dashboard/security') = 'admin'
  → hasRole('admin','admin') = true → ALLOW
```

The app role source now **equals** the DB/RLS source, so `is_admin()` (DB) and the
middleware gate (app) always agree.

---

## 3. Findings (as requested)

| # | Question | Finding |
| --- | --- | --- |
| 1 | Middleware role source | Was `public.users.role` (nonexistent column) → always `viewer`. Now `public.user_roles → roles.name`. |
| 2 | Route-guard role source | Same broken `users.role` in `lib/supabase/server.ts` and in **16 DAL `sessionRole()`** copies. All repaired. |
| 3 | Navigation permissions | Sidebar items render unconditionally (they're plain links). The "menu opens but click denies" was the middleware gate seeing `viewer`. Sidebar + middleware now use the same resolver. |
| 4 | Role hierarchy | `viewer(1) < researcher(2) < reviewer(3) < curator(4) < admin(5)` (pure ladder in `lib/security/rbac-audit.ts`, `ROLE_RANK`). `admin` inherits all. Matches the DB's 5-level `has_role()` (migration 0010). |
| 5 | Exact failure point | `middleware.ts → lookupRole() → from('users').select('role')` → `'viewer'` → `hasRole('viewer', required)=false` → `redirect('/dashboard?denied=…')`. |
| JWT | JWT audit | The JWT is used for **identity only** (`auth.getUser()`); no role claim is read from `app_metadata`/`user_metadata`. No stale-claim path exists. A regression test (`promotion reflected without a new token`) locks this in. |

---

## 4. Role source — before vs after

| Layer | Before | After |
| --- | --- | --- |
| `middleware.ts` | `users.role` → `'viewer'` | `loadHighestRole()` → `user_roles → roles` |
| `lib/supabase/server.ts getSessionRole()` | `users.role` → `null` | `loadHighestRole()` |
| 16 × DAL `sessionRole()` | `users.role` → `'viewer'` | `loadHighestRole()` |
| DB RLS (`current_app_role`, `is_admin`, …) | `user_roles → roles` (already correct) | unchanged |

Single canonical resolver now backs all four.

---

## 5. The canonical RBAC helper

**`apps/web/lib/auth/get-session-role.ts`** (new) — edge-safe; statically imports
only types + the pure ladder; the server client is pulled in via a *dynamic*
import so middleware can use the client-taking helpers without dragging
`next/headers` into the edge bundle.

```ts
interface SessionRole { userId: string|null; email: string|null; roles: string[]; highestRole: AppRole|null }

loadUserRoles(client, userId)   // user_roles → roles(name); RLS-safe; never throws
highestRole(roles)              // pure: highest on the 5-level ladder
loadHighestRole(client, userId) // convenience for middleware + DAL gates
getSessionRoleFrom(client)      // identity (getUser) + roles (DB)
getSessionRole()                // server convenience (dynamic-imports the client)
```

**`apps/web/lib/security/rbac.ts`** (new) — the single import surface: re-exports
the pure predicates (`hasRole`, `hasAnyRole`, `requireRole`, `requireAnyRole`,
`requiredRoleForRoute`) + the resolver, plus `sessionHasRole`/`sessionHasAnyRole`.

**RLS safety:** a signed-in user may read their own `user_roles`
(`user_roles_self_read: user_id = auth.uid()`) and the `roles` reference list
(`roles_auth_read`), so the per-request anon-key client resolves roles **without**
the service-role key. JWT proves identity; the DB decides permissions.

---

## 6. Files modified / added

**Added**
- `apps/web/lib/auth/get-session-role.ts` — canonical resolver
- `apps/web/lib/security/rbac.ts` — canonical RBAC surface
- `apps/web/app/api/debug/rbac/route.ts` — **dev-only** diagnostic (404 in prod; no tokens/secrets)
- `apps/web/lib/auth/get-session-role.test.ts` — 19 tests
- `docs/RBAC_MIDDLEWARE_ROLE_AUDIT.md`

**Modified**
- `apps/web/middleware.ts` — `lookupRole()` → `loadHighestRole()`; dev-only role-decision diagnostics (no secrets)
- `apps/web/lib/supabase/server.ts` — `getSessionRole()` → `loadHighestRole()`
- 16 DAL `persistence.ts` (`calibration, causal, collective, decision, executive, forecasting, governance, operations, orchestration, outcome, publishing, security, signals, simulation, temporal, trust`) — local `sessionRole()` → `loadHighestRole()`

No migrations changed. No RLS weakened. No route made public. No middleware bypass.

---

## 7. Diagnostic endpoint

`GET /api/debug/rbac` (development only — returns 404 when `NODE_ENV=production`):

```json
{ "email": "research@amenxlabs.com", "userId": "…", "roles": ["admin"],
  "highestRole": "admin", "source": "public.user_roles" }
```

Verified live (unauthenticated dev request returns the empty session shape with no
crash). Never emits tokens, cookies, or secrets.

---

## 8. Tests added (19)

`apps/web/lib/auth/get-session-role.test.ts`:
- `highestRole`: admin highest · each single role · multiple roles · unknown roles ignored · empty→null
- `loadUserRoles`: embedded-object + array shapes · lower-case/de-dupe · DB error→[] · no roles→[]
- `getSessionRoleFrom`: admin → full session · anonymous → empty · no roles → null
- Route gating: **admin satisfies all 8 previously-denied routes** · viewer denied on all gated (RBAC enforced) · exact minimum per route (settings/security=admin, review/sources/operations=reviewer, simulation/decisions=researcher) · ungated routes need only sign-in
- **Stale-JWT scenario**: role read from DB, promotion reflected without a new token

Plus the existing `rbac-audit.test.ts` ladder tests still pass.

---

## 9. Routes repaired

All eight now admit an admin (verified by `requiredRoleForRoute` + `hasRole('admin', …)`):
`/dashboard/source-registry`, `/dashboard/operations`, `/dashboard/decisions/explorer`,
`/dashboard/review`, `/dashboard/simulation`, `/dashboard/security-monitor`,
`/dashboard/security`, `/dashboard/settings`.

The previously-working (ungated) routes are unaffected — `requiredRoleForRoute`
returns `null` for them, so only a signed-in user is required (confirmed by test).

---

## 10. Verification results

| Check | Result |
| --- | --- |
| `pnpm --filter web build` | ✅ Compiled, 105 pages, middleware built, `/api/debug/rbac` registered |
| `tsc --noEmit -p apps/web` | ✅ 0 errors |
| Full test suite (`npx tsx --test`) | ✅ **2,052 / 2,052** (+19) |
| Route audit | ✅ 0 missing |
| Live dev: `/api/debug/rbac` | ✅ 200, well-formed JSON, no crash |
| Live dev: gated route while signed out | ✅ 307 → `/sign-in` (security preserved) |

**Manual verification for the operator** (requires the configured Supabase env):
sign out → clear session → sign back in as `research@amenxlabs.com` → the eight
routes open with no denial banner. If anything still denies, hit
`/api/debug/rbac` — if `highestRole` is not `admin` there, the **DB assignment** is
the source to check, not the app.

---

## 11. Remaining risks / notes

- **`current_app_role()` ranking quirk (DB, pre-existing):** migration 0002's
  `current_app_role()` ranks only admin/reviewer/viewer; a user whose *only* roles
  are `curator`/`researcher` could be out-ranked by a co-assigned `viewer` at the
  DB-RLS layer. The **app** resolver (`highestRole`) ranks all five correctly, so
  app and DB can disagree for that narrow multi-role case. `admin` is unaffected
  (always rank 1). Out of scope here (no migration changes requested); flagged for
  a future 1-line DB fix to `current_app_role()`'s `order by`.
- **Multiple roles per user** are fully supported (highest wins).
- **Unknown role names** are ignored (treated as below viewer), so a typo can't
  silently grant access.
- The pre-existing edge-runtime warning about `process.version` originates in
  `@supabase/ssr` (which middleware already imported); it is non-fatal and
  unrelated to this change.
