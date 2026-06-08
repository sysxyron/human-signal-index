# Source Monitoring in Production (HSI Phase 8)

How to enable live source capture **safely and ethically**. The default mode is
offline fixtures; live capture is opt-in, PUBLIC-ONLY, and rate-limited.

---

## Ethics principles (binding)

The signal-intelligence engine monitors **PUBLIC narratives, ideologies and
movements** for research and governance. It is **not** a surveillance tool for
private people. Every capture is guarded by `assertPublicCapturePolicy`.

1. **PUBLIC information only.** We capture content that is openly published to
   the public web.
2. **No login bypass.** We never authenticate, never use cookies/sessions to
   reach gated content, never bypass paywalls.
3. **No private communities.** No private forums, DMs, closed groups, or
   member-only areas.
4. **No private-individual scraping / no doxxing / no harassment.** We track
   PUBLIC narratives, not private persons' data. Extracted entities are
   movements/orgs/ideologies/publications/platforms — proper-noun candidates are
   surfaced for human review, with an `unknown` type preserving doubt.
5. **Drafts only.** Capture produces DRAFT signals + explainable alerts; nothing
   is auto-published or auto-actioned. A human decides.

---

## Enabling the scheduler + capture mode

Capture defaults to **fixture** (offline, deterministic). Promote to live only
after configuring limits and credentials.

```ini
# Off by default — flip deliberately, in this order:
SIGNAL_CAPTURE_MODE=live          # fixture → live (real PUBLIC network capture)
SCHEDULER_ENABLED=true            # allow scheduler rules to fire
QUEUE_WORKER_ENABLED=true         # allow the queue to drain

# Polite-citizen capture limits (apply in live mode):
SIGNAL_CAPTURE_USER_AGENT=HumanSignalIndexBot/0.1   # identify the bot honestly
SIGNAL_CAPTURE_TIMEOUT_MS=12000                      # per-request timeout
SIGNAL_CAPTURE_MAX_BYTES=2000000                     # cap response size (~2 MB)

# Queue / retry tuning:
SIGNAL_QUEUE_BATCH_SIZE=10
SIGNAL_JOB_MAX_ATTEMPTS=3
SIGNAL_BACKOFF_BASE_SECONDS=60

# Triage routing — NEVER auto-publishes:
SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS=false
```

**Recommended rollout:** keep `SIGNAL_CAPTURE_MODE=fixture` while you validate
the scheduler + queue end-to-end (deterministic, no network), then flip to
`live` for a small, vetted set of sources before scaling.

---

## robots.txt & terms of service

- **Respect `robots.txt`.** Do not fetch paths disallowed for your user-agent.
- **Respect site terms.** If a site forbids automated access, don't capture it.
- **Identify honestly.** `SIGNAL_CAPTURE_USER_AGENT` must be a truthful,
  contactable bot identity — never impersonate a browser to evade controls.
- **Prefer official feeds/APIs** (RSS, YouTube Data API, Podcast Index) over
  HTML scraping where available.

---

## User-agent, timeout, max-bytes & rate limiting

| Control | Env | Purpose |
| --- | --- | --- |
| User-agent | `SIGNAL_CAPTURE_USER_AGENT` | Honest bot identity on every request. |
| Timeout | `SIGNAL_CAPTURE_TIMEOUT_MS` | Bound per-request time; abort slow hosts. |
| Max bytes | `SIGNAL_CAPTURE_MAX_BYTES` | Stop reading oversized responses. |
| Rate limits | `hsin_provider_rate_limits` | Per-provider window/quota tracking. |
| Backoff | `SIGNAL_BACKOFF_BASE_SECONDS` + per-source backoff | Widen delays for flaky/erroring sources. |

Per-source cadence (`hourly`/`daily`) gates how often a source is due. The
per-source backoff multiplier (`1 + failureCount`) automatically slows down
sources that keep failing, and the `tr_source_failures` triage rule degrades
source health after 3 consecutive failures — so an unhealthy or hostile source
backs off instead of being hammered.

Provider quotas (YouTube, Podcast Index, …) live in `hsin_provider_accounts`
(enabled + config) and `hsin_provider_rate_limits` (window, max, remaining,
reset_at). The worker checks remaining quota before a live call and defers the
job when exhausted. See
[scheduler-queue](../architecture/scheduler-queue.md) and
[scheduler-worker-deployment](../deployment/scheduler-worker-deployment.md).

---

## Safety checklist before going live

- [ ] Source list reviewed by a human — PUBLIC only, no gated/private content.
- [ ] `robots.txt` / terms checked for each source.
- [ ] Honest `SIGNAL_CAPTURE_USER_AGENT` set.
- [ ] Timeout + max-bytes set to sane values.
- [ ] Provider keys + rate limits configured for any API providers.
- [ ] `SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS=false` (unless deliberately opted in).
- [ ] Reviewers ready: every signal/alert is a DRAFT pending human review.
