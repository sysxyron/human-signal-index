# HSI Route Access Audit (Phase 23)

Authoritative mapping of dashboard routes → required role, derived from
`apps/web/lib/security/rbac-audit.ts` (`PROTECTED_ROUTES`, enforced by
`apps/web/middleware.ts`) and verified against the route registry +
`scripts/production-smoke-test.ts`.

**Gate model.** Anonymous users are redirected to `/sign-in` for any `/dashboard`
route **except** `/dashboard/worldforge*` (public reads). For an authenticated
user, a route with a required role redirects to `/dashboard?denied=<route>` (which
shows the `AccessDeniedNotice`) when the role is insufficient. `admin` inherits
all. Ungated `/dashboard` routes need only a signed-in viewer.

✓ = allowed · ✗ = denied (redirected)

## Role-gated routes

| Route | Required | viewer | researcher | reviewer | curator | admin |
| --- | --- | :--: | :--: | :--: | :--: | :--: |
| /dashboard/intelligence/decisions | researcher | ✗ | ✓ | ✓ | ✓ | ✓ |
| /dashboard/intelligence/impacts | researcher | ✗ | ✓ | ✓ | ✓ | ✓ |
| /dashboard/decisions/explorer | researcher | ✗ | ✓ | ✓ | ✓ | ✓ |
| /dashboard/simulation* | researcher | ✗ | ✓ | ✓ | ✓ | ✓ |
| /dashboard/review, /review-queue | reviewer | ✗ | ✗ | ✓ | ✓ | ✓ |
| /dashboard/curation | reviewer | ✗ | ✗ | ✓ | ✓ | ✓ |
| /dashboard/sources, /source-registry | reviewer | ✗ | ✗ | ✓ | ✓ | ✓ |
| /dashboard/operations | reviewer | ✗ | ✗ | ✓ | ✓ | ✓ |
| /dashboard/publications | curator | ✗ | ✗ | ✗ | ✓ | ✓ |
| /dashboard/curation/publish | curator | ✗ | ✗ | ✗ | ✓ | ✓ |
| /dashboard/operations/dead-letter | curator | ✗ | ✗ | ✗ | ✓ | ✓ |
| /dashboard/security, /security-monitor | admin | ✗ | ✗ | ✗ | ✗ | ✓ |
| /dashboard/settings | admin | ✗ | ✗ | ✗ | ✗ | ✓ |
| /dashboard/launch | admin | ✗ | ✗ | ✗ | ✗ | ✓ |
| /dashboard/launch/issues | viewer (override) | ✓ | ✓ | ✓ | ✓ | ✓ |

## Ungated routes (signed-in viewer is enough)

`/dashboard` · `/dashboard/signal-intake` · `/evidence-vault` ·
`/rhetoric-classifier` · `/risk-scoring` · `/traceability-engine` ·
`/intelligence/operations` (+ runs/health/opportunities/escalations) · `/alerts` ·
`/counter-narrative` · `/public-reports` · `/forecasts` · `/scenarios` ·
`/warnings` · `/investigations` · `/consensus` · `/debates` · `/contributors` ·
`/outcomes` · `/governance` · `/trust` (+ history/public/drift/proposals) ·
`/calibration` · `/publishing` (+ new/review/retractions) · `/executive` ·
`/priorities` · `/risks` · `/opportunities` · `/briefings` · `/exec-governance` ·
`/tester-onboarding`.

> Write actions on these pages are still role-gated **in the DAL** (e.g. publishing
> needs curator, governance needs reviewer/curator). The page is viewable; the
> mutating control is gated and labeled.

## Public route

`/dashboard/worldforge*` — public reads (intentional, per middleware allowlist).

## Findings

- **Missing role checks:** none. Every admin/curator/reviewer/researcher surface
  is covered by `PROTECTED_ROUTES`; ungated pages gate their writes in the DAL.
- **Incorrect role checks:** none after the Phase 22A repair — middleware,
  `getSessionRole`, and all DAL gates read the canonical `user_roles → roles`
  source (no more `users.role`).
- **Orphan routes:** none. `scripts/production-smoke-test.ts` confirms every
  `ROUTES` value and sidebar href resolves to a `page.tsx`.
- **Hidden routes:** `/dashboard/launch/issues` is reachable from the sidebar and
  the Launch Center; `/dashboard/tester-onboarding` from the sidebar. The
  `/api/debug/rbac` diagnostic is intentionally hidden (admin-only, 404 in prod).
- **Inconsistent middleware behaviour:** the `requiredRoleForRoute` prefix rule
  uses longest-prefix-wins, so `/dashboard/launch/issues` (viewer) correctly
  overrides `/dashboard/launch` (admin). The two prefix-only guards
  (`/dashboard/admin`, `/dashboard/curation/publish`) have no dedicated page —
  they pre-gate sub-actions and are reported as WARNING (not blockers) by the
  smoke test.
