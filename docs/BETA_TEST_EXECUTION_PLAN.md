# HSI Beta Test Execution Plan (Phase 23)

A staged plan to validate the Human Signal Index with testers before public beta.
Each phase has an entry gate, activities, and an exit gate. Governance is preserved
throughout: nothing auto-publishes, auto-enforces, or auto-moderates.

## Phase 1 — Internal admin testing

- **Who:** the admin (`research@amenxlabs.com`) + core team.
- **Entry gate:** build green, tests green, smoke test PASS, Launch Center reachable.
- **Activities:**
  - Open `/dashboard/launch`; confirm readiness areas, score, blockers, migration
    audit (0001→0026), env, connectivity.
  - Walk every sidebar group end-to-end; confirm no dead menus/CTAs.
  - Confirm `/api/debug/rbac` shows `highestRole: admin`, `source: public.user_roles`.
  - Exercise admin-only surfaces (Security, Settings, Launch).
- **Exit gate:** Launch Center recommendation = READY (or all blockers triaged);
  zero critical issues open.

## Phase 2 — Role testing

Create one account per role and verify the matrix (`docs/BETA_TESTER_ROLE_MATRIX.md`).

- **viewer:** read-only everywhere it's allowed; restricted routes show the
  "requires a higher role" notice (not a dead click); no write controls.
- **researcher:** + Simulation Lab, Decision Explorer; reviewer+ routes still
  restricted.
- **reviewer:** + Review Queue, Curation, Source Registry, Operations; review
  actions require reviewer + reason and are audited; publish still blocked.
- **curator:** + Publishing pipeline (draft → review → publish → retract); drafts
  stay drafts until human-approved.
- **admin:** full access; RBAC, Launch, Security correct.
- **Exit gate:** every role opens exactly its allowed routes and is denied the
  rest, with a visible reason; all write actions are governed + audited.

## Phase 3 — External testers

- **Who:** a small invited cohort across roles (mostly viewer/researcher).
- **Activities:** real navigation, reading, and (for higher roles) governed
  workflows. File findings via the Beta Issue System (`/dashboard/launch/issues`)
  with severity.
- **Rules:** no production attacks, no rate-limit/load testing, no credential
  sharing, no real sensitive data (see Tester Onboarding).
- **Exit gate:** no open Critical/High issues; navigation + RBAC confirmed by
  multiple independent testers.

## Phase 4 — Launch review

- **Activities:** triage all Beta Issues; re-run `pnpm test`,
  `pnpm --filter web build`, and `pnpm tsx scripts/production-smoke-test.ts`
  (with `SMOKE_BASE_URL`); re-check the Launch Center; complete the deployment
  checklist; confirm backups + rollback are in place.
- **Exit gate:** Launch Center = READY, checklist complete, security review signed
  off, `/api/debug/rbac` 404 in production.

## Phase 5 — Production deployment

- Promote the green build; apply migrations on the production Supabase; assign
  production roles; enable PITR/backups; verify the live smoke test; send tester
  invitations.
- **Post-launch:** monitor `/dashboard/security` (health, access telemetry) and
  `/dashboard/launch`; keep the issue workflow open; nothing is auto-actioned —
  humans triage.

## Severity definitions

| Severity | Meaning | Target |
| --- | --- | --- |
| Critical | Data loss, security exposure, platform unusable | Block launch |
| High | Major feature broken, no workaround | Block launch |
| Medium | Feature impaired, workaround exists | Fix before GA |
| Low | Cosmetic / minor | Backlog |
