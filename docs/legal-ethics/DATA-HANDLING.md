# HSI Data Handling

This document defines what data HSI collects, how it is classified and retained,
the line between public and private evidence, the correction/takedown process, and
chain-of-custody. It operationalizes the [Ethics Policy](ETHICS-POLICY.md).

---

## 1. What data is collected

| Category | Examples | Source |
| --- | --- | --- |
| Public source material | Public web pages, public RSS, public posts, official-API items | `sources`, `captures`, `evidence_items` |
| Transcripts | Transcriptions of public audio/video | `transcripts` |
| Contributor uploads | Files submitted by verified contributors | `uploaded_files` |
| Analytical artifacts | AI extraction, classification, risk, traceability | `ai_runs`, `ai_trace_passages`, `classifications`, `risk_scores` |
| Operational data | Reviews, comments, alerts, audit, security telemetry | `reviews`, `comments`, `alerts`, `audit_logs`, `security_events` |
| Account data | Reviewer/admin accounts and roles | `users`, `roles`, `user_roles` |

**Never collected:** private personal data, login-walled content, private-group
material, purchased personal data, or non-public communications. HSI does not
build dossiers on private individuals.

## 2. Public vs. private evidence

| Class | Default visibility | Where |
| --- | --- | --- |
| Raw evidence | **Private** | `evidence_items`, `captures`, `transcripts`, `uploaded_files`; `evidence`/`uploads` buckets |
| Analytical artifacts | **Private** until reviewed/published | `classifications`, `risk_scores`, `ai_*` |
| Published reports | **Public** | `public_reports`, `public-report-assets` bucket |

The **only** path from private to public is the publish gate (review approval +
traceability ≥ 0.72 + safe-framing checks). Raw evidence is never published in
bulk; only the specific cited material needed to support a claim is surfaced.

## 3. Retention

| Data | Retention |
| --- | --- |
| Raw evidence | Retained for the life of the signal/research record; preserves chain-of-custody. |
| Analytical artifacts | Retained with the signal for reproducibility. |
| Audit logs | Retained long-term (append-only); supports accountability. |
| Security events | Retained per monitoring policy; pruned/aggregated after the active window. |
| Account data | Retained while the account is active; removed on offboarding. |
| Taken-down content | Removed from public surfaces; minimal record kept to honor the request and prevent re-publication. |

Retention periods should be finalized with counsel before launch and recorded
here with effective dates.

## 4. Correction and takedown process

1. **Request received** (correction or takedown) via the published contact channel.
2. **Logged** in `audit_logs` with timestamp and requester category.
3. **Triaged** by a reviewer: identity/standing, scope, and validity.
4. **Assessed** against the Ethics Policy and evidence:
   - Factual error → correct and re-cite.
   - Private data exposure → remove immediately.
   - Out-of-scope/private-individual targeting → remove.
5. **Action** taken; public surface updated or content unpublished.
6. **Response** sent to requester; outcome logged.
7. **Review** for systemic fixes if a pattern emerges.

Good-faith correction and privacy requests are prioritized. Takedown of genuinely
private personal data is immediate and not subject to debate.

## 5. Chain-of-custody

Every piece of evidence carries:

- **Origin** — the public URL/source and platform.
- **Capture metadata** — timestamp and capturing job/connector.
- **Integrity hash** — a content hash recorded at capture; re-checked by the
  content-tampering monitor.
- **Custody trail** — who accessed, reviewed, or modified the record (`audit_logs`).

Hash mismatches freeze the record and raise a content-tampering alert
(see [`../security/PLATFORM-SECURITY-MONITOR.md`](../security/PLATFORM-SECURITY-MONITOR.md)).

## 6. Access & least privilege

Access to private evidence is restricted to `reviewer`/`admin` via RLS and app
guards. Exports of evidence follow the same controls and are logged. See
[`../security/README.md`](../security/README.md).

Last reviewed: 2026-06-06.
