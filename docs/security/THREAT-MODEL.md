# HSI Threat Model

This threat model enumerates the assets HSI protects, the actors who may threaten
them, the principal threats, and the mitigations in place. It complements the
[Security Guide](README.md) and [Platform Security Monitor](PLATFORM-SECURITY-MONITOR.md).

---

## 1. Assets

| Asset | Why it matters |
| --- | --- |
| Raw evidence (captures, transcripts, uploads) | Sensitive source material; chain-of-custody integrity. |
| AI provenance records (`ai_runs`, `ai_trace_passages`) | Reproducibility and accountability of every claim. |
| Reviewer decisions (`reviews`, `audit_logs`) | Integrity of the human-in-the-loop process. |
| User accounts & roles | Privileged access to evidence and publishing. |
| Public reports | Platform credibility; must remain accurate and non-defamatory. |
| Secrets (service-role key, AI keys, `CRON_SECRET`) | Compromise grants broad access. |
| Platform availability | Public trust and continuity. |

## 2. Actors

| Actor | Motivation |
| --- | --- |
| External attacker | Steal evidence, deface site, exfiltrate data, DoS. |
| Automated bots / scrapers | Mass-scrape public surfaces, abuse forms, probe endpoints. |
| Malicious insider | Misuse privileged access; leak or tamper with evidence. |
| Compromised account | Hijacked reviewer/admin session or credentials. |
| Subjects of analysis | Attempt takedown abuse, intimidation, or counter-manipulation. |
| Supply-chain attacker | Compromise a dependency, AI provider, or CI pipeline. |

## 3. Threats and mitigations

| Threat | Vector | Mitigation |
| --- | --- | --- |
| Evidence exfiltration | Stolen key / broken access control | RLS, private buckets, service-role server-only, least privilege, audit logs. |
| Public exposure of private evidence | Misconfigured policy | No public read on evidence/uploads; publish-gate the only path to public. |
| Account takeover | Phishing, credential stuffing | MFA for admin/reviewer, rate limiting, suspicious-login monitoring, session revocation. |
| Privilege escalation | Policy gap / insider | Dual enforcement (RLS + app guards), admin-only role changes logged in `audit_logs`. |
| Evidence/report tampering | Insider or compromised account | Content hashes, chain-of-custody, append-only audit, content-tampering checks. |
| Bot abuse / scraping | Automated traffic | Cloudflare WAF, Turnstile, rate limits, bot-traffic monitoring. |
| Denial of service | Volumetric / app-layer | Cloudflare edge protection, WAF rate rules, downtime monitoring. |
| File-upload abuse | Malicious/oversized files | Signed URLs, MIME/extension allow-list, `UPLOAD_MAX_MB`, private storage. |
| Injection (SQL/XSS) | Untrusted input | Parameterized queries, output encoding, strict CSP. |
| Secret leakage | Misconfig / repo exposure | Env separation, no secrets in client, rotation policy, `.gitignore` hygiene. |
| Cron abuse | Forged worker calls | `CRON_SECRET` bearer required; reject unauthenticated. |
| Takedown / defamation abuse | Legal/social pressure | Neutral non-defamatory framing, correction/takedown process, evidence-backed claims only. |
| Supply-chain compromise | Dependency / provider | Pinned deps, lockfile, provider abstraction, monitoring of unusual API usage. |

## 4. Trust boundaries

```
[ Public internet ] → Cloudflare (WAF/Turnstile) → Vercel (apps/web) → Supabase (RLS)
                                                          │
                                                   [ CRON_SECRET ]
                                                          ▼
                                                   apps/worker → AI provider
```

- Crossing into Supabase always re-checks identity via RLS.
- The worker is trusted only when presenting `CRON_SECRET`.
- The AI provider is treated as an external, untrusted compute boundary; only
  public material and necessary context are sent, and outputs are reviewed.

## 5. Residual risk & review cadence

- Re-review this model on each major release and after any incident.
- Track open items against the hardening checklist in [`README.md`](README.md) §12.
