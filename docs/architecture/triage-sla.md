# Triage & SLA (HSI Phase 8)

**Triage** routes captured signals to the right human review with an explainable
rationale; **SLA** policies put deadlines on that review and define when an
unreviewed item escalates. Triage **never auto-publishes and never auto-acts** —
every output is a DRAFT/request for the governance pipeline, and every action
explains *why* it fired.

- Engine: [`@hsi/source-intelligence`](../../packages/source-intelligence)
  `triage/` (`evaluateTriage`, `DEFAULT_TRIAGE_RULES`) and `sla.ts`
  (`computeSlaDeadlines`, `slaStatus`, `DEFAULT_SLA_POLICIES`).
- Worker: [`apps/worker/jobs/triage-worker.ts`](../../apps/worker/jobs/triage-worker.ts).
- Schema: migration `0012` — `hsin_triage_rules`, `hsin_sla_policies`.

---

## Triage condition/action DSL

A rule is **data**: a set of conditions (ANDed) and the actions to request when
they all hold.

```ts
interface TriageCondition {
  field: 'risk_level' | 'drift_severity' | 'watchlist_match'
       | 'source_failures' | 'contradiction' | 'category' | 'confidence';
  op: 'gte' | 'lte' | 'eq' | 'in' | 'is_true';
  value: unknown;
}
interface TriageAction {
  type: 'create_alert' | 'submit_review' | 'assign_sla'
      | 'degrade_source_health' | 'request_research_review' | 'draft_research';
  params?: Record<string, unknown>;
}
```

`evaluateTriage(ctx, rules)` returns matched rule ids and a list of actions —
**each with a `rationale`** describing which conditions fired and with what
values (`Rule "X" fired for signal S because risk_level 0.8 ≥ 0.7. → create_alert.
This is a DRAFT/request for human review — not auto-actioned.`). Disabled rules
and rules with no conditions are skipped. Pure & deterministic — no clocks, no
randomness.

### `DEFAULT_TRIAGE_RULES`

| id | Conditions | Actions |
| --- | --- | --- |
| `tr_high_risk_signal` | `risk_level ≥ 0.7` | `create_alert(HIGH)`, `submit_review(high)` |
| `tr_high_drift` | `drift_severity ≥ 0.6` | `create_alert(HIGH)`, `assign_sla(HIGH)` |
| `tr_watchlist_match` | `watchlist_match is_true` | `create_alert(MEDIUM)` |
| `tr_source_failures` | `source_failures ≥ 3` | `degrade_source_health` |
| `tr_contradiction` | `contradiction is_true` | `request_research_review` |

Tune thresholds per deployment via `hsin_triage_rules`
(`conditions_json` / `actions_json`).

---

## SLA policies, deadlines & overdue states

```ts
interface SlaPolicy { name; severity; reviewDeadlineHours; escalationDeadlineHours }
```

`DEFAULT_SLA_POLICIES`:

| Severity | Review by | Escalate by |
| --- | --- | --- |
| CRITICAL | 2 h | 4 h |
| HIGH | 8 h | 24 h |
| MEDIUM | 48 h | 96 h |
| LOW | 168 h | 336 h |

`computeSlaDeadlines(policy, createdAt)` → `{ reviewDeadline, escalationDeadline }`
(pure date math, injected `createdAt`). `slaStatus(policy, createdAt, now,
reviewedAt?)` → one of:

```
created                review deadline        escalation deadline
   │                         │                        │
   ├── on_track ──► due_soon ─┤                        │
   │   (>4h to review) (≤4h)  │                        │
   │                          ├──── overdue_review ────┤
   │                          │                        ├──► overdue_escalation
   │                          │                        │
   └── reviewedAt ≤ reviewDeadline  ──► on_track (clock stops)
```

`DUE_SOON_HOURS = 4`. A completed review before the review deadline stops the
review clock. These deadlines drive **human** prioritization/escalation — they
never auto-action.

The triage worker computes and attaches these deadlines for every `assign_sla`
action using the policy matching the action's `severity`.

---

## Triage → alert → review → research flow

```
   signal/source facts (TriageContext: risk, drift, watchlist, failures, ...)
                                   │
                                   ▼
                          evaluateTriage(ctx, rules)
                                   │  matched rule ids + explainable actions
        ┌──────────────┬──────────┴───────────┬──────────────────────┐
        ▼              ▼                       ▼                      ▼
   create_alert   submit_review          assign_sla         request_research_review
   (AlertDraft)   (review queue)     (deadline + escalation)   (human research decision)
        │              │                       │                      │
        └──────────────┴───────────┬───────────┴──────────────────────┘
                                    ▼
                       HUMAN review / governance pipeline
                       (a person decides — nothing auto-publishes)
```

### Auto-routing setting (`auto_create_research_drafts`, default **false**)

The worker reads `SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS` (default `false`):

- **false (default)** — any `draft_research` action is **downgraded** to
  `request_research_review`. A human is asked whether to draft research; the
  worker never drafts automatically.
- **true (opt-in)** — `draft_research` actions are emitted as **drafts** for
  review. Even then, **nothing is auto-published** — drafts always pass through
  human review/governance.

This guard is binding: triage is a router and prioritizer, not a publisher.
