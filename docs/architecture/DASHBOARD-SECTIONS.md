# HSI Dashboard Sections

The authenticated HSI dashboard (`app.humansignalindex.org`) is organized into 12
operational sections plus 1 administrative section (13 total). Each section is
RBAC-gated (see [`docs/security/README.md`](../security/README.md)) and reflects
one stage of the provenance pipeline. This document describes each section's
purpose, primary fields, and the data-model tables it reads/writes.

| Role | Access |
| --- | --- |
| `viewer` | Read published/public surfaces only. |
| `reviewer` | Full working set: intake → review → publish. |
| `admin` | Everything, plus Settings/Admin. |

---

## 1. Overview / Observatory
**Purpose:** At-a-glance situational awareness.
**Fields:** signal volume (intake/in-review/published), risk-level distribution
(1–5), category heatmap, recent alerts, sources needing re-capture, traceability
pass-rate, review-queue depth.
**Tables:** aggregates across `signals`, `risk_scores`, `classifications`,
`alerts`, `reviews`.

## 2. Signal Intake
**Purpose:** Submit and triage new signals from contributors/connectors.
**Fields:** title, summary, signal type, source URL/attribution, platform,
manual text / upload, tags, intake status.
**Tables:** writes `signals` (status=`intake`), `uploaded_files`; references `sources`.

## 3. Source Registry
**Purpose:** Manage tracked public sources and their confidence baselines.
**Fields:** source name, type (site/RSS/API/channel), public URL, platform,
status, tags, `risk_baseline`, added-by, notes, change history.
**Tables:** `sources`, `source_changes`, `tags`.

## 4. Evidence Vault
**Purpose:** Hold raw, private source material with chain-of-custody.
**Fields:** capture snapshots, content hashes, capture timestamps, transcripts,
uploaded files, custody notes. **Never public** unless promoted into a report.
**Tables:** `evidence_items`, `captures`, `transcripts`, `uploaded_files`
(+ `evidence`/`uploads` Storage buckets).

## 5. Transcript Review
**Purpose:** Verify transcript accuracy and extract quotes.
**Fields:** raw transcript, reviewer corrections, approved quote extracts,
speaker/source attribution, timecodes.
**Tables:** `transcripts` (read/update), `evidence_items`.

## 6. Rhetoric Classification
**Purpose:** Apply and confirm the 36-category taxonomy.
**Fields:** proposed categories + classifier confidence, reviewer-confirmed
categories, rationale, links to evidence passages.
**Tables:** `classifications`, `category_taxonomy`, `ai_runs`, `ai_trace_passages`.

## 7. Risk Scoring
**Purpose:** Assign the 1–5 risk level with neutral justification.
**Fields:** risk level (1–5), representative quote (neutral/paraphrased),
explanation, confidence, reviewer status, recommended action.
**Tables:** `risk_scores`, `ai_runs`.

## 8. Traceability Audit
**Purpose:** Verify every AI claim maps to a source passage.
**Fields:** claim list, mapped source passages, per-claim confidence,
unsupported/unattributed flags, overall traceability score vs.
`TRACEABILITY_MIN_CONFIDENCE` (0.72).
**Tables:** `ai_trace_passages`, `ai_runs`, `evidence_items`.

## 9. Review Queue
**Purpose:** The human-in-the-loop approval workflow.
**Fields:** queue items by stage, decision (approve / reject / request-more /
edit-classification / mark-public-safe / mark-sensitive / escalate), reviewer,
notes, timestamps. See [`../operating-procedures/REVIEW-QUEUE.md`](../operating-procedures/REVIEW-QUEUE.md).
**Tables:** `reviews`, `signals`, `comments`.

## 10. Counter-Narrative Studio
**Purpose:** Draft safe, source-backed educational explainers.
**Fields:** what-it-claims / what-it-assumes / what-it-omits / who-may-be-vulnerable,
debate questions, mental-health-safe framing, citations.
**Tables:** `generated_content`, references `classifications`, `risk_scores`.

## 11. Public Reports
**Purpose:** Compose, gate, and publish public briefings.
**Fields:** report body, citation list, traceability status, publish-gate
checklist, published-at, public URL.
**Tables:** `public_reports` (+ `public-report-assets` bucket). See
[`../operating-procedures/PUBLISHING-CHECKLIST.md`](../operating-procedures/PUBLISHING-CHECKLIST.md).

## 12. Security & Alerts
**Purpose:** Monitor platform safety and operational health.
**Fields:** the 10 monitored event types, alert severity/status, audit-log
viewer, incident runbook links. See
[`../security/PLATFORM-SECURITY-MONITOR.md`](../security/PLATFORM-SECURITY-MONITOR.md).
**Tables:** `alerts`, `security_events`, `audit_logs` (admin read).

---

## 13. Settings / Admin (admin only)
**Purpose:** Platform configuration and access governance.
**Fields:** user management, role assignment (`user_roles`), taxonomy editing
(`category_taxonomy`), tag management, source onboarding defaults, MFA policy,
environment/feature toggles, export/backup triggers.
**Tables:** `users`, `roles`, `user_roles`, `category_taxonomy`, `tags`,
`audit_logs`.
