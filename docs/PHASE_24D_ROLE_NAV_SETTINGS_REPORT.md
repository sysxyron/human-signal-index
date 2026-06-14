# Phase 24D — Role-Aware Navigation, Role Tasks & Settings Wiring

**Status:** ✅ Complete · web typecheck green · build green (127 pages, +1) ·
**2,307 tests passing (0 fail, +34)** · route audit green · smoke test green ·
role-aware sidebar verified live. UX-only — **no RBAC, middleware, auth,
governance, engine, or schema changes.**

---

## 1. Role-aware navigation architecture

The decision logic is a **pure, server-safe** module — `packages/ui/src/nav-roles.ts`
(`NAV_VISIBILITY`, `canSeeRoute`, `filterNavGroups`, `ALL_NAV_HREFS`,
`isRestrictedRoute`). It carries no React/DOM, so it's importable by the sidebar,
server pages, and tests alike.

Rendering flow (no flash):
```
app/dashboard/layout.tsx  (SERVER)  ── getSessionRole() ──►  role
        │ passes role
        ▼
DashboardSidebarClient (CLIENT, usePathname)  ──►  <DashboardSidebar role activeHref>
        │
        ▼
DashboardSidebar  ──►  filterNavGroups(dashboardNavGroups, role)  (hides items + empty groups)
```
The layout was converted from a client component to a **Server Component** so the
role is resolved server-side and the correct menus render on first paint. The
active-link highlight moved into the thin client wrapper.

**Security:** hiding a menu is never the boundary. Every restricted route is still
enforced by `middleware.ts` + `requiredRoleForRoute` (Phase 22A). A user typing a
restricted URL is redirected (`/sign-in` or `/dashboard?denied=…`). `canSeeRoute`
returns `false` for unknown/`null` roles on restricted routes, so the public
WorldForge page shows only read-safe menus.

## 2. Role menu matrix
See **`docs/ROLE_NAVIGATION_MATRIX.md`** — every menu × every role, with the
visible/hidden state, the URL gate, and the reasoning. Summary: viewer = read-only
+ profile + feedback; researcher = + intake/evidence/investigation/work; reviewer
= + review/source/operations/governance/exec-read; curator = + publishing
lifecycle; admin = everything.

## 3. Role-based dashboard tasks
`components/navigation/RoleTaskCards.tsx` (client) on `/dashboard` shows clear
next steps per role, fetched via the read-only profile action. Content is the pure
`lib/navigation/role-tasks.ts` (`ROLE_TASKS`) — every task links only to a route
that role can open. Viewer/researcher/reviewer/curator/admin task sets match the
phase spec (explore reports → submit signals → review queue → prepare reports →
invite/approve users).

## 4. Profile / account page
New `/dashboard/profile` (any signed-in user) shows: current role, account status
(pending/active/suspended/disabled), assigned team, a plain-English role
permissions summary, recommended next actions, and an **access explanation**
(Deliverable 7: "You are signed in as Viewer … cannot submit, approve, or
publish."). For admins it adds a **read-only role-visibility preview**
(Deliverable 8): each role → visible menu count, restricted menu count, primary
tasks — no impersonation, no permission bypass.

## 5. Settings audit
`lib/settings/controls.ts` is the canonical audit: **16 controls, each WIRED or
DISABLED with a clear reason — zero dead controls** (`deadControls()` returns `[]`,
asserted by tests). `/dashboard/settings` (admin-only) now renders a "read-only in
beta" banner and disables every interactive control with its reason:

| Control | State | Reason |
| --- | --- | --- |
| Display name | disabled | Editing your display name is coming soon. |
| Email | disabled | Managed by your account sign-in. |
| Role | disabled | Managed by an administrator (Administration → Users). |
| Save changes | disabled | Profile saving is not connected in beta. |
| Notification toggles ×5 | disabled | Notification settings are not connected yet. |
| Security toggles ×3 | disabled | Security settings are managed by an administrator. |
| Manage API keys | disabled | API key management is not available in beta. |
| Default dashboard view / Risk threshold / Traceability | disabled | Saving preferences is coming soon. |

## 6. Settings persistence
No user-preferences table exists. Per the phase guidance ("keep disabled with
clear labels rather than adding unnecessary schema"), preferences are **disabled
with labels** — no schema added. The profile page is the user-facing home for
role/status/team; settings remains the admin surface.

## 7. RBAC preservation
- `rbac-audit.ts` / `middleware.ts` / `get-session-role.ts` — **unchanged**.
- No route made public; `/dashboard/profile` is the only new route and is a
  normal authenticated route (no gate needed — it shows the user their own data).
- `route-gate.test.ts` proves admin/reviewer/researcher routes are still
  URL-gated and that admin satisfies all of them.

## 8. Files

**Added**
- `packages/ui/src/nav-roles.ts` (+ `packages/ui/tests/nav-roles.test.ts`)
- `apps/web/components/navigation/DashboardSidebarClient.tsx`
- `apps/web/components/navigation/RoleTaskCards.tsx`
- `apps/web/lib/navigation/role-tasks.ts` (+ `.test.ts`)
- `apps/web/lib/navigation/route-gate.test.ts`
- `apps/web/lib/profile/actions.ts`
- `apps/web/app/dashboard/profile/page.tsx`
- `apps/web/lib/settings/controls.ts` (+ `.test.ts`)
- `docs/ROLE_NAVIGATION_MATRIX.md`, `docs/PHASE_24D_ROLE_NAV_SETTINGS_REPORT.md`

**Modified**
- `packages/ui/src/navigation.tsx` — role-aware `DashboardSidebar` + "My Profile" item
- `packages/ui/src/index.ts` — export `nav-roles`
- `apps/web/app/dashboard/layout.tsx` — Server Component resolving role
- `apps/web/app/dashboard/page.tsx` — mount `RoleTaskCards`
- `apps/web/app/dashboard/settings/page.tsx` — disabled controls + reasons + banner
- `apps/web/lib/navigation/routes.ts` — `profile` registry entry

## 9. Verification results

| Gate | Result |
| --- | --- |
| `tsc` web | 0 errors |
| `pnpm --filter web build` | ✅ 127 pages (+ `/dashboard/profile`) |
| Full test suite | ✅ **2,307 / 2,307** (+34: nav-roles, role-tasks, route-gate, settings) |
| Route audit | ✅ 0 missing (84 registry + 61 sidebar) |
| Production smoke test | ✅ 0 fail |
| **Live role-aware sidebar** | ✅ role=null (public WorldForge) shows 29 read-safe menus; admin/settings/security/review/publishing/my-work **hidden**; reports/forecasts/trust/profile/worldforge **shown** |
| `pnpm --filter web lint` | ⚠️ pre-existing `next lint`/ESLint-v9 incompatibility (not introduced here; typecheck + build + tests are the gates) |
| RBAC / auth / DB / security | unchanged |

## 10. Remaining risks
- **`ALL_NAV_HREFS` is maintained in `nav-roles.ts`** (server-safe) parallel to the
  client `dashboardNavGroups`; a new sidebar item must be added to both. A test
  asserts every `NAV_VISIBILITY` key is in `ALL_NAV_HREFS`, but a brand-new
  *unrestricted* item could be missed in the admin preview count until added. The
  route-audit/smoke still validate the live sidebar against disk.
- **Settings preferences are not persisted** (no table) — intentionally disabled
  with labels; persistence is a future phase (would add a `user_preferences` table
  + a profile preferences section).
- **Menu visibility is UX**; correctness of access is owned by RBAC/middleware
  (unchanged, tested). Hidden menus reduce confusion but never replace the gate.
