# HSI Beta Operations (Phase 85)

Operational documentation for the controlled public beta. These docs extend — and
cross-reference, rather than duplicate — the existing
[`../BETA_TEST_EXECUTION_PLAN.md`](../BETA_TEST_EXECUTION_PLAN.md),
[`../BETA_TESTER_ROLE_MATRIX.md`](../BETA_TESTER_ROLE_MATRIX.md), and
[`../deployment/production-beta-launch.md`](../deployment/production-beta-launch.md).

| Document | Audience | Purpose |
|----------|----------|---------|
| [`ROLLOUT_PLAN.md`](./ROLLOUT_PLAN.md) | Operators | Staged (cohort-size) public beta rollout, Stages 1–4 |
| [`TESTER_GUIDE.md`](./TESTER_GUIDE.md) | Testers | Onboarding checklist + expectations |
| [`OPERATOR_RUNBOOK.md`](./OPERATOR_RUNBOOK.md) | Operators | Env, cron, health, email, storage, rollback |
| [`FEEDBACK_AND_BUGS.md`](./FEEDBACK_AND_BUGS.md) | Both | Feedback workflow + S0–S4 severity model |
| [`RC2_PLANNING.md`](./RC2_PLANNING.md) | Operators | Prioritized, evidence-based path to RC2/GA |

All content is grounded in the current repository. No metrics, testers, bugs, or
uptime are fabricated; quantitative success criteria are filled in by operators
from live surfaces (`/dashboard/launch`, `/dashboard/launch/issues`,
`/dashboard/beta-launch`, `/dashboard/security`, and the health endpoints).
