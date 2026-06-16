# Phase 41 — Compliance Readiness Foundation

**Status:** implemented
**Objective:** add the internal controls, auditability, documentation, and workflows that serious buyers (enterprise / government / university / NGO / due-diligence) expect — **without** claiming SOC 2, HIPAA, PCI, ISO, GDPR, or FERPA certification.

---

## Hard constraints honored

- No changes to **RBAC / IAM / middleware / auth / `user_roles` / billing / Stripe / source ingestion**. Access reviews **read** users/roles/memberships but never write them.
- **No service-role key in client code.** The service-role client is used server-side, best-effort, only to read `auth.users.last_sign_in_at` for the access review.
- **All compliance writes are audited** (`security_audit_events`) and admin-gated (`requireAdmin()` + `is_admin()` RLS).
- **No automatic deletion** — retention is readiness only (`auto_delete` defaults false and is not settable in the UI this phase).

---

## What was built

### Migration — `0045_compliance_readiness.sql`
Ten tables (the eight required + `compliance_vendors` and `compliance_retention_policies` needed for Deliverables K/H): `compliance_frameworks`, `compliance_controls`, `compliance_evidence`, `compliance_reviews`, `compliance_risk_register`, `compliance_policy_documents`, `compliance_audit_exports`, `compliance_incidents`, `compliance_vendors`, `compliance_retention_policies`. Each has RLS (admin-write; org-scoped read where applicable), indexes, and audit fields (`created_at` / `updated_at` / `created_by`). Idempotent seeds for frameworks, controls, vendors, policies, and retention defaults.

### Pure modules (`apps/web/lib/compliance/`) — all unit-tested
- `guardrails.ts` — readiness vocabulary + `assertNoCertificationClaim()` (Deliverable M).
- `seeds.ts` — TS mirror of the seeded frameworks/controls/vendors/policies/retention.
- `readiness.ts` — framework readiness scoring (Deliverable B).
- `lifecycle.ts` — risk / policy / incident status transition rules.
- `access-review.ts` — pure access-review shaping + summary (Deliverable I).
- `export.ts` — CSV/JSON serialization + dataset builders, guardrail-checked (Deliverable L).
- `types.ts` — shared records/unions.

### DAL + actions + route
- `persistence.ts` — admin-gated, audited DbResult reads/writes for all tables; `getComplianceOverview`, `getAccessReview`, `generateExport`, `seedComplianceDefaults`, and per-entity create/status mutations (transition-validated).
- `actions.ts` — `'use server'` wrappers + `revalidatePath`.
- `app/api/admin/compliance/export/route.ts` — admin-gated CSV/JSON download; logs every export.

### UI — `/dashboard/admin/compliance` (admin-only, 8 pages)
Overview (Control Center: readiness matrix + control library + posture counts + exports + re-seed), Evidence Vault, Risk Register, Policy Center, Retention, Access Reviews, Incidents, Vendors. Shared components: `ComplianceNav`, `ComplianceDisclaimer`, readiness/severity/status badges, `ExportLinks`, and client mutation controls. `AdminNav` gains a **Compliance** entry.

---

## Deliverable mapping

| Deliverable | Where |
| --- | --- |
| A. Control Center | `/dashboard/admin/compliance` overview |
| B. Readiness matrix | `readiness.ts` + overview matrix table |
| C. Tables | `0045_compliance_readiness.sql` |
| D. Control library | seeded controls (security/privacy/operations/payments/healthcare/education/audit) |
| E. Evidence vault | `…/evidence` + evidence DAL |
| F. Risk register | `…/risks` + lifecycle transitions |
| G. Policy center | `…/policies` (draft/active/archived) |
| H. Retention | `…/retention` (readiness only) |
| I. Access reviews | `…/access-reviews` + `access-review.ts` |
| J. Incidents | `…/incidents` |
| K. Vendor register | `…/vendors` (Supabase, Vercel, Stripe, Resend, Cloudflare, ProtonMail) |
| L. Export | export route + `export.ts` (CSV/JSON) |
| M. Language guardrails | `guardrails.ts` + disclaimer banner everywhere |
| N. Tests | `compliance.test.ts` |
| O. Documentation | this report + `docs/compliance/*` |

---

## Security review

- **Admin-gating:** every page checks `isAdmin(role)`; every DAL call goes through `requireAdmin()`; RLS (`is_admin()`) is the backstop. Org-relevant tables additionally allow org-scoped reads via `is_org_member()`.
- **Audit:** writes call `recordSecurityAudit(...)`; exports are recorded in `compliance_audit_exports` + `security_audit_events`.
- **No certification claims:** `assertNoCertificationClaim()` guards exported cells; tests assert all seed text and the disclaimer are clean and that forbidden phrasings are rejected.
- **No forbidden subsystems touched:** RBAC/IAM/middleware/auth/billing/Stripe/source ingestion unchanged. Retention performs no deletion.
- **Service-role:** used only server-side for best-effort last-login; degrades cleanly when absent.

---

## Verification results

- **Pure-module tests:** `apps/web/lib/compliance/compliance.test.ts` — **12/12 pass** (`tsx --test`).
- **Typecheck:** `tsc --noEmit` on `apps/web` — **clean (exit 0)**.
- **Full existing suite:** **2599/2599 pass** (no regressions).
- **Build:** `next build` — see results section in the verification run.
- **Route audit:** `/dashboard/admin/compliance` (+7 subpages) and `/api/admin/compliance/export` compile.
- **Migration audit:** `0045` is additive (0001–0044 unchanged); RLS reuses `is_admin()` / `is_org_member()`.
- **Export smoke test:** `buildExport` covered for all six datasets in CSV + JSON, with a certification-claim rejection test.

---

## Remaining gaps / follow-ups

- **Two tables beyond the explicit list of 8** (`compliance_vendors`, `compliance_retention_policies`) were added to properly support Deliverables K and H.
- **PDF export** is intentionally deferred (CSV/JSON only this phase).
- **Last-login** in the access review requires `SUPABASE_SERVICE_ROLE_KEY`; without it, inactivity is estimated conservatively.
- **Repo-wide `next lint`** remains broken (pre-existing ESLint 9 / Next 14.2.5 mismatch) — unrelated to this phase; typecheck + tests are the gates.
- Frameworks/controls statuses are admin-seeded; deeper automated evidence collection (e.g., auto-linking audit-log proofs to controls) is a future phase.

See also: `docs/compliance/README.md` and `docs/compliance/COMPLIANCE_POSITIONING.md`.
