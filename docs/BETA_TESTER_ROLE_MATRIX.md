# HSI Beta Tester Role Matrix (Phase 23)

The Human Signal Index uses a 5-level role ladder. Roles are stored in
`public.user_roles → roles` and resolved by `apps/web/lib/auth/get-session-role.ts`
(the same source the middleware gate and DB RLS use). Higher roles inherit every
lower role's access.

```
viewer  <  researcher  <  reviewer  <  curator  <  admin
```

Assign a tester a role with:
```sql
insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u, public.roles r
where u.email = '<tester-email>' and r.name = '<role>';
```

---

## viewer

- **Accessible:** all read dashboards that need only a sign-in — Executive
  Command Center, Forecasting, Scenarios, Warnings, Collective (Investigations /
  Consensus / Debates / Contributors), Trust, Calibration, Outcomes, Governance
  (read), Publishing (read), WorldForge (public), Tester Onboarding, Beta Issues.
- **Restricted:** Source Registry, Operations, Review Queue, Simulation, Decision
  Explorer, Security, Security Monitor, Settings, Launch Center.
- **Permissions:** read-only across the platform. No writes, no governance actions.
- **Testing responsibilities:** navigation completeness, that restricted routes
  show a clear "requires a higher role" notice (not a dead click), read-view
  correctness, demo/empty/offline states.
- **Example workflow:** open every sidebar item → confirm each opens or explains
  the restriction; file a Beta Issue for anything that "does nothing".

## researcher

- **Adds:** Simulation Lab, Decision Explorer, intelligence decision/impact views.
- **Permissions:** viewer + run/inspect simulation & decision analysis (advisory;
  no publication).
- **Testing responsibilities:** simulation/decision flows render and explain;
  researcher-gated routes open; reviewer+ routes still restricted.
- **Example workflow:** open Simulation Lab → run a comparison → verify outputs are
  advisory and nothing auto-acts.

## reviewer

- **Adds:** Review Queue, Curation, Source Registry, Sources, Operations Center.
- **Permissions:** researcher + human review / curation actions (validate, approve,
  reject, escalate) — every action audited and reversible.
- **Testing responsibilities:** the human-in-the-loop review queue; confirm
  decisions require a reviewer + reason and are logged; curator-only actions
  (publish) remain blocked.
- **Example workflow:** claim a review item → approve with a reason → confirm the
  audit trail; attempt a publish → confirm it is curator-gated.

## curator

- **Adds:** Publications, publish actions, dead-letter requeue.
- **Permissions:** reviewer + publication lifecycle (draft → review → publish →
  retract) and curation publish authority. Publishing is still **human-approved**;
  nothing auto-publishes.
- **Testing responsibilities:** the publishing pipeline; drafts stay drafts until a
  human approves; retraction is reversible/audited.
- **Example workflow:** create a draft report (`/dashboard/publishing/new`) → move
  it through review → publish → retract; confirm each step is governed.

## admin

- **Adds:** Security, Security Monitor, Settings, **Launch Center**, the
  `/api/debug/rbac` diagnostic.
- **Permissions:** full access. Inherits every lower role.
- **Testing responsibilities:** RBAC correctness end-to-end, the Launch Operations
  Center (readiness, migrations, env, blockers), the security telemetry, and that
  the debug endpoint is admin-only + production-disabled.
- **Example workflow:** open `/dashboard/launch` → review readiness score +
  blockers + migration audit; open `/dashboard/security` → confirm health, RBAC
  audit, and migration panel; verify a viewer account is correctly restricted.

---

## Quick reference

| Capability | viewer | researcher | reviewer | curator | admin |
| --- | :--: | :--: | :--: | :--: | :--: |
| Read dashboards | ✓ | ✓ | ✓ | ✓ | ✓ |
| Simulation / Decision analysis | ✗ | ✓ | ✓ | ✓ | ✓ |
| Review / curation actions | ✗ | ✗ | ✓ | ✓ | ✓ |
| Source registry / operations | ✗ | ✗ | ✓ | ✓ | ✓ |
| Publish / retract | ✗ | ✗ | ✗ | ✓ | ✓ |
| Security / Settings / Launch | ✗ | ✗ | ✗ | ✗ | ✓ |
| File a Beta Issue | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tester Onboarding | ✓ | ✓ | ✓ | ✓ | ✓ |
