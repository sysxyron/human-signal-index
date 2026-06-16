# Compliance (HSI) — operator guide

> HSI is **compliance-ready, not certified.** See [COMPLIANCE_POSITIONING.md](./COMPLIANCE_POSITIONING.md)
> for buyer-facing language and the no-certification policy.

The Compliance Control Center lives at **`/dashboard/admin/compliance`** and is
**admin-only**. It is backed by migration `0045_compliance_readiness.sql`.

## Surfaces

| Page | Purpose |
| --- | --- |
| `/dashboard/admin/compliance` | Control center: framework readiness matrix, control library, posture counts, exports, re-seed |
| `…/evidence` | Evidence vault — attach evidence to controls, set status |
| `…/risks` | Risk register — create, severity, owner, status lifecycle |
| `…/policies` | Policy center — draft → active → archived |
| `…/retention` | Data-retention readiness (no automatic deletion) |
| `…/access-reviews` | Access review — users, roles, memberships, elevated/inactive |
| `…/incidents` | Incident response log |
| `…/vendors` | Vendor / sub-processor register |

## Data model (`0045`)

`compliance_frameworks`, `compliance_controls`, `compliance_evidence`,
`compliance_reviews`, `compliance_risk_register`, `compliance_policy_documents`,
`compliance_audit_exports`, `compliance_incidents`, plus `compliance_vendors`
and `compliance_retention_policies`.

- **RLS:** all tables admin-write (`is_admin()`). Org-relevant tables
  (evidence/reviews/risks/incidents/audit_exports) add an organization-scoped
  read (`is_org_member()`); catalog tables are admin-read.
- **Seeds:** frameworks (8), control library (28), vendors (6), policies (10),
  and retention defaults (9) are seeded idempotently by the migration and mirror
  `apps/web/lib/compliance/seeds.ts`. Admins can re-seed from the overview.

## Readiness scoring

`apps/web/lib/compliance/readiness.ts` maps the control library onto each
framework via `control.frameworks[]`:

- **present** = `ready` or `evidence_available`
- **missing** = `in_progress` or `needs_policy`
- **not applicable** = excluded from the denominator
- score = present / (present + missing)

## Exports

`GET /api/admin/compliance/export?type=<type>&format=csv|json` (admin-only).
Types: `readiness_matrix`, `controls`, `risk_register`, `access_review`,
`incidents`, `vendors`. Every export is logged to `compliance_audit_exports` and
`security_audit_events`, and is checked by the language guardrails so a
certification claim can never appear in an export.

## Language guardrails

`apps/web/lib/compliance/guardrails.ts` is the single source of truth for
readiness vocabulary. `assertNoCertificationClaim()` rejects any text claiming
"… Certified" / "… Compliant"; it guards every exported cell. Tests in
`apps/web/lib/compliance/compliance.test.ts` enforce this.

## Hard scope

This phase adds compliance infrastructure ONLY. It does not modify RBAC, IAM,
middleware, auth, `user_roles`, billing, Stripe, or the source ingestion
pipeline. No service-role key is used in client code. No data is deleted
automatically (retention is readiness only).
