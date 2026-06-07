# HSI Platform Security Monitor

The Platform Security Monitor is the continuous-monitoring component of HSI. The
`security-monitor` worker job evaluates raw telemetry in `security_events` and
raises actionable `alerts`. This document defines the **10 monitored event types**,
what triggers them, and the response.

Surfaced in the dashboard's **Security & Alerts** section. Alert handling runbook:
[`../operating-procedures/README.md`](../operating-procedures/README.md) §6.

---

## Monitored event types

| # | Event type | What it detects | Trigger signals | Default response |
| --- | --- | --- | --- | --- |
| 1 | **Suspicious logins** | Logins from new geo/device, impossible travel, or odd hours. | Auth events vs. account baseline. | Notify; optionally challenge MFA / revoke session. |
| 2 | **Failed admin logins** | Repeated failed auth on admin accounts. | Threshold of failures per window. | Rate-limit, lock, alert admin, review for brute force. |
| 3 | **Bot traffic** | Automated, non-human request patterns. | Cloudflare bot scores, UA/heuristics. | WAF challenge/block; monitor for escalation. |
| 4 | **Rate-limit triggers** | Clients exceeding configured request rates. | Per-IP / per-account counters. | Throttle/block; correlate with scraping/DoS. |
| 5 | **Unusual API usage** | Anomalous endpoint/volume/parameter patterns. | Deviation from usage baseline. | Investigate; tighten limits; possible key rotation. |
| 6 | **File upload abuse** | Oversized, disallowed, or high-volume uploads. | `UPLOAD_MAX_MB`, MIME allow-list, upload rate. | Reject; quarantine; alert; review account. |
| 7 | **Scraping against HSI** | Systematic harvesting of public surfaces. | Crawl patterns, depth, velocity. | WAF rule; serve challenge; rate-limit. |
| 8 | **Admin permission changes** | Role grants/revokes and policy edits. | `user_roles` / policy changes in `audit_logs`. | Always alert + log; confirm authorized. |
| 9 | **Public site downtime** | Availability loss on public/dashboard surfaces. | Uptime checks / Sentry / Cloudflare. | Page on-call; follow incident runbook. |
| 10 | **Content tampering checks** | Integrity drift in evidence or published reports. | Hash mismatch vs. recorded chain-of-custody. | Freeze affected record; investigate; restore from backup. |

## Severity model

| Severity | Examples | SLA (target) |
| --- | --- | --- |
| Critical | Content tampering, admin compromise, evidence exposure, site down | Immediate page; respond < 15 min. |
| High | Brute-force on admin, upload abuse, unusual API spikes | Respond < 1 hour. |
| Medium | Scraping, sustained rate-limit trips, bot waves | Same business day. |
| Low | Isolated suspicious login, single rate-limit trip | Routine triage. |

## Data sources

- `security_events` (raw telemetry, append-only).
- `audit_logs` (privileged actions).
- Cloudflare (WAF, bot, rate-limit signals).
- Sentry / OpenTelemetry (errors, latency, availability).

## Operating notes

- Every alert links back to the originating `security_events` rows for traceability.
- Alerts are themselves auditable; acknowledgement and resolution are logged.
- Tune thresholds against observed baselines to limit false positives, but never
  disable monitoring for event types 8 (permission changes) or 10 (tampering).
