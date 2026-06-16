# HSI Compliance Positioning

> **For buyers, partners, and due-diligence reviewers.**

## Statement of position

HSI is not currently certified under SOC 2, ISO 27001, HIPAA, PCI, or FERPA. The
platform includes readiness controls, auditability, tenant isolation, access
controls, retention planning, vendor tracking, and compliance evidence
management to support future certification or customer due diligence.

We use **readiness** language deliberately and never claim certification:

| Use | Do not use |
| --- | --- |
| SOC 2 readiness | ~~SOC 2 Certified~~ |
| HIPAA readiness | ~~HIPAA Certified~~ |
| PCI boundary readiness | ~~PCI Certified~~ |
| ISO 27001 readiness | ~~ISO Certified~~ |
| FERPA readiness | ~~FERPA Certified / Compliant~~ |

## What HSI can demonstrate today

- **Audit logging** — admin activity, security events, source-capture telemetry, billing events, and an export audit trail.
- **Access controls** — role-based access (RBAC), MFA support, session controls, and periodic access reviews.
- **Tenant isolation** — row-level security (RLS) scopes data per organization; platform admins retain oversight only.
- **Data retention** — documented retention readiness per data type (no automatic deletion yet).
- **Incident response** — an incident log with detection → containment → resolution → postmortem.
- **Vendor risk** — a vendor / sub-processor register with data-access and risk classification.
- **Payment security boundary** — Stripe-hosted checkout; HSI stores no cardholder data (PCI boundary).
- **Privacy readiness** — data export / deletion readiness and consent-tracking planning (GDPR/CCPA).
- **Compliance evidence** — an evidence vault linking artifacts to controls.
- **Control ownership** — a control library with owners and readiness status.

## Framework posture (summary)

| Framework | Posture |
| --- | --- |
| SOC 2 | Readiness in progress — control library + evidence being assembled |
| GDPR | Readiness in progress — export/deletion, consent tracking, retention planning |
| CCPA/CPRA | Readiness in progress |
| HIPAA | Not applicable today — HSI does not process PHI; readiness controls flagged |
| PCI DSS | Boundary readiness — Stripe-hosted, no cardholder data stored |
| ISO 27001 | Readiness in progress — ISMS controls, risk register, reviews |
| FERPA | Needs policy — readiness notes for institutional/student-data conversations |
| NGO / donor due-diligence | Evidence available — governance, security posture, vendor register |

## How to request evidence

Platform administrators can export the readiness matrix, control list, risk
register, access review, incident log, and vendor register as CSV or JSON from
the Compliance Control Center (`/dashboard/admin/compliance`). Every export is
recorded for provenance.
