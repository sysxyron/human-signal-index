# HSI Operating Procedures

The operating manual for reviewers, operators, and on-call staff. It defines the
standard operating procedures (SOPs) that turn the methodology into daily practice.

Related: [`REVIEW-QUEUE.md`](REVIEW-QUEUE.md) · [`PUBLISHING-CHECKLIST.md`](PUBLISHING-CHECKLIST.md)

---

## 1. Daily operations

1. Triage the **Review Queue** for new and pending signals.
2. Check **Security & Alerts** for new events.
3. Validate **traceability** on items awaiting publication.
4. Approve / reject / escalate per the SOPs below.
5. Confirm scheduled worker jobs ran (poll/capture/process).

## 2. Reviewer SOPs

Reviewers act on signals in the queue. Each decision is recorded in `reviews` and
`audit_logs`.

| Action | When to use | Effect |
| --- | --- | --- |
| **Approve** | Provenance verified, classification + risk correct, traceability ≥ 0.72, framing safe. | Advances the signal toward publication. |
| **Reject** | Out of scope, unverifiable, or violates the charter. | Removes from the pipeline with a logged reason. |
| **Request more evidence** | Claims under-supported; capture incomplete. | Returns to capture/extraction with a note. |
| **Edit classification** | Categories are wrong or over-reaching. | Adjusts `classifications`; logs the change. |
| **Mark public-safe** | Framing is neutral, non-defamatory, vulnerable-audience-safe. | Clears the safe-framing gate. |
| **Mark sensitive** | Touches crisis/self-harm/targeting themes. | Adds handling constraints; raises review bar. |
| **Escalate** | Risk level 4–5, targeting, or possible imminent harm. | Routes to senior reviewer + Security & Alerts. |

**Rules:** argue against ideas not private people; keep language neutral; never
publish private data; never amplify operational detail; when in doubt, escalate.

## 3. Review Queue workflow

The queue presents items by pipeline stage. Full state machine and SLAs in
[`REVIEW-QUEUE.md`](REVIEW-QUEUE.md). Summary:

```
intake → captured → extracted → classified → scored → traced → REVIEW → publish-ready → published
                                                              └→ rejected / needs-more (loops back)
```

## 4. Counter-Narrative Studio guidelines

When drafting educational explainers in the Counter-Narrative Studio:

- Build only from **reviewed** classification, risk, and traceability outputs.
- Use the safe-framing structure: what it claims / assumes / leaves out / who is
  vulnerable / how to respond / debate questions / context.
- Keep it **non-defamatory** and **mental-health-safe**; paraphrase dangerous text.
- Cite every factual claim; carry traceability metadata.
- Store drafts in `generated_content`; nothing publishes without review + the gate.

## 5. Public-report publishing checklist

Before publishing, the publishing checklist (incl. the **traceability gate**) must
pass. See [`PUBLISHING-CHECKLIST.md`](PUBLISHING-CHECKLIST.md). In short: review
approval + traceability ≥ 0.72 + no unresolved flags + safe framing + citations +
only-approved-material.

## 6. Alert-handling runbook (11 alert types)

The Security & Alerts surface raises alerts. Types 1–10 map to the
[Platform Security Monitor](../security/PLATFORM-SECURITY-MONITOR.md); type 11 is
operational.

| # | Alert | First response |
| --- | --- | --- |
| 1 | Suspicious login | Verify account owner; challenge MFA / revoke session if unrecognized. |
| 2 | Failed admin logins | Confirm not the owner; lock/rate-limit; watch for brute force. |
| 3 | Bot traffic | Apply WAF challenge; monitor for escalation. |
| 4 | Rate-limit triggers | Throttle/block source; correlate with scraping/DoS. |
| 5 | Unusual API usage | Investigate pattern; tighten limits; rotate keys if suspect. |
| 6 | File upload abuse | Quarantine upload; review account; enforce limits. |
| 7 | Scraping against HSI | Add WAF rule; serve challenge; rate-limit. |
| 8 | Admin permission change | Confirm authorized; if not, revoke + investigate (critical). |
| 9 | Public site downtime | Page on-call; run incident runbook (§7). |
| 10 | Content tampering | Freeze record; investigate; restore from backup (critical). |
| 11 | **Pipeline/processing failure** | Worker job failed (capture/extract/etc.): inspect logs, re-run job, check provider/quota. |

Acknowledge, act, and resolve each alert; resolution is logged.

## 7. On-call / incident runbook

1. **Acknowledge** the alert; declare an incident if Critical/High.
2. **Assign** an incident lead.
3. **Assess** scope and severity; classify per the severity model.
4. **Contain** — revoke sessions/keys, disable accounts, block sources, freeze records.
5. **Preserve** — snapshot logs + `security_events` (chain-of-custody).
6. **Communicate** — internal status; external notice only if required and approved.
7. **Recover** — patch, restore from backup, rotate secrets, re-run pipeline.
8. **Post-incident** — write up cause, timeline, and fixes; log in `audit_logs`;
   update controls and this runbook.

## 8. Source-onboarding procedure

1. Confirm the source is **genuinely public** (no login wall, no private group).
2. Register it in the **Source Registry**: name, type (site/RSS/API/channel),
   public URL, platform, tags, `risk_baseline`, notes.
3. Set the connector (RSS / official API / public capture).
4. Run a test capture; verify chain-of-custody (hash + timestamp) records correctly.
5. Confirm RLS keeps the captured evidence private.
6. Log onboarding in `audit_logs`.

Ethics: only public material; never bypass access controls; attribute accurately.
