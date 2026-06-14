# HSI Role Navigation Matrix (Phase 24D)

Canonical mapping of which role SEES which dashboard menu. **This is UX only** —
RBAC + middleware still protect every route, so a hidden menu is never the
security boundary. Source of truth: `packages/ui/src/nav-roles.ts`
(`NAV_VISIBILITY`, `canSeeRoute`). Admins see everything.

Legend: ✓ visible · ✗ hidden (UX) · **gate** = the role required to actually open
the URL (from `lib/security/rbac-audit.ts`; `—` = any signed-in user).

| Menu (route) | viewer | researcher | reviewer | curator | admin | URL gate |
| --- | :--: | :--: | :--: | :--: | :--: | --- |
| Mission Control `/dashboard` | ✓ | ✓ | ✓ | ✓ | ✓ | — (auth) |
| Rhetoric Analysis `/rhetoric-classifier` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Risk Assessment `/risk-scoring` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Evidence Trail `/traceability-engine` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Alerts `/alerts` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Public Reports `/public-reports` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Forecasts / Scenarios / Warnings | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Consensus / Debates / Contributors | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Outcomes / Trust / Calibration | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| WorldForge (all) | ✓ | ✓ | ✓ | ✓ | ✓ | — (public reads) |
| Beta Issues `/launch/issues` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Tester Onboarding `/tester-onboarding` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **My Profile** `/profile` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Signal Submission `/signal-intake` | ✗ | ✓ | ✓ | ✗ | ✓ | — |
| Evidence Vault `/evidence-vault` | ✗ | ✓ | ✓ | ✓ | ✓ | — |
| Investigations `/investigations` | ✗ | ✓ | ✓ | ✗ | ✓ | — |
| Decision Explorer `/decisions/explorer` | ✗ | ✓ | ✓ | ✗ | ✓ | researcher |
| Intelligence Ops `/intelligence/operations` | ✗ | ✓ | ✓ | ✓ | ✓ | — |
| Human Operations (center/my-work/workloads/teams/alerts/contributor-ops) | ✗ | ✓ | ✓ | ✓ | ✓ | researcher |
| Source Registry `/source-registry` | ✗ | ✗ | ✓ | ✓ | ✓ | reviewer |
| Operations Center `/operations` | ✗ | ✗ | ✓ | ✓ | ✓ | reviewer |
| Review Queue `/review` | ✗ | ✗ | ✓ | ✓ | ✓ | reviewer |
| Counter-Narrative `/counter-narrative` | ✗ | ✗ | ✓ | ✓ | ✓ | — |
| Governance `/governance` | ✗ | ✗ | ✓ | ✓ | ✓ | — |
| Publishing Review `/publishing/review` | ✗ | ✗ | ✓ | ✓ | ✓ | curator (write) |
| Executive (command/priorities/risks/opportunities/briefings) | ✗ | ✗ | ✓ | ✓ | ✓ | — |
| Executive Operations `/executive-operations` | ✗ | ✗ | ✓ | ✓ | ✓ | researcher |
| Publications `/publishing` | ✗ | ✗ | ✗ | ✓ | ✓ | curator |
| Retractions `/publishing/retractions` | ✗ | ✗ | ✗ | ✓ | ✓ | curator |
| Exec Governance `/exec-governance` | ✗ | ✗ | ✗ | ✓ | ✓ | — |
| Launch Center `/launch` | ✗ | ✗ | ✗ | ✗ | ✓ | admin |
| Administration (users/teams/testers/access-logs) | ✗ | ✗ | ✗ | ✗ | ✓ | admin |
| Security Monitor / Security Center | ✗ | ✗ | ✗ | ✗ | ✓ | admin |
| Settings `/settings` | ✗ | ✗ | ✗ | ✗ | ✓ | admin |

## Reasoning by role
- **viewer** — read-only/safe surfaces (reports, evidence trail, forecasts, trust,
  worldforge), plus profile, beta feedback, and onboarding. No submit/review/
  publish/admin menus (they'd only bounce them).
- **researcher** — adds intake, evidence, investigations, decision/sim analysis,
  and operational work queues.
- **reviewer** — adds review queue, source registry, operations, governance,
  publication review, executive read surfaces.
- **curator** — adds the publishing lifecycle (publish/retractions) and exec
  governance.
- **admin** — everything, including Administration (IAM), Security, Settings, and
  Launch.

## Security note
Hiding a menu does **not** grant or revoke access. Every restricted route is
independently enforced by middleware + `requiredRoleForRoute` (the "URL gate"
column). A user who types a restricted URL directly is still redirected
(`/sign-in` if unauthenticated, `/dashboard?denied=…` if under-privileged). The
`route-gate.test.ts` suite asserts this for the admin/reviewer/researcher routes.
